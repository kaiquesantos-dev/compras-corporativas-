import { ConflictException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
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
    expect(() =>
      service.assertTransition('SUBMITTED', 'IN_QUOTATION'),
    ).not.toThrow();
  });

  it('allows IN_QUOTATION -> PENDING_APPROVAL', () => {
    expect(() =>
      service.assertTransition('IN_QUOTATION', 'PENDING_APPROVAL'),
    ).not.toThrow();
  });

  it('allows PENDING_APPROVAL -> APPROVED and -> REJECTED', () => {
    expect(() =>
      service.assertTransition('PENDING_APPROVAL', 'APPROVED'),
    ).not.toThrow();
    expect(() =>
      service.assertTransition('PENDING_APPROVAL', 'REJECTED'),
    ).not.toThrow();
  });

  it('allows APPROVED -> COMPLETED', () => {
    expect(() =>
      service.assertTransition('APPROVED', 'COMPLETED'),
    ).not.toThrow();
  });

  it('rejects skipping states, e.g. DRAFT -> APPROVED', () => {
    expect(() => service.assertTransition('DRAFT', 'APPROVED')).toThrow(
      ConflictException,
    );
  });

  it('rejects any transition out of a terminal state', () => {
    expect(() => service.assertTransition('REJECTED', 'APPROVED')).toThrow(
      ConflictException,
    );
    expect(() => service.assertTransition('COMPLETED', 'CANCELLED')).toThrow(
      ConflictException,
    );
    expect(() => service.assertTransition('CANCELLED', 'DRAFT')).toThrow(
      ConflictException,
    );
  });

  function buildTx(updateImpl: (...args: unknown[]) => unknown) {
    return {
      purchaseRequest: { update: jest.fn(updateImpl) },
      purchaseRequestStatusHistory: { create: jest.fn() },
    };
  }

  it('applies the compare-and-swap update and records a history row', async () => {
    const tx = buildTx(() => ({ id: 1, status: 'SUBMITTED' }));

    const result = await service.transitionAndRecord(
      tx as any,
      1,
      'DRAFT',
      'SUBMITTED',
      42,
    );

    expect(tx.purchaseRequest.update).toHaveBeenCalledWith({
      where: { id: 1, status: 'DRAFT' },
      data: { status: 'SUBMITTED' },
    });
    expect(tx.purchaseRequestStatusHistory.create).toHaveBeenCalledWith({
      data: {
        purchaseRequestId: 1,
        fromStatus: 'DRAFT',
        toStatus: 'SUBMITTED',
        changedByUserId: 42,
        note: undefined,
      },
    });
    expect(result).toEqual({ id: 1, status: 'SUBMITTED' });
  });

  it('merges extra "data" into the compare-and-swap update', async () => {
    const tx = buildTx(() => ({ id: 1, status: 'CANCELLED' }));
    const cancelledAt = new Date('2026-01-01T00:00:00.000Z');

    await service.transitionAndRecord(tx as any, 1, 'DRAFT', 'CANCELLED', 42, {
      data: { cancelledAt },
    });

    expect(tx.purchaseRequest.update).toHaveBeenCalledWith({
      where: { id: 1, status: 'DRAFT' },
      data: { status: 'CANCELLED', cancelledAt },
    });
  });

  it('does not write history when the transition is illegal', async () => {
    const tx = buildTx(() => ({}));

    await expect(
      service.transitionAndRecord(tx as any, 1, 'DRAFT', 'APPROVED', 42),
    ).rejects.toThrow(ConflictException);
    expect(tx.purchaseRequest.update).not.toHaveBeenCalled();
    expect(tx.purchaseRequestStatusHistory.create).not.toHaveBeenCalled();
  });

  it('turns a lost compare-and-swap race (P2025) into a 409 instead of corrupting state silently', async () => {
    const tx = buildTx(() => {
      throw new Prisma.PrismaClientKnownRequestError('Record not found', {
        code: 'P2025',
        clientVersion: '7.10.0',
      });
    });

    await expect(
      service.transitionAndRecord(tx as any, 1, 'DRAFT', 'SUBMITTED', 42),
    ).rejects.toThrow(ConflictException);
    expect(tx.purchaseRequestStatusHistory.create).not.toHaveBeenCalled();
  });

  it('rethrows unrelated Prisma errors instead of masking them as a 409', async () => {
    const tx = buildTx(() => {
      throw new Prisma.PrismaClientKnownRequestError('Unique violation', {
        code: 'P2002',
        clientVersion: '7.10.0',
      });
    });

    await expect(
      service.transitionAndRecord(tx as any, 1, 'DRAFT', 'SUBMITTED', 42),
    ).rejects.toThrow(Prisma.PrismaClientKnownRequestError);
  });
});
