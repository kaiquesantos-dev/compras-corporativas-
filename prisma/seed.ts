import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcryptjs';
import { PrismaClient, PurchaseRequestStatus, Role } from '../src/generated/prisma/client';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function upsertUser(email: string, name: string, role: Role, departmentId: number) {
  const password = await bcrypt.hash('senha123', 10);
  return prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, name, role, password, departmentId },
  });
}

async function upsertSupplier(
  document: string,
  legalName: string,
  tradeName: string,
  city: string,
  state: string,
) {
  return prisma.supplier.upsert({
    where: { document },
    update: {},
    create: {
      document,
      legalName,
      tradeName,
      email: `contato@${tradeName.toLowerCase().replace(/\s+/g, '')}.com.br`,
      phone: '(11) 4002-8922',
      zipCode: '01311902',
      street: 'Avenida Paulista, 37',
      city,
      state,
      federalRegistrationStatus: 'ATIVA',
    },
  });
}

async function recordTransition(
  purchaseRequestId: number,
  fromStatus: PurchaseRequestStatus,
  toStatus: PurchaseRequestStatus,
  changedByUserId: number,
  note?: string,
) {
  await prisma.purchaseRequestStatusHistory.create({
    data: { purchaseRequestId, fromStatus, toStatus, changedByUserId, note },
  });
}

