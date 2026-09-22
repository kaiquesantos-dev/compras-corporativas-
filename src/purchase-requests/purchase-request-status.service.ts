import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma, PurchaseRequestStatus } from '../generated/prisma/client';

const ALLOWED_TRANSITIONS: Record<
  PurchaseRequestStatus,
  PurchaseRequestStatus[]
> = {
  DRAFT: ['SUBMITTED', 'CANCELLED'],
  SUBMITTED: ['IN_QUOTATION', 'CANCELLED'],
  IN_QUOTATION: ['PENDING_APPROVAL', 'CANCELLED'],
  PENDING_APPROVAL: ['APPROVED', 'REJECTED'],
  APPROVED: ['COMPLETED'],
  REJECTED: [],
  COMPLETED: [],
  CANCELLED: [],
};

@Injectable()
export class PurchaseRequestStatusService {
  assertTransition(
    from: PurchaseRequestStatus,
    to: PurchaseRequestStatus,
  ): void {
    if (!ALLOWED_TRANSITIONS[from].includes(to)) {
      throw new ConflictException(
        `Não é possível mudar o status de ${from} para ${to}.`,
      );
    }
  }

  async transitionAndRecord(
    tx: Prisma.TransactionClient,
    purchaseRequestId: number,
    from: PurchaseRequestStatus,
    to: PurchaseRequestStatus,
    changedByUserId: number,
    note?: string,
  ): Promise<void> {
    this.assertTransition(from, to);
    await tx.purchaseRequestStatusHistory.create({
      data: {
        purchaseRequestId,
        fromStatus: from,
        toStatus: to,
        changedByUserId,
        note,
      },
    });
  }
}
