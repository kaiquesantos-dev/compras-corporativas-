import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthenticatedUser } from '../../auth/types/authenticated-user.type';
import { PurchaseRequestStatusService } from '../purchase-request-status.service';
import { PurchaseRequestsService } from '../purchase-requests.service';
import { DecideApprovalDto } from './dto/decide-approval.dto';

@Injectable()
export class ApprovalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly statusService: PurchaseRequestStatusService,
    private readonly purchaseRequestsService: PurchaseRequestsService,
  ) {}

  async decide(
    purchaseRequestId: number,
    dto: DecideApprovalDto,
    user: AuthenticatedUser,
  ) {
    const pr = await this.purchaseRequestsService.findOne(
      purchaseRequestId,
      user,
    );

    // Segregação de funções: quem pediu a compra nunca aprova a própria
    // compra. Só é alcançável quando o solicitante é promovido a APPROVER
    // depois de criar a solicitação, mas é justamente o controle antifraude
    // mais básico de um fluxo de compras.
    if (pr.requesterId === user.id) {
      throw new ForbiddenException(
        'Você não pode aprovar ou rejeitar uma solicitação criada por você mesmo.',
      );
    }

    if (pr.status !== 'PENDING_APPROVAL') {
      throw new ConflictException(
        'Só é possível decidir uma solicitação que está em PENDING_APPROVAL.',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await this.statusService.transitionAndRecord(
        tx,
        pr.id,
        'PENDING_APPROVAL',
        dto.decision,
        user.id,
        { note: dto.comment, data: { decidedAt: new Date() } },
      );

      await tx.approval.create({
        data: {
          purchaseRequestId: pr.id,
          approverId: user.id,
          decision: dto.decision,
          comment: dto.comment,
        },
      });

      return updated;
    });
  }

  async findOne(purchaseRequestId: number, user: AuthenticatedUser) {
    await this.purchaseRequestsService.findOne(purchaseRequestId, user);
    // include approver: sem isso, a resposta só trazia approverId (um número
    // cru) — o frontend não tinha como mostrar QUEM decidiu, só o ID.
    const approval = await this.prisma.approval.findUnique({
      where: { purchaseRequestId },
      include: { approver: { select: { id: true, name: true } } },
    });
    if (!approval) {
      throw new NotFoundException(
        'Esta solicitação ainda não possui uma decisão de aprovação.',
      );
    }
    return approval;
  }
}