async function main() {
  const departmentTI = await prisma.department.upsert({
    where: { name: 'Tecnologia' },
    update: {},
    create: { name: 'Tecnologia' },
  });
  const departmentCompras = await prisma.department.upsert({
    where: { name: 'Compras' },
    update: {},
    create: { name: 'Compras' },
  });

  const admin = await upsertUser('admin@compras.com', 'Administrador', 'ADMIN', departmentTI.id);
  const buyer = await upsertUser('comprador@compras.com', 'Comprador', 'BUYER', departmentCompras.id);
  const approver = await upsertUser('aprovador@compras.com', 'Aprovador', 'APPROVER', departmentCompras.id);
  const requester = await upsertUser('solicitante@compras.com', 'Solicitante', 'REQUESTER', departmentTI.id);
  const requester2 = await upsertUser(
    'solicitante2@compras.com',
    'Segundo Solicitante',
    'REQUESTER',
    departmentTI.id,
  );

  const supplierA = await upsertSupplier(
    '19131243000197',
    'Open Knowledge Brasil',
    'Fornecedor Alfa',
    'São Paulo',
    'SP',
  );
  const supplierB = await upsertSupplier(
    '11222333000181',
    'Fornecedor Beta LTDA',
    'Fornecedor Beta',
    'Rio de Janeiro',
    'RJ',
  );

  const alreadySeeded = await prisma.purchaseRequest.findFirst({
    where: { title: 'Renovação de notebooks do time de TI' },
  });

  if (alreadySeeded) {
    console.log('Dados de demonstração já existem — pulando criação de solicitações de exemplo.');
  } else {
    // Demo 1: fluxo completo, do DRAFT ao COMPLETED, com histórico integral.
    const prCompleted = await prisma.purchaseRequest.create({
      data: {
        requesterId: requester.id,
        departmentId: departmentTI.id,
        title: 'Renovação de notebooks do time de TI',
        justification: 'Equipamentos atuais têm mais de 5 anos e apresentam falhas recorrentes.',
        status: 'DRAFT',
        items: {
          create: [
            {
              description: 'Notebook Dell Inspiron 15',
              quantity: 5,
              unit: 'unidade',
              estimatedUnitPrice: 4500,
            },
          ],
        },
      },
    });

    await prisma.purchaseRequest.update({
      where: { id: prCompleted.id },
      data: { status: 'SUBMITTED', submittedAt: new Date() },
    });
    await recordTransition(prCompleted.id, 'DRAFT', 'SUBMITTED', requester.id);

    const quote1 = await prisma.quote.create({
      data: {
        purchaseRequestId: prCompleted.id,
        supplierId: supplierA.id,
        createdByUserId: buyer.id,
        totalValue: 22000,
        notes: 'Prazo de entrega de 10 dias úteis.',
      },
    });
    const quote2 = await prisma.quote.create({
      data: {
        purchaseRequestId: prCompleted.id,
        supplierId: supplierB.id,
        createdByUserId: buyer.id,
        totalValue: 21500,
        notes: 'Prazo de entrega de 15 dias úteis.',
      },
    });
    await prisma.purchaseRequest.update({
      where: { id: prCompleted.id },
      data: { status: 'IN_QUOTATION' },
    });
    await recordTransition(prCompleted.id, 'SUBMITTED', 'IN_QUOTATION', buyer.id);

    await prisma.quote.update({ where: { id: quote1.id }, data: { status: 'DISCARDED' } });
    await prisma.quote.update({ where: { id: quote2.id }, data: { status: 'SELECTED' } });
    await prisma.purchaseRequest.update({
      where: { id: prCompleted.id },
      data: { status: 'PENDING_APPROVAL', selectedQuoteId: quote2.id },
    });
    await recordTransition(prCompleted.id, 'IN_QUOTATION', 'PENDING_APPROVAL', buyer.id);

    await prisma.approval.create({
      data: {
        purchaseRequestId: prCompleted.id,
        approverId: approver.id,
        decision: 'APPROVED',
        comment: 'Aprovado dentro do orçamento do trimestre.',
      },
    });
    await prisma.purchaseRequest.update({
      where: { id: prCompleted.id },
      data: { status: 'APPROVED', decidedAt: new Date() },
    });
    await recordTransition(prCompleted.id, 'PENDING_APPROVAL', 'APPROVED', approver.id);

    await prisma.purchaseRequest.update({
      where: { id: prCompleted.id },
      data: { status: 'COMPLETED', completedAt: new Date() },
    });
    await recordTransition(prCompleted.id, 'APPROVED', 'COMPLETED', buyer.id);

    // Demo 2: parado em PENDING_APPROVAL, pronto para o aprovador decidir ao vivo.
    const prPendingApproval = await prisma.purchaseRequest.create({
      data: {
        requesterId: requester2.id,
        departmentId: departmentTI.id,
        title: 'Licenças de software de design',
        justification: 'Equipe de design precisa de licenças adicionais para o novo projeto.',
        status: 'SUBMITTED',
        submittedAt: new Date(),
        items: {
          create: [{ description: 'Licença Adobe Creative Cloud (anual)', quantity: 3, unit: 'licença' }],
        },
      },
    });
    await recordTransition(prPendingApproval.id, 'DRAFT', 'SUBMITTED', requester2.id);

    const quote3 = await prisma.quote.create({
      data: {
        purchaseRequestId: prPendingApproval.id,
        supplierId: supplierA.id,
        createdByUserId: buyer.id,
        totalValue: 5400,
      },
    });
    await prisma.purchaseRequest.update({
      where: { id: prPendingApproval.id },
      data: { status: 'IN_QUOTATION' },
    });
    await recordTransition(prPendingApproval.id, 'SUBMITTED', 'IN_QUOTATION', buyer.id);

    await prisma.quote.update({ where: { id: quote3.id }, data: { status: 'SELECTED' } });
    await prisma.purchaseRequest.update({
      where: { id: prPendingApproval.id },
      data: { status: 'PENDING_APPROVAL', selectedQuoteId: quote3.id },
    });
    await recordTransition(prPendingApproval.id, 'IN_QUOTATION', 'PENDING_APPROVAL', buyer.id);

    // Demo 3: ainda em DRAFT, pronto para o solicitante submeter ao vivo.
    await prisma.purchaseRequest.create({
      data: {
        requesterId: requester.id,
        departmentId: departmentTI.id,
        title: 'Cadeiras ergonômicas para o escritório',
        justification: 'Diversas solicitações de ajuste ergonômico da equipe nos últimos meses.',
        status: 'DRAFT',
        items: {
          create: [
            {
              description: 'Cadeira ergonômica ajustável',
              quantity: 10,
              unit: 'unidade',
              estimatedUnitPrice: 1200,
            },
          ],
        },
      },
    });
  }

  console.log('Seed aplicado com sucesso.');
  console.log('- 2 departamentos, 5 usuários (senha "senha123" para todos)');
  console.log('- 2 fornecedores');
  console.log('- 3 solicitações de demonstração: 1 COMPLETED, 1 PENDING_APPROVAL, 1 DRAFT');
  console.log(
    `ADMIN: ${admin.email} | BUYER: ${buyer.email} | APPROVER: ${approver.email} | REQUESTER: ${requester.email}`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
