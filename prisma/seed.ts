import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcryptjs';
import {
  ApprovalDecision,
  PrismaClient,
  PurchaseRequestStatus,
  Role,
} from '../src/generated/prisma/client';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

// O seed é sempre executado do zero: mais simples de raciocinar (e de
// manter) do que tentar mesclar com dados que já existiam. A ordem de
// limpeza aqui é a mesma usada em test/helpers/reset-db.ts — precisa
// desfazer a referência cruzada de selectedQuoteId antes de apagar Quote,
// e apagar filhos antes de pais, respeitando cada FK.
async function resetDatabase() {
  await prisma.purchaseRequest.updateMany({ data: { selectedQuoteId: null } });
  await prisma.purchaseRequestStatusHistory.deleteMany();
  await prisma.approval.deleteMany();
  await prisma.quote.deleteMany();
  await prisma.purchaseItem.deleteMany();
  await prisma.purchaseRequest.deleteMany();
  await prisma.supplier.deleteMany();
  await prisma.user.deleteMany();
  await prisma.department.deleteMany();
}

function daysAgo(days: number, hour = 9): Date {
  const date = new Date();
  date.setDate(date.getDate() - days);
  date.setHours(hour, 0, 0, 0);
  return date;
}

async function createUser(email: string, name: string, role: Role, departmentId: number) {
  const password = await bcrypt.hash('senha123', 10);
  return prisma.user.create({ data: { email, name, role, password, departmentId } });
}

async function createSupplier(input: {
  document: string;
  legalName: string;
  tradeName: string;
  city: string;
  state: string;
  zipCode: string;
  street: string;
}) {
  return prisma.supplier.create({
    data: {
      ...input,
      email: `contato@${input.tradeName.toLowerCase().replace(/\s+/g, '')}.com.br`,
      phone: '(11) 4002-8922',
      federalRegistrationStatus: 'ATIVA',
    },
  });
}

async function recordTransition(
  purchaseRequestId: number,
  fromStatus: PurchaseRequestStatus | null,
  toStatus: PurchaseRequestStatus,
  changedByUserId: number,
  changedAt: Date,
  note?: string,
) {
  await prisma.purchaseRequestStatusHistory.create({
    data: { purchaseRequestId, fromStatus, toStatus, changedByUserId, changedAt, note },
  });
}

interface ItemInput {
  description: string;
  quantity: number;
  unit: string;
  estimatedUnitPrice?: number;
}

// Cria a solicitação já em DRAFT. As demais funções (submit, quote, select,
// decide, complete, cancel) avançam essa mesma solicitação de estado em
// estado, gravando o histórico com uma data plausível — assim o "Histórico
// de status" da UI mostra uma linha do tempo que faz sentido (submetida
// dias depois de criada, aprovada dias depois de submetida etc.), em vez de
// tudo cravado no mesmo segundo.
async function createDraft(opts: {
  requesterId: number;
  departmentId: number;
  title: string;
  justification: string;
  items: ItemInput[];
  createdAt: Date;
}) {
  return prisma.purchaseRequest.create({
    data: {
      requesterId: opts.requesterId,
      departmentId: opts.departmentId,
      title: opts.title,
      justification: opts.justification,
      status: 'DRAFT',
      createdAt: opts.createdAt,
      items: { create: opts.items },
    },
  });
}

async function submit(prId: number, requesterId: number, at: Date) {
  await prisma.purchaseRequest.update({
    where: { id: prId },
    data: { status: 'SUBMITTED', submittedAt: at },
  });
  await recordTransition(prId, 'DRAFT', 'SUBMITTED', requesterId, at);
}

async function addQuote(opts: {
  purchaseRequestId: number;
  supplierId: number;
  buyerId: number;
  totalValue: number;
  notes?: string;
  createdAt: Date;
  movesToQuotation: boolean;
}) {
  const quote = await prisma.quote.create({
    data: {
      purchaseRequestId: opts.purchaseRequestId,
      supplierId: opts.supplierId,
      createdByUserId: opts.buyerId,
      totalValue: opts.totalValue,
      notes: opts.notes,
      createdAt: opts.createdAt,
    },
  });
  if (opts.movesToQuotation) {
    await prisma.purchaseRequest.update({
      where: { id: opts.purchaseRequestId },
      data: { status: 'IN_QUOTATION' },
    });
    await recordTransition(opts.purchaseRequestId, 'SUBMITTED', 'IN_QUOTATION', opts.buyerId, opts.createdAt);
  }
  return quote;
}

