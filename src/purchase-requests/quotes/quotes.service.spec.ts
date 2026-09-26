import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
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
        findFirst: jest.fn().mockResolvedValue(null),
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
    service = new QuotesService(
      prisma,
      new PurchaseRequestStatusService(),
      purchaseRequestsService as any,
    );
  });

  describe('create', () => {
    it('throws NotFoundException when the supplier does not exist', async () => {
      purchaseRequestsService.findOne.mockResolvedValue({
        id: 1,
        status: 'SUBMITTED',
      });
      prisma.supplier.findUnique.mockResolvedValue(null);

      await expect(
        service.create(
          1,
          { supplierId: 999, totalValue: 100 } as any,
          { id: 1, role: 'BUYER' } as any,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ConflictException when the purchase request is not SUBMITTED or IN_QUOTATION', async () => {
      purchaseRequestsService.findOne.mockResolvedValue({
        id: 1,
        status: 'DRAFT',
      });
      prisma.supplier.findUnique.mockResolvedValue({ id: 1 });

      await expect(
        service.create(
          1,
          { supplierId: 1, totalValue: 100 } as any,
          { id: 1, role: 'BUYER' } as any,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('transitions SUBMITTED -> IN_QUOTATION on the first quote', async () => {
      purchaseRequestsService.findOne.mockResolvedValue({
        id: 1,
        status: 'SUBMITTED',
      });
      prisma.supplier.findUnique.mockResolvedValue({ id: 1, isActive: true });
      prisma.quote.create.mockResolvedValue({ id: 10 });

      await service.create(1, { supplierId: 1, totalValue: 100 }, {
        id: 1,
        role: 'BUYER',
      } as any);

      expect(prisma.purchaseRequest.update).toHaveBeenCalledWith({
        where: { id: 1, status: 'SUBMITTED' },
        data: { status: 'IN_QUOTATION' },
      });
    });

    it('does not re-transition when the purchase request is already IN_QUOTATION', async () => {
      purchaseRequestsService.findOne.mockResolvedValue({
        id: 1,
        status: 'IN_QUOTATION',
      });
      prisma.supplier.findUnique.mockResolvedValue({ id: 1, isActive: true });
      prisma.quote.create.mockResolvedValue({ id: 11 });

      await service.create(1, { supplierId: 1, totalValue: 100 }, {
        id: 1,
        role: 'BUYER',
      } as any);

      expect(prisma.purchaseRequest.update).not.toHaveBeenCalled();
    });

    // Corrida: o dono cancela a solicitação SUBMITTED no mesmo instante em que
    // a primeira cotação é registrada. A transição SUBMITTED -> IN_QUOTATION
    // perde (P2025), e a cotação NÃO pode ser criada numa solicitação
    // cancelada.
    it('does not create the quote when a concurrent cancel won the race', async () => {
      purchaseRequestsService.findOne.mockResolvedValue({
        id: 1,
        status: 'SUBMITTED',
      });
      prisma.supplier.findUnique.mockResolvedValue({ id: 1, isActive: true });
      prisma.purchaseRequest.update.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Record not found', {
          code: 'P2025',
          clientVersion: 'test',
        }),
      );
      prisma.purchaseRequest.findUnique = jest
        .fn()
        .mockResolvedValue({ status: 'CANCELLED' });

      await expect(
        service.create(1, { supplierId: 1, totalValue: 100 } as any, {
          id: 1,
          role: 'BUYER',
        } as any),
      ).rejects.toThrow(ConflictException);
      expect(prisma.quote.create).not.toHaveBeenCalled();
    });

    it('throws ConflictException when the supplier is inactive', async () => {
      purchaseRequestsService.findOne.mockResolvedValue({
        id: 1,
        status: 'IN_QUOTATION',
      });
      prisma.supplier.findUnique.mockResolvedValue({ id: 1, isActive: false });

      await expect(
        service.create(
          1,
          { supplierId: 1, totalValue: 100 } as any,
          { id: 1, role: 'BUYER' } as any,
        ),
      ).rejects.toThrow(ConflictException);
      expect(prisma.quote.create).not.toHaveBeenCalled();
    });
  });

  describe('select', () => {
    it('throws ConflictException when the purchase request is not IN_QUOTATION', async () => {
      purchaseRequestsService.findOne.mockResolvedValue({
        id: 1,
        status: 'SUBMITTED',
      });
      prisma.quote.findUnique.mockResolvedValue({
        id: 5,
        purchaseRequestId: 1,
      });

      await expect(
        service.select(1, 5, { id: 1, role: 'BUYER' } as any),
      ).rejects.toThrow(ConflictException);
    });

    it('throws ConflictException when the quote\'s supplier is inactive', async () => {
      purchaseRequestsService.findOne.mockResolvedValue({
        id: 1,
        status: 'IN_QUOTATION',
      });
      prisma.quote.findUnique.mockResolvedValue({
        id: 5,
        purchaseRequestId: 1,
        supplierId: 9,
      });
      prisma.supplier.findUnique.mockResolvedValue({ id: 9, isActive: false });

      await expect(
        service.select(1, 5, { id: 1, role: 'BUYER' } as any),
      ).rejects.toThrow(ConflictException);
      expect(prisma.purchaseRequest.update).not.toHaveBeenCalled();
    });

    it('discards the other quotes and moves the request to PENDING_APPROVAL', async () => {
      purchaseRequestsService.findOne.mockResolvedValue({
        id: 1,
        status: 'IN_QUOTATION',
      });
      prisma.quote.findUnique.mockResolvedValue({
        id: 5,
        purchaseRequestId: 1,
        supplierId: 9,
      });
      prisma.supplier.findUnique.mockResolvedValue({ id: 9, isActive: true });
      prisma.purchaseRequest.update.mockResolvedValue({
        id: 1,
        status: 'PENDING_APPROVAL',
      });

      await service.select(1, 5, { id: 1, role: 'BUYER' } as any);

      expect(prisma.quote.updateMany).toHaveBeenCalledWith({
        where: { purchaseRequestId: 1, id: { not: 5 } },
        data: { status: 'DISCARDED' },
      });
      expect(prisma.quote.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 5 },
          data: { status: 'SELECTED' },
        }),
      );
      expect(prisma.purchaseRequest.update).toHaveBeenCalledWith({
        where: { id: 1, status: 'IN_QUOTATION' },
        data: {
          status: 'PENDING_APPROVAL',
          selectedQuote: { connect: { id: 5 } },
        },
      });
    });
  });

  describe('downloadProposal', () => {
    it('throws NotFoundException when the quote has no attached file', async () => {
      purchaseRequestsService.findOne.mockResolvedValue({
        id: 1,
        status: 'IN_QUOTATION',
      });
      prisma.quote.findUnique.mockResolvedValue({
        id: 5,
        purchaseRequestId: 1,
      });
      prisma.quote.findUniqueOrThrow = jest
        .fn()
        .mockResolvedValue({ proposalFileContent: null });

      await expect(
        service.downloadProposal(1, 5, { id: 1, role: 'BUYER' } as any),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // Listagem não pode carregar o arquivo da proposta: serializado em JSON,
  // um PDF de 1MB virava uma resposta de ~12MB.
  describe('findAll', () => {
    it('never loads the proposal file content', async () => {
      purchaseRequestsService.findOne.mockResolvedValue({ id: 1 });
      prisma.quote.findMany.mockResolvedValue([]);

      await service.findAll(1, { id: 1, role: 'BUYER' } as any);

      expect(prisma.quote.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ omit: { proposalFileContent: true } }),
      );
    });
  });
});
