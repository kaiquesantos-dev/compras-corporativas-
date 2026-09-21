import { ConflictException } from '@nestjs/common';
import { PurchaseRequestStatusService } from './purchase-request-status.service';

describe('PurchaseRequestStatusService', () => {
  let service: PurchaseRequestStatusService;

  beforeEach(() => {
    service = new PurchaseRequestStatusService();
  });

  it('allows DRAFT -> SUBMITTED', () => {
    expect(() => service.assertTransition('DRAFT', 'SUBMITTED')).not.toThrow();
  });

  it('allows SUBMITTED -> IN_QUOTATION', () => {
    expect(() => service.assertTransition('SUBMITTED', 'IN_QUOTATION')).not.toThrow();
  });

  it('allows IN_QUOTATION -> PENDING_APPROVAL', () => {
    expect(() => service.assertTransition('IN_QUOTATION', 'PENDING_APPROVAL')).not.toThrow();
  });

  it('allows PENDING_APPROVAL -> APPROVED and -> REJECTED', () => {
    expect(() => service.assertTransition('PENDING_APPROVAL', 'APPROVED')).not.toThrow();
    expect(() => service.assertTransition('PENDING_APPROVAL', 'REJECTED')).not.toThrow();
  });

  it('allows APPROVED -> COMPLETED', () => {
    expect(() => service.assertTransition('APPROVED', 'COMPLETED')).not.toThrow();
  });

  it('rejects skipping states, e.g. DRAFT -> APPROVED', () => {
    expect(() => service.assertTransition('DRAFT', 'APPROVED')).toThrow(ConflictException);
  });

  it('rejects any transition out of a terminal state', () => {
    expect(() => service.assertTransition('REJECTED', 'APPROVED')).toThrow(ConflictException);
    expect(() => service.assertTransition('COMPLETED', 'CANCELLED')).toThrow(ConflictException);
    expect(() => service.assertTransition('CANCELLED', 'DRAFT')).toThrow(ConflictException);
  });

  it('records a history row via transitionAndRecord', async () => {
    const tx = { purchaseRequestStatusHistory: { create: jest.fn() } };

    await service.transitionAndRecord(tx as any, 1, 'DRAFT', 'SUBMITTED', 42);

    expect(tx.purchaseRequestStatusHistory.create).toHaveBeenCalledWith({
      data: {
        purchaseRequestId: 1,
        fromStatus: 'DRAFT',
        toStatus: 'SUBMITTED',
        changedByUserId: 42,
        note: undefined,
      },
    });
  });

  it('does not write history when the transition is illegal', async () => {
    const tx = { purchaseRequestStatusHistory: { create: jest.fn() } };

    await expect(service.transitionAndRecord(tx as any, 1, 'DRAFT', 'APPROVED', 42)).rejects.toThrow(
      ConflictException,
    );
    expect(tx.purchaseRequestStatusHistory.create).not.toHaveBeenCalled();
  });
});
