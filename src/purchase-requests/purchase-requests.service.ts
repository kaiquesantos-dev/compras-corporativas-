import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { buildPaginationParams } from '../common/pagination/paginate';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { USER_SELECT } from '../users/users.service';
import { CreatePurchaseRequestDto } from './dto/create-purchase-request.dto';
import { UpdatePurchaseRequestDto } from './dto/update-purchase-request.dto';
import { PurchaseRequestQueryDto } from './dto/purchase-request-query.dto';
import { PurchaseRequestStatusService } from './purchase-request-status.service';
import { OMIT_PROPOSAL_CONTENT } from './quotes/omit-proposal-content';
import { Prisma, PurchaseRequestStatus } from '../generated/prisma/client';
import { actsAsAdmin } from '../auth/acts-as-admin';

const CANCELLABLE_STATUSES: PurchaseRequestStatus[] = [
  'DRAFT',
  'SUBMITTED',
  'IN_QUOTATION',
];

const STATUS_LABELS: Record<PurchaseRequestStatus, string> = {
  DRAFT: 'Rascunho',
  SUBMITTED: 'Submetida',
  IN_QUOTATION: 'Em cotação',
  PENDING_APPROVAL: 'Aguardando aprovação',
  APPROVED: 'Aprovada',
  REJECTED: 'Rejeitada',
  COMPLETED: 'Concluída',
  CANCELLED: 'Cancelada',
};