async function selectWinningQuote(opts: {
  purchaseRequestId: number;
  quoteId: number;
  otherQuoteIds: number[];
  buyerId: number;
  at: Date;
}) {
  if (opts.otherQuoteIds.length > 0) {
    await prisma.quote.updateMany({
      where: { id: { in: opts.otherQuoteIds } },
      data: { status: 'DISCARDED' },
    });
  }
  await prisma.quote.update({ where: { id: opts.quoteId }, data: { status: 'SELECTED' } });
  await prisma.purchaseRequest.update({
    where: { id: opts.purchaseRequestId },
    data: { status: 'PENDING_APPROVAL', selectedQuoteId: opts.quoteId },
  });
  await recordTransition(opts.purchaseRequestId, 'IN_QUOTATION', 'PENDING_APPROVAL', opts.buyerId, opts.at);
}

async function decide(opts: {
  purchaseRequestId: number;
  approverId: number;
  decision: ApprovalDecision;
  comment?: string;
  at: Date;
}) {
  await prisma.approval.create({
    data: {
      purchaseRequestId: opts.purchaseRequestId,
      approverId: opts.approverId,
      decision: opts.decision,
      comment: opts.comment,
      decidedAt: opts.at,
    },
  });
  await prisma.purchaseRequest.update({
    where: { id: opts.purchaseRequestId },
    data: { status: opts.decision, decidedAt: opts.at },
  });
  await recordTransition(opts.purchaseRequestId, 'PENDING_APPROVAL', opts.decision, opts.approverId, opts.at, opts.comment);
}

async function complete(prId: number, buyerId: number, at: Date) {
  await prisma.purchaseRequest.update({
    where: { id: prId },
    data: { status: 'COMPLETED', completedAt: at },
  });
  await recordTransition(prId, 'APPROVED', 'COMPLETED', buyerId, at);
}

async function cancel(prId: number, from: PurchaseRequestStatus, userId: number, at: Date) {
  await prisma.purchaseRequest.update({
    where: { id: prId },
    data: { status: 'CANCELLED', cancelledAt: at },
  });
  await recordTransition(prId, from, 'CANCELLED', userId, at);
}

