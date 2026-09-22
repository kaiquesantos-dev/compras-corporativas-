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

    const where: Record<string, unknown> = {};
    if (user.role === 'REQUESTER') {
      where.requesterId = user.id;
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
        include: { items: true, requester: { select: USER_SELECT } },
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
        quotes: true,
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
    return this.prisma.$transaction(async (tx) => {
      await this.statusService.transitionAndRecord(
        tx,
        pr.id,
        pr.status,
        'SUBMITTED',
        user.id,
      );
      return tx.purchaseRequest.update({
        where: { id: pr.id },
        data: { status: 'SUBMITTED', submittedAt: new Date() },
      });
    });
  }

  // Cancelar é permitido pelo dono OU por um ADMIN (diferente de
  // submit/update, que só o dono pode fazer) — é uma exceção proposital
  // para que um administrador consiga limpar solicitações travadas.
  async cancel(id: number, user: AuthenticatedUser) {
    const pr = await this.prisma.purchaseRequest.findUnique({ where: { id } });
    if (!pr) {
      throw new NotFoundException('Solicitação de compra não encontrada.');
    }
    if (user.role !== 'ADMIN' && pr.requesterId !== user.id) {
      throw new ForbiddenException(
        'Você não tem acesso a esta solicitação de compra.',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      await this.statusService.transitionAndRecord(
        tx,
        pr.id,
        pr.status,
        'CANCELLED',
        user.id,
      );
      return tx.purchaseRequest.update({
        where: { id: pr.id },
        data: { status: 'CANCELLED', cancelledAt: new Date() },
      });
    });
  }

  // Marca a compra como finalizada (depois de aprovada). Quem pode chamar
  // isso (BUYER/ADMIN) é decidido no controller via @Roles — aqui só
  // fazemos a transição de estado.
  async complete(id: number, user: AuthenticatedUser) {
    const pr = await this.prisma.purchaseRequest.findUnique({ where: { id } });
    if (!pr) {
      throw new NotFoundException('Solicitação de compra não encontrada.');
    }

    return this.prisma.$transaction(async (tx) => {
      await this.statusService.transitionAndRecord(
        tx,
        pr.id,
        pr.status,
        'COMPLETED',
        user.id,
      );
      return tx.purchaseRequest.update({
        where: { id: pr.id },
        data: { status: 'COMPLETED', completedAt: new Date() },
      });
    });
  }

  // Devolve a linha do tempo completa de mudanças de status dessa
  // solicitação — é o que atende ao requisito de "histórico" do enunciado.
  async history(id: number, user: AuthenticatedUser) {
    const pr = await this.prisma.purchaseRequest.findUnique({ where: { id } });
    if (!pr) {
      throw new NotFoundException('Solicitação de compra não encontrada.');
    }
    this.assertViewAccess(pr, user);

    return this.prisma.purchaseRequestStatusHistory.findMany({
      where: { purchaseRequestId: id },
      orderBy: { changedAt: 'asc' },
    });
  }

  // Checagem usada em endpoints de LEITURA (findOne, history): um
  // REQUESTER só pode ver a própria solicitação; os outros papéis podem
  // ver qualquer uma. É esta função que impede alguém de trocar o ID na
  // URL e espiar a solicitação de outra pessoa.
  private assertViewAccess(
    pr: { requesterId: number },
    user: AuthenticatedUser,
  ) {
    if (user.role === 'REQUESTER' && pr.requesterId !== user.id) {
      throw new ForbiddenException(
        'Você não tem acesso a esta solicitação de compra.',
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