// Este é o service mais importante do sistema: cuida do CRUD da
// solicitação de compra e das ações que fazem ela mudar de estado
// (submit, cancel, complete). As transições de estado em si (o que pode
// virar o quê) ficam delegadas ao PurchaseRequestStatusService — este
// service aqui só decide QUEM pode fazer cada ação e QUANDO ela é chamada.
@Injectable()
export class PurchaseRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly statusService: PurchaseRequestStatusService,
  ) {}

  // Cria a solicitação já em DRAFT, junto com os itens (nested create do
  // Prisma: os PurchaseItem são criados na mesma operação, vinculados
  // automaticamente). O departamento é "tirado uma foto" do usuário no
  // momento da criação (departmentId do requester), não é uma referência
  // que muda se o usuário trocar de departamento depois — assim o
  // histórico da solicitação continua fazendo sentido no futuro.
  async create(dto: CreatePurchaseRequestDto, user: AuthenticatedUser) {
    const requester = await this.prisma.user.findUnique({
      where: { id: user.id },
    });
    if (!requester?.departmentId) {
      throw new ConflictException(
        'Usuário não possui departamento vinculado; não é possível criar uma solicitação.',
      );
    }

    return this.prisma.purchaseRequest.create({
      data: {
        requesterId: user.id,
        departmentId: requester.departmentId,
        title: dto.title,
        justification: dto.justification,
        status: 'DRAFT',
        items: { create: dto.items },
      },
      include: { items: true },
    });
  }

  // Lista as solicitações com paginação. A regra de "quem vê o quê" mora
  // bem aqui: um REQUESTER só enxerga as próprias solicitações; qualquer
  // outro papel (BUYER/APPROVER/ADMIN) vê todas. Isso é o que garante que
  // um usuário não consiga espiar solicitações de outra pessoa só de listar.
  async findAll(query: PurchaseRequestQueryDto, user: AuthenticatedUser) {
    const { skip, take, orderBy } = buildPaginationParams(
      query,
      ['createdAt', 'status'],
      'createdAt',
    );

    const where: Prisma.PurchaseRequestWhereInput = {};
    if (user.role === 'REQUESTER') {
      where.requesterId = user.id;
    } else if (!actsAsAdmin(user)) {
      // BUYER/APPROVER veem tudo, menos rascunhos de outras pessoas: um
      // rascunho ainda não foi enviado, é trabalho em andamento do dono.
      where.OR = [{ status: { not: 'DRAFT' } }, { requesterId: user.id }];
    }
    if (query.status) {
      where.status = query.status;
    }

    const [data, total] = await Promise.all([
      this.prisma.purchaseRequest.findMany({
        skip,
        take,
        orderBy,
        where,
        // USER_SELECT garante que os dados do solicitante venham junto
        // sem nunca incluir a senha, mesmo numa relação aninhada como esta.
        // selectedQuote: o painel do frontend mostra o valor financeiro da
        // cotação vencedora direto na listagem, sem precisar de uma
        // requisição por solicitação (N+1) para o detalhe de cada uma.
        include: {
          items: true,
          requester: { select: USER_SELECT },
          selectedQuote: {
            include: { supplier: true },
            omit: OMIT_PROPOSAL_CONTENT,
          },
        },
      }),
      this.prisma.purchaseRequest.count({ where }),
    ]);

    return { data, total, page: query.page ?? 1, pageSize: take };
  }

  async findOne(id: number, user: AuthenticatedUser) {
    const pr = await this.prisma.purchaseRequest.findUnique({
      where: { id },
      include: {
        items: true,
        quotes: { omit: OMIT_PROPOSAL_CONTENT },
        approval: true,
        requester: { select: USER_SELECT },
      },
    });
    if (!pr) {
      throw new NotFoundException('Solicitação de compra não encontrada.');
    }
    this.assertViewAccess(pr, user);
    return pr;
  }

  // Só o dono pode editar, e só enquanto a solicitação ainda está em DRAFT
  // (depois de submeter, ela entra no fluxo de aprovação e não faz mais
  // sentido editar título/justificativa livremente).
  async update(
    id: number,
    dto: UpdatePurchaseRequestDto,
    user: AuthenticatedUser,
  ) {
    const pr = await this.findOwnedForWrite(id, user);
    if (pr.status !== 'DRAFT') {
      throw new ConflictException(
        'Só é possível editar uma solicitação enquanto ela está em DRAFT.',
      );
    }
    return this.prisma.purchaseRequest.update({
      where: { id },
      data: { title: dto.title, justification: dto.justification },
      include: { items: true },
    });
  }

  // Move a solicitação de DRAFT para SUBMITTED. Repare no padrão que se
  // repete em submit/cancel/complete: tudo acontece dentro de uma
  // transação ($transaction), porque queremos que "gravar o histórico" e
  // "atualizar o status" aconteçam juntos — se uma das duas falhar, a
  // outra é desfeita também.
  async submit(id: number, user: AuthenticatedUser) {
    const pr = await this.findOwnedForWrite(id, user);
    return this.prisma.$transaction((tx) =>
      this.statusService.transitionAndRecord(
        tx,
        pr.id,
        pr.status,
        'SUBMITTED',
        user.id,
        { data: { submittedAt: new Date() } },
      ),
    );
  }

  // Quem pode cancelar depende do estado atual:
  // - DRAFT/SUBMITTED: o dono (REQUESTER) ou um ADMIN — a solicitação ainda
  //   é "só dele", nenhum comprador foi envolvido ainda.
  // - IN_QUOTATION em diante: só BUYER ou ADMIN. A partir daqui o comprador
  //   já está negociando com fornecedores de verdade — deixar o REQUESTER
  //   dono cancelar sozinho jogaria fora esse trabalho sem quem está
  //   conduzindo o processo ter voz na decisão. ADMIN continua podendo
  //   cancelar em qualquer estado, para conseguir limpar solicitações
  //   travadas independente de quem "deveria" decidir.
  async cancel(id: number, user: AuthenticatedUser) {
    const pr = await this.prisma.purchaseRequest.findUnique({ where: { id } });
    if (!pr) {
      throw new NotFoundException('Solicitação de compra não encontrada.');
    }

    // Um APPROVER com acesso ADMIN delegado cobre o admin por completo,
    // inclusive aqui — o RolesGuard já o deixa entrar nesta rota como ADMIN.
    const isAdmin = actsAsAdmin(user);
    const isOwner = pr.requesterId === user.id;

    // 1) Um REQUESTER não enxerga solicitações de outras pessoas — responde
    //    403 antes de qualquer outra checagem, pra não vazar o status delas.
    if (user.role === 'REQUESTER' && !isOwner) {
      throw new ForbiddenException(
        'Você não tem acesso a esta solicitação de compra.',
      );
    }

    // 2) Estado que não permite mais cancelar é conflito de regra (409),
    //    igual pra todo mundo — antes o dono recebia 409 com uma mensagem
    //    técnica e o comprador recebia um 403 falso ("não tem acesso").
    if (!CANCELLABLE_STATUSES.includes(pr.status)) {
      throw new ConflictException(
        `Esta solicitação não pode mais ser cancelada: ela está "${STATUS_LABELS[pr.status]}". Só é possível cancelar até a fase "Em cotação".`,
      );
    }

    // 3) Quem pode cancelar, conforme a fase.
    if (!isAdmin) {
      if (pr.status === 'IN_QUOTATION' && user.role !== 'BUYER') {
        throw new ForbiddenException(
          'A partir de "Em cotação", só um comprador ou administrador pode cancelar esta solicitação.',
        );
      }
      if (pr.status !== 'IN_QUOTATION' && !isOwner) {
        throw new ForbiddenException(
          'Antes de entrar em cotação, só quem criou a solicitação (ou um administrador) pode cancelá-la.',
        );
      }
    }

    return this.prisma.$transaction((tx) =>
      this.statusService.transitionAndRecord(
        tx,
        pr.id,
        pr.status,
        'CANCELLED',
        user.id,
        { data: { cancelledAt: new Date() } },
      ),
    );
  }

  // Marca a compra como finalizada (depois de aprovada). Quem pode chamar
  // isso (BUYER/ADMIN) é decidido no controller via @Roles — aqui só
  // fazemos a transição de estado.
  async complete(id: number, user: AuthenticatedUser) {
    const pr = await this.prisma.purchaseRequest.findUnique({ where: { id } });
    if (!pr) {
      throw new NotFoundException('Solicitação de compra não encontrada.');
    }

    return this.prisma.$transaction((tx) =>
      this.statusService.transitionAndRecord(
        tx,
        pr.id,
        pr.status,
        'COMPLETED',
        user.id,
        { data: { completedAt: new Date() } },
      ),
    );
  }

  // Devolve a linha do tempo completa de mudanças de status dessa
  // solicitação — é o que atende ao requisito de "histórico" do enunciado.
  async history(id: number, user: AuthenticatedUser) {
    const pr = await this.prisma.purchaseRequest.findUnique({ where: { id } });
    if (!pr) {
      throw new NotFoundException('Solicitação de compra não encontrada.');
    }
    this.assertViewAccess(pr, user);

    // include changedBy: sem isso, a resposta só tinha changedByUserId (um
    // número cru) — o frontend não tinha como mostrar QUEM fez cada mudança
    // de status, só conseguia comparar contra o usuário logado e escrever
    // "por você" (e nada pras mudanças feitas por qualquer outra pessoa,
    // como o comprador movendo SUBMITTED → IN_QUOTATION ao registrar a
    // primeira cotação).
    return this.prisma.purchaseRequestStatusHistory.findMany({
      where: { purchaseRequestId: id },
      orderBy: { changedAt: 'asc' },
      include: { changedBy: { select: { id: true, name: true } } },
    });
  }

  // Checagem usada em endpoints de LEITURA (findOne, history): um
  // REQUESTER só pode ver a própria solicitação; os outros papéis podem
  // ver qualquer uma. É esta função que impede alguém de trocar o ID na
  // URL e espiar a solicitação de outra pessoa.
  private assertViewAccess(
    pr: { requesterId: number; status: PurchaseRequestStatus },
    user: AuthenticatedUser,
  ) {
    const isOwner = pr.requesterId === user.id;
    if (user.role === 'REQUESTER' && !isOwner) {
      throw new ForbiddenException(
        'Você não tem acesso a esta solicitação de compra.',
      );
    }
    // Rascunho é privado até ser submetido: só o dono e o admin (inclusive
    // o delegado) enxergam. Isso cobre detalhe, histórico, cotações e
    // aprovação, que passam todos por aqui.
    if (pr.status === 'DRAFT' && !isOwner && !actsAsAdmin(user)) {
      throw new ForbiddenException(
        'Esta solicitação ainda é um rascunho e só pode ser vista por quem a criou.',
      );
    }
  }

  // Checagem usada em endpoints de ESCRITA (update, submit): aqui a regra
  // é mais rígida — só o próprio dono pode mexer, nem outro REQUESTER nem
  // BUYER/APPROVER têm passe livre (diferente da leitura).
  private async findOwnedForWrite(id: number, user: AuthenticatedUser) {
    const pr = await this.prisma.purchaseRequest.findUnique({ where: { id } });
    if (!pr) {
      throw new NotFoundException('Solicitação de compra não encontrada.');
    }
    if (pr.requesterId !== user.id) {
      throw new ForbiddenException(
        'Você não tem acesso a esta solicitação de compra.',
      );
    }
    return pr;
  }
}