async function main() {
  await resetDatabase();

  // --- Departamentos ---
  const deptTI = await prisma.department.create({ data: { name: 'Tecnologia' } });
  const deptCompras = await prisma.department.create({ data: { name: 'Compras' } });
  const deptFinanceiro = await prisma.department.create({ data: { name: 'Financeiro' } });
  const deptRH = await prisma.department.create({ data: { name: 'Recursos Humanos' } });
  const deptMarketing = await prisma.department.create({ data: { name: 'Marketing' } });

  // --- Usuários (senha "senha123" para todos) ---
  const admin = await createUser('admin@compras.com', 'Administrador', 'ADMIN', deptTI.id);
  const buyer = await createUser('comprador@compras.com', 'Comprador', 'BUYER', deptCompras.id);
  const buyer2 = await createUser('comprador2@compras.com', 'Segunda Compradora', 'BUYER', deptCompras.id);
  const approver = await createUser('aprovador@compras.com', 'Aprovador', 'APPROVER', deptFinanceiro.id);
  const approver2 = await createUser('aprovador2@compras.com', 'Segunda Aprovadora', 'APPROVER', deptFinanceiro.id);
  const requester = await createUser('solicitante@compras.com', 'Solicitante', 'REQUESTER', deptTI.id);
  const requester2 = await createUser('solicitante2@compras.com', 'Segundo Solicitante', 'REQUESTER', deptTI.id);
  const requester3 = await createUser('solicitante3@compras.com', 'Solicitante de Marketing', 'REQUESTER', deptMarketing.id);
  const requester4 = await createUser('solicitante4@compras.com', 'Solicitante de RH', 'REQUESTER', deptRH.id);

  // --- Fornecedores ---
  const supplierAlfa = await createSupplier({
    document: '19131243000197',
    legalName: 'Open Knowledge Brasil',
    tradeName: 'Fornecedor Alfa',
    city: 'São Paulo',
    state: 'SP',
    zipCode: '01311902',
    street: 'Avenida Paulista, 37',
  });
  const supplierBeta = await createSupplier({
    document: '11222333000181',
    legalName: 'Fornecedor Beta LTDA',
    tradeName: 'Fornecedor Beta',
    city: 'Rio de Janeiro',
    state: 'RJ',
    zipCode: '20040020',
    street: 'Rua da Assembleia, 100',
  });
  const supplierMoveis = await createSupplier({
    document: '22333444000155',
    legalName: 'Móveis Corporativos SA',
    tradeName: 'MoveisCorp',
    city: 'São Paulo',
    state: 'SP',
    zipCode: '04578000',
    street: 'Avenida Faria Lima, 1500',
  });
  const supplierPapelaria = await createSupplier({
    document: '33444555000122',
    legalName: 'Distribuidora de Papelaria Central LTDA',
    tradeName: 'Papelaria Central',
    city: 'Belo Horizonte',
    state: 'MG',
    zipCode: '30130010',
    street: 'Rua da Bahia, 800',
  });
  const supplierTech = await createSupplier({
    document: '44555666000199',
    legalName: 'TechSupply Distribuidora de Equipamentos LTDA',
    tradeName: 'TechSupply',
    city: 'Campinas',
    state: 'SP',
    zipCode: '13010000',
    street: 'Avenida Iguatemi, 200',
  });
  const supplierMarketing = await createSupplier({
    document: '55666777000144',
    legalName: 'Marketing Digital Solutions LTDA',
    tradeName: 'MK Digital',
    city: 'Porto Alegre',
    state: 'RS',
    zipCode: '90010000',
    street: 'Avenida Borges de Medeiros, 400',
  });

  // ===================================================================
  // Solicitações de compra — uma para cada estado do ciclo de vida, com
  // datas espalhadas ao longo de ~40 dias para o histórico parecer real.
  // ===================================================================

  // 1) DRAFT simples, pronta para o solicitante submeter ao vivo na demo.
  await createDraft({
    requesterId: requester.id,
    departmentId: deptTI.id,
    title: 'Cadeiras ergonômicas para o escritório',
    justification: 'Diversas solicitações de ajuste ergonômico da equipe nos últimos meses.',
    items: [{ description: 'Cadeira ergonômica ajustável', quantity: 10, unit: 'unidade', estimatedUnitPrice: 1200 }],
    createdAt: daysAgo(1),
  });

  // 2) DRAFT com múltiplos itens.
  await createDraft({
    requesterId: requester3.id,
    departmentId: deptMarketing.id,
    title: 'Monitores adicionais para home office',
    justification: 'Equipe de marketing trabalhando em regime híbrido precisa de um segundo monitor.',
    items: [
      { description: 'Monitor 27" IPS', quantity: 6, unit: 'unidade', estimatedUnitPrice: 980 },
      { description: 'Suporte articulado de mesa', quantity: 6, unit: 'unidade', estimatedUnitPrice: 150 },
    ],
    createdAt: daysAgo(2),
  });

  // 3) DRAFT sem preço estimado em nenhum item (testa o "—" na UI).
  await createDraft({
    requesterId: requester4.id,
    departmentId: deptRH.id,
    title: 'Material de papelaria trimestral',
    justification: 'Reposição de estoque de material de escritório do departamento de RH.',
    items: [
      { description: 'Resma de papel A4', quantity: 50, unit: 'unidade' },
      { description: 'Caneta esferográfica azul', quantity: 200, unit: 'unidade' },
    ],
    createdAt: daysAgo(3),
  });

  // 4) SUBMITTED, aguardando o comprador registrar a primeira cotação.
  {
    const pr = await createDraft({
      requesterId: requester2.id,
      departmentId: deptTI.id,
      title: 'Ar condicionado para sala de reuniões',
      justification: 'Sala de reuniões principal sem climatização adequada para o verão.',
      items: [{ description: 'Ar condicionado split 18000 BTUs', quantity: 2, unit: 'unidade', estimatedUnitPrice: 3200 }],
      createdAt: daysAgo(10),
    });
    await submit(pr.id, requester2.id, daysAgo(9));
  }

  // 5) SUBMITTED, item de serviço (sem unidade "unidade").
  {
    const pr = await createDraft({
      requesterId: requester4.id,
      departmentId: deptRH.id,
      title: 'Impressora multifuncional para RH',
      justification: 'Impressora atual do setor quebrou e o conserto não compensa financeiramente.',
      items: [{ description: 'Impressora multifuncional laser colorida', quantity: 1, unit: 'unidade', estimatedUnitPrice: 4200 }],
      createdAt: daysAgo(6),
    });
    await submit(pr.id, requester4.id, daysAgo(5));
  }

  // 6) IN_QUOTATION com duas cotações concorrentes ainda sem vencedora —
  // pronta para o comprador "Selecionar vencedora" ao vivo na demo.
  {
    const pr = await createDraft({
      requesterId: requester.id,
      departmentId: deptTI.id,
      title: 'Renovação de licenças de antivírus',
      justification: 'Licenças corporativas de antivírus vencem no fim do mês.',
      items: [{ description: 'Licença antivírus corporativo (anual)', quantity: 80, unit: 'licença', estimatedUnitPrice: 45 }],
      createdAt: daysAgo(14),
    });
    await submit(pr.id, requester.id, daysAgo(13));
    await addQuote({
      purchaseRequestId: pr.id,
      supplierId: supplierTech.id,
      buyerId: buyer.id,
      totalValue: 3800,
      notes: 'Inclui suporte técnico 24/7.',
      createdAt: daysAgo(12),
      movesToQuotation: true,
    });
    await addQuote({
      purchaseRequestId: pr.id,
      supplierId: supplierAlfa.id,
      buyerId: buyer.id,
      totalValue: 3600,
      notes: 'Sem suporte técnico incluso.',
      createdAt: daysAgo(11),
      movesToQuotation: false,
    });
  }

  // 7) IN_QUOTATION com uma única cotação recebida.
  {
    const pr = await createDraft({
      requesterId: requester2.id,
      departmentId: deptTI.id,
      title: 'Servidor de backup',
      justification: 'Necessidade de redundância para os backups diários do sistema de compras.',
      items: [{ description: 'Servidor rack com 8TB de armazenamento', quantity: 1, unit: 'unidade', estimatedUnitPrice: 18000 }],
      createdAt: daysAgo(8),
    });
    await submit(pr.id, requester2.id, daysAgo(7));
    await addQuote({
      purchaseRequestId: pr.id,
      supplierId: supplierTech.id,
      buyerId: buyer2.id,
      totalValue: 17500,
      createdAt: daysAgo(6),
      movesToQuotation: true,
    });
  }

  // 8) PENDING_APPROVAL, pronta para o aprovador decidir ao vivo na demo.
  {
    const pr = await createDraft({
      requesterId: requester2.id,
      departmentId: deptTI.id,
      title: 'Licenças de software de design',
      justification: 'Equipe de design precisa de licenças adicionais para o novo projeto.',
      items: [{ description: 'Licença Adobe Creative Cloud (anual)', quantity: 3, unit: 'licença' }],
      createdAt: daysAgo(5),
    });
    await submit(pr.id, requester2.id, daysAgo(5));
    const quote = await addQuote({
      purchaseRequestId: pr.id,
      supplierId: supplierAlfa.id,
      buyerId: buyer.id,
      totalValue: 5400,
      createdAt: daysAgo(4),
      movesToQuotation: true,
    });
    await selectWinningQuote({
      purchaseRequestId: pr.id,
      quoteId: quote.id,
      otherQuoteIds: [],
      buyerId: buyer.id,
      at: daysAgo(3),
    });
  }

  // 9) PENDING_APPROVAL de outro departamento/aprovador.
  {
    const pr = await createDraft({
      requesterId: requester3.id,
      departmentId: deptMarketing.id,
      title: 'Campanha de marketing digital Q1',
      justification: 'Contratação de agência para impulsionar campanhas pagas no primeiro trimestre.',
      items: [{ description: 'Pacote de gestão de mídia paga (3 meses)', quantity: 1, unit: 'serviço', estimatedUnitPrice: 15000 }],
      createdAt: daysAgo(9),
    });
    await submit(pr.id, requester3.id, daysAgo(8));
    const quote = await addQuote({
      purchaseRequestId: pr.id,
      supplierId: supplierMarketing.id,
      buyerId: buyer2.id,
      totalValue: 14200,
      notes: 'Inclui relatórios semanais de performance.',
      createdAt: daysAgo(7),
      movesToQuotation: true,
    });
    await selectWinningQuote({
      purchaseRequestId: pr.id,
      quoteId: quote.id,
      otherQuoteIds: [],
      buyerId: buyer2.id,
      at: daysAgo(6),
    });
  }

  // 10) APPROVED, pronta para o comprador "Concluir compra" ao vivo na demo.
  {
    const pr = await createDraft({
      requesterId: requester4.id,
      departmentId: deptRH.id,
      title: 'Cadeiras para sala de treinamento',
      justification: 'Nova sala de treinamento precisa de mobiliário adequado para 20 pessoas.',
      items: [{ description: 'Cadeira empilhável com prancheta', quantity: 20, unit: 'unidade', estimatedUnitPrice: 350 }],
      createdAt: daysAgo(15),
    });
    await submit(pr.id, requester4.id, daysAgo(14));
    const quote = await addQuote({
      purchaseRequestId: pr.id,
      supplierId: supplierMoveis.id,
      buyerId: buyer.id,
      totalValue: 6800,
      createdAt: daysAgo(13),
      movesToQuotation: true,
    });
    await selectWinningQuote({
      purchaseRequestId: pr.id,
      quoteId: quote.id,
      otherQuoteIds: [],
      buyerId: buyer.id,
      at: daysAgo(12),
    });
    await decide({
      purchaseRequestId: pr.id,
      approverId: approver2.id,
      decision: 'APPROVED',
      comment: 'Aprovado — dentro do orçamento previsto para treinamentos.',
      at: daysAgo(10),
    });
  }

  // 11) REJECTED — estado terminal negativo, ainda pouco representado.
  {
    const pr = await createDraft({
      requesterId: requester3.id,
      departmentId: deptMarketing.id,
      title: 'Compra de tablets para equipe externa',
      justification: 'Equipe de campo precisa de tablets para apresentações em clientes.',
      items: [{ description: 'Tablet 11" com capa protetora', quantity: 8, unit: 'unidade', estimatedUnitPrice: 2800 }],
      createdAt: daysAgo(20),
    });
    await submit(pr.id, requester3.id, daysAgo(19));
    const quote = await addQuote({
      purchaseRequestId: pr.id,
      supplierId: supplierTech.id,
      buyerId: buyer2.id,
      totalValue: 22400,
      createdAt: daysAgo(18),
      movesToQuotation: true,
    });
    await selectWinningQuote({
      purchaseRequestId: pr.id,
      quoteId: quote.id,
      otherQuoteIds: [],
      buyerId: buyer2.id,
      at: daysAgo(17),
    });
    await decide({
      purchaseRequestId: pr.id,
      approverId: approver.id,
      decision: 'REJECTED',
      comment: 'Orçamento do trimestre para equipamentos móveis já foi integralmente utilizado.',
      at: daysAgo(15),
    });
  }

  // 12) COMPLETED — fluxo integral do DRAFT ao COMPLETED (histórico completo).
  {
    const pr = await createDraft({
      requesterId: requester.id,
      departmentId: deptTI.id,
      title: 'Renovação de notebooks do time de TI',
      justification: 'Equipamentos atuais têm mais de 5 anos e apresentam falhas recorrentes.',
      items: [{ description: 'Notebook Dell Inspiron 15', quantity: 5, unit: 'unidade', estimatedUnitPrice: 4500 }],
      createdAt: daysAgo(30),
    });
    await submit(pr.id, requester.id, daysAgo(29));
    const quote1 = await addQuote({
      purchaseRequestId: pr.id,
      supplierId: supplierAlfa.id,
      buyerId: buyer.id,
      totalValue: 22000,
      notes: 'Prazo de entrega de 10 dias úteis.',
      createdAt: daysAgo(28),
      movesToQuotation: true,
    });
    const quote2 = await addQuote({
      purchaseRequestId: pr.id,
      supplierId: supplierBeta.id,
      buyerId: buyer.id,
      totalValue: 21500,
      notes: 'Prazo de entrega de 15 dias úteis.',
      createdAt: daysAgo(27),
      movesToQuotation: false,
    });
    await selectWinningQuote({
      purchaseRequestId: pr.id,
      quoteId: quote2.id,
      otherQuoteIds: [quote1.id],
      buyerId: buyer.id,
      at: daysAgo(26),
    });
    await decide({
      purchaseRequestId: pr.id,
      approverId: approver.id,
      decision: 'APPROVED',
      comment: 'Aprovado dentro do orçamento do trimestre.',
      at: daysAgo(24),
    });
    await complete(pr.id, buyer.id, daysAgo(20));
  }

  // 13) COMPLETED — segundo caso concluído, para a listagem não ter só um.
  {
    const pr = await createDraft({
      requesterId: requester4.id,
      departmentId: deptRH.id,
      title: 'Cadeiras de escritório para novo andar',
      justification: 'Mudança de andar exigiu mobiliário completo para 15 novas posições de trabalho.',
      items: [{ description: 'Cadeira de escritório com apoio lombar', quantity: 15, unit: 'unidade', estimatedUnitPrice: 890 }],
      createdAt: daysAgo(40),
    });
    await submit(pr.id, requester4.id, daysAgo(39));
    const quote = await addQuote({
      purchaseRequestId: pr.id,
      supplierId: supplierMoveis.id,
      buyerId: buyer.id,
      totalValue: 12500,
      createdAt: daysAgo(38),
      movesToQuotation: true,
    });
    await selectWinningQuote({
      purchaseRequestId: pr.id,
      quoteId: quote.id,
      otherQuoteIds: [],
      buyerId: buyer.id,
      at: daysAgo(37),
    });
    await decide({
      purchaseRequestId: pr.id,
      approverId: approver2.id,
      decision: 'APPROVED',
      comment: 'Aprovado — mudança de andar já orçada para este trimestre.',
      at: daysAgo(35),
    });
    await complete(pr.id, buyer.id, daysAgo(30));
  }

  // 14) CANCELLED a partir de DRAFT (nunca chegou a ser submetida).
  {
    const pr = await createDraft({
      requesterId: requester3.id,
      departmentId: deptMarketing.id,
      title: 'Assinatura de ferramenta de design descontinuada',
      justification: 'Ferramenta seria usada em projeto que acabou não avançando.',
      items: [{ description: 'Assinatura anual de ferramenta de design', quantity: 1, unit: 'licença', estimatedUnitPrice: 2000 }],
      createdAt: daysAgo(25),
    });
    await cancel(pr.id, 'DRAFT', requester3.id, daysAgo(24));
  }

  // 15) CANCELLED a partir de IN_QUOTATION (desistência no meio do processo).
  {
    const pr = await createDraft({
      requesterId: requester2.id,
      departmentId: deptTI.id,
      title: 'Câmeras de segurança para o escritório',
      justification: 'Reforço de segurança solicitado após ronda de vistoria predial.',
      items: [{ description: 'Câmera IP externa com visão noturna', quantity: 6, unit: 'unidade', estimatedUnitPrice: 650 }],
      createdAt: daysAgo(22),
    });
    await submit(pr.id, requester2.id, daysAgo(21));
    await addQuote({
      purchaseRequestId: pr.id,
      supplierId: supplierTech.id,
      buyerId: buyer2.id,
      totalValue: 4100,
      createdAt: daysAgo(20),
      movesToQuotation: true,
    });
    await cancel(pr.id, 'IN_QUOTATION', requester2.id, daysAgo(18));
  }

  console.log('Seed aplicado com sucesso.');
  console.log('- 5 departamentos, 9 usuários (senha "senha123" para todos)');
  console.log('- 6 fornecedores');
  console.log('- 15 solicitações cobrindo todos os status: 3 DRAFT, 2 SUBMITTED, 2 IN_QUOTATION,');
  console.log('  2 PENDING_APPROVAL, 1 APPROVED, 1 REJECTED, 2 COMPLETED, 2 CANCELLED');
  console.log(
    `ADMIN: ${admin.email} | BUYER: ${buyer.email} / ${buyer2.email} | APPROVER: ${approver.email} / ${approver2.email}`,
  );
  console.log(`REQUESTER: ${requester.email} / ${requester2.email} / ${requester3.email} / ${requester4.email}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
