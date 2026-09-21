import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { buildPaginationParams } from '../common/pagination/paginate';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { USER_SELECT } from '../users/users.service';
import { CreatePurchaseRequestDto } from './dto/create-purchase-request.dto';
import { UpdatePurchaseRequestDto } from './dto/update-purchase-request.dto';
import { PurchaseRequestQueryDto } from './dto/purchase-request-query.dto';
import { PurchaseRequestStatusService } from './purchase-request-status.service';

@Injectable()
export class PurchaseRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly statusService: PurchaseRequestStatusService,
  ) {}

  async create(dto: CreatePurchaseRequestDto, user: AuthenticatedUser) {
    const requester = await this.prisma.user.findUnique({ where: { id: user.id } });
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

  async update(id: number, dto: UpdatePurchaseRequestDto, user: AuthenticatedUser) {
    const pr = await this.findOwnedForWrite(id, user);
    if (pr.status !== 'DRAFT') {
      throw new ConflictException('Só é possível editar uma solicitação enquanto ela está em DRAFT.');
    }
    return this.prisma.purchaseRequest.update({
      where: { id },
      data: { title: dto.title, justification: dto.justification },
      include: { items: true },
    });
  }

  async submit(id: number, user: AuthenticatedUser) {
    const pr = await this.findOwnedForWrite(id, user);
    return this.prisma.$transaction(async (tx) => {
      await this.statusService.transitionAndRecord(tx, pr.id, pr.status, 'SUBMITTED', user.id);
      return tx.purchaseRequest.update({
        where: { id: pr.id },
        data: { status: 'SUBMITTED', submittedAt: new Date() },
      });
    });
  }

  async cancel(id: number, user: AuthenticatedUser) {
    const pr = await this.prisma.purchaseRequest.findUnique({ where: { id } });
    if (!pr) {
      throw new NotFoundException('Solicitação de compra não encontrada.');
    }
    if (user.role !== 'ADMIN' && pr.requesterId !== user.id) {
      throw new ForbiddenException('Você não tem acesso a esta solicitação de compra.');
    }

    return this.prisma.$transaction(async (tx) => {
      await this.statusService.transitionAndRecord(tx, pr.id, pr.status, 'CANCELLED', user.id);
      return tx.purchaseRequest.update({
        where: { id: pr.id },
        data: { status: 'CANCELLED', cancelledAt: new Date() },
      });
    });
  }

  async complete(id: number, user: AuthenticatedUser) {
    const pr = await this.prisma.purchaseRequest.findUnique({ where: { id } });
    if (!pr) {
      throw new NotFoundException('Solicitação de compra não encontrada.');
    }

    return this.prisma.$transaction(async (tx) => {
      await this.statusService.transitionAndRecord(tx, pr.id, pr.status, 'COMPLETED', user.id);
      return tx.purchaseRequest.update({
        where: { id: pr.id },
        data: { status: 'COMPLETED', completedAt: new Date() },
      });
    });
  }

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

  private assertViewAccess(pr: { requesterId: number }, user: AuthenticatedUser) {
    if (user.role === 'REQUESTER' && pr.requesterId !== user.id) {
      throw new ForbiddenException('Você não tem acesso a esta solicitação de compra.');
    }
  }

  private async findOwnedForWrite(id: number, user: AuthenticatedUser) {
    const pr = await this.prisma.purchaseRequest.findUnique({ where: { id } });
    if (!pr) {
      throw new NotFoundException('Solicitação de compra não encontrada.');
    }
    if (pr.requesterId !== user.id) {
      throw new ForbiddenException('Você não tem acesso a esta solicitação de compra.');
    }
    return pr;
  }
}
