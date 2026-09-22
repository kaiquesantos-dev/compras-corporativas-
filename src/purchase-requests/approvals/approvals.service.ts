import {
  ConflictException,
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

    if (pr.status !== 'PENDING_APPROVAL') {
      throw new ConflictException(
        'Só é possível decidir uma solicitação que está em PENDING_APPROVAL.',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      await this.statusService.transitionAndRecord(
        tx,
        pr.id,
        'PENDING_APPROVAL',
        dto.decision,
        user.id,
        dto.comment,
      );

      await tx.approval.create({
        data: {
          purchaseRequestId: pr.id,
          approverId: user.id,
          decision: dto.decision,
          comment: dto.comment,
        },
      });

      return tx.purchaseRequest.update({
        where: { id: pr.id },
        data: { status: dto.decision, decidedAt: new Date() },
      });
    });
  }

  async findOne(purchaseRequestId: number, user: AuthenticatedUser) {
    await this.purchaseRequestsService.findOne(purchaseRequestId, user);
    const approval = await this.prisma.approval.findUnique({
      where: { purchaseRequestId },
    });
    if (!approval) {
      throw new NotFoundException(
        'Esta solicitação ainda não possui uma decisão de aprovação.',
      );
    }
    return approval;
  }
}
