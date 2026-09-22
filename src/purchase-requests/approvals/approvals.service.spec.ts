import { ConflictException, NotFoundException } from '@nestjs/common';
import { ApprovalsService } from './approvals.service';
import { PurchaseRequestStatusService } from '../purchase-request-status.service';

describe('ApprovalsService', () => {
  let service: ApprovalsService;
  let prisma: any;
  let purchaseRequestsService: { findOne: jest.Mock };

  beforeEach(() => {
    prisma = {
      approval: { create: jest.fn(), findUnique: jest.fn() },
      purchaseRequest: { update: jest.fn() },
      purchaseRequestStatusHistory: { create: jest.fn() },
      $transaction: jest.fn((callback: any) => callback(prisma)),
    };
    purchaseRequestsService = { findOne: jest.fn() };
    service = new ApprovalsService(
      prisma,
      new PurchaseRequestStatusService(),
      purchaseRequestsService as any,
    );
  });

  describe('decide', () => {
    it('throws ConflictException when the request is not PENDING_APPROVAL', async () => {
      purchaseRequestsService.findOne.mockResolvedValue({
        id: 1,
        status: 'IN_QUOTATION',
      });

      await expect(
        service.decide(
          1,
          { decision: 'APPROVED' } as any,
          { id: 1, role: 'APPROVER' } as any,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('approves the request, recording the approval and updating status', async () => {
      purchaseRequestsService.findOne.mockResolvedValue({
        id: 1,
        status: 'PENDING_APPROVAL',
      });
      prisma.purchaseRequest.update.mockResolvedValue({
        id: 1,
        status: 'APPROVED',
      });

      const result = await service.decide(
        1,
        { decision: 'APPROVED', comment: 'Ok' } as any,
        { id: 7, role: 'APPROVER' } as any,
      );

      expect(prisma.approval.create).toHaveBeenCalledWith({
        data: {
          purchaseRequestId: 1,
          approverId: 7,
          decision: 'APPROVED',
          comment: 'Ok',
        },
      });
      expect(prisma.purchaseRequest.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { status: 'APPROVED', decidedAt: expect.any(Date) },
      });
      expect(result).toEqual({ id: 1, status: 'APPROVED' });
    });

    it('rejects the request when decision is REJECTED', async () => {
      purchaseRequestsService.findOne.mockResolvedValue({
        id: 1,
        status: 'PENDING_APPROVAL',
      });
      prisma.purchaseRequest.update.mockResolvedValue({
        id: 1,
        status: 'REJECTED',
      });

      await service.decide(
        1,
        { decision: 'REJECTED' } as any,
        { id: 7, role: 'APPROVER' } as any,
      );

      expect(prisma.purchaseRequest.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { status: 'REJECTED', decidedAt: expect.any(Date) },
      });
    });
  });

  describe('findOne', () => {
    it('throws NotFoundException when there is no approval yet', async () => {
      purchaseRequestsService.findOne.mockResolvedValue({ id: 1 });
      prisma.approval.findUnique.mockResolvedValue(null);

      await expect(
        service.findOne(1, { id: 1, role: 'APPROVER' } as any),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
