import { ConflictException, NotFoundException } from '@nestjs/common';
import { QuotesService } from './quotes.service';
import { PurchaseRequestStatusService } from '../purchase-request-status.service';

describe('QuotesService', () => {
  let service: QuotesService;
  let prisma: any;
  let purchaseRequestsService: { findOne: jest.Mock };

  beforeEach(() => {
    prisma = {
      supplier: { findUnique: jest.fn() },
      quote: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      purchaseRequest: { update: jest.fn() },
      purchaseRequestStatusHistory: { create: jest.fn() },
      $transaction: jest.fn((callback: any) => callback(prisma)),
    };
    purchaseRequestsService = { findOne: jest.fn() };
    service = new QuotesService(prisma, new PurchaseRequestStatusService(), purchaseRequestsService as any);
  });

  describe('create', () => {
    it('throws NotFoundException when the supplier does not exist', async () => {
      purchaseRequestsService.findOne.mockResolvedValue({ id: 1, status: 'SUBMITTED' });
      prisma.supplier.findUnique.mockResolvedValue(null);

      await expect(
        service.create(1, { supplierId: 999, totalValue: 100 } as any, { id: 1, role: 'BUYER' } as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ConflictException when the purchase request is not SUBMITTED or IN_QUOTATION', async () => {
      purchaseRequestsService.findOne.mockResolvedValue({ id: 1, status: 'DRAFT' });
      prisma.supplier.findUnique.mockResolvedValue({ id: 1 });

      await expect(
        service.create(1, { supplierId: 1, totalValue: 100 } as any, { id: 1, role: 'BUYER' } as any),
      ).rejects.toThrow(ConflictException);
    });

    it('transitions SUBMITTED -> IN_QUOTATION on the first quote', async () => {
      purchaseRequestsService.findOne.mockResolvedValue({ id: 1, status: 'SUBMITTED' });
      prisma.supplier.findUnique.mockResolvedValue({ id: 1 });
      prisma.quote.create.mockResolvedValue({ id: 10 });

      await service.create(1, { supplierId: 1, totalValue: 100 } as any, { id: 1, role: 'BUYER' } as any);

      expect(prisma.purchaseRequest.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { status: 'IN_QUOTATION' },
      });
    });

    it('does not re-transition when the purchase request is already IN_QUOTATION', async () => {
      purchaseRequestsService.findOne.mockResolvedValue({ id: 1, status: 'IN_QUOTATION' });
      prisma.supplier.findUnique.mockResolvedValue({ id: 1 });
      prisma.quote.create.mockResolvedValue({ id: 11 });

      await service.create(1, { supplierId: 1, totalValue: 100 } as any, { id: 1, role: 'BUYER' } as any);

      expect(prisma.purchaseRequest.update).not.toHaveBeenCalled();
    });
  });

  describe('select', () => {
    it('throws ConflictException when the purchase request is not IN_QUOTATION', async () => {
      purchaseRequestsService.findOne.mockResolvedValue({ id: 1, status: 'SUBMITTED' });
      prisma.quote.findUnique.mockResolvedValue({ id: 5, purchaseRequestId: 1 });

      await expect(service.select(1, 5, { id: 1, role: 'BUYER' } as any)).rejects.toThrow(
        ConflictException,
      );
    });

    it('discards the other quotes and moves the request to PENDING_APPROVAL', async () => {
      purchaseRequestsService.findOne.mockResolvedValue({ id: 1, status: 'IN_QUOTATION' });
      prisma.quote.findUnique.mockResolvedValue({ id: 5, purchaseRequestId: 1 });
      prisma.purchaseRequest.update.mockResolvedValue({ id: 1, status: 'PENDING_APPROVAL' });

      await service.select(1, 5, { id: 1, role: 'BUYER' } as any);

      expect(prisma.quote.updateMany).toHaveBeenCalledWith({
        where: { purchaseRequestId: 1, id: { not: 5 } },
        data: { status: 'DISCARDED' },
      });
      expect(prisma.quote.update).toHaveBeenCalledWith({
        where: { id: 5 },
        data: { status: 'SELECTED' },
      });
      expect(prisma.purchaseRequest.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { status: 'PENDING_APPROVAL', selectedQuoteId: 5 },
      });
    });
  });

  describe('downloadProposal', () => {
    it('throws NotFoundException when the quote has no attached file', async () => {
      purchaseRequestsService.findOne.mockResolvedValue({ id: 1, status: 'IN_QUOTATION' });
      prisma.quote.findUnique.mockResolvedValue({
        id: 5,
        purchaseRequestId: 1,
        proposalFileContent: null,
      });

      await expect(
        service.downloadProposal(1, 5, { id: 1, role: 'BUYER' } as any),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
