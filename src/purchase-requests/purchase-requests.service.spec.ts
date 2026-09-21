import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PurchaseRequestsService } from './purchase-requests.service';
import { PurchaseRequestStatusService } from './purchase-request-status.service';

describe('PurchaseRequestsService', () => {
  let service: PurchaseRequestsService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      user: { findUnique: jest.fn() },
      purchaseRequest: {
        create: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      purchaseRequestStatusHistory: { findMany: jest.fn() },
      $transaction: jest.fn((callback: any) => callback(prisma)),
    };
    service = new PurchaseRequestsService(prisma, new PurchaseRequestStatusService());
  });

  describe('create', () => {
    it('snapshots the requester department and creates nested items', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 1, departmentId: 5 });
      prisma.purchaseRequest.create.mockImplementation(({ data }: any) =>
        Promise.resolve({ id: 10, ...data }),
      );

      const result: any = await service.create(
        {
          title: 'Notebooks novos',
          justification: 'Equipamentos antigos falhando com frequência.',
          items: [{ description: 'Notebook', quantity: 2, unit: 'unidade' }],
        } as any,
        { id: 1, email: 'r@teste.com', role: 'REQUESTER' } as any,
      );

      expect(result.departmentId).toBe(5);
      expect(prisma.purchaseRequest.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ requesterId: 1, departmentId: 5, status: 'DRAFT' }),
        }),
      );
    });

    it('throws ConflictException when the requester has no department', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 1, departmentId: null });

      await expect(
        service.create(
          { title: 'X', justification: 'Justificativa qualquer aqui.', items: [] } as any,
          { id: 1, email: 'r@teste.com', role: 'REQUESTER' } as any,
        ),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('findOne', () => {
    it('throws NotFoundException when the request does not exist', async () => {
      prisma.purchaseRequest.findUnique.mockResolvedValue(null);
      await expect(
        service.findOne(999, { id: 1, email: 'a@a.com', role: 'REQUESTER' } as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when a REQUESTER views a request owned by someone else', async () => {
      prisma.purchaseRequest.findUnique.mockResolvedValue({ id: 1, requesterId: 999 });
      await expect(
        service.findOne(1, { id: 1, email: 'a@a.com', role: 'REQUESTER' } as any),
      ).rejects.toThrow(ForbiddenException);
    });

    it('lets a BUYER view a request owned by someone else', async () => {
      prisma.purchaseRequest.findUnique.mockResolvedValue({ id: 1, requesterId: 999 });
      await expect(
        service.findOne(1, { id: 1, email: 'a@a.com', role: 'BUYER' } as any),
      ).resolves.toBeDefined();
    });
  });

  describe('submit', () => {
    it('throws ConflictException when the request is not in DRAFT', async () => {
      prisma.purchaseRequest.findUnique.mockResolvedValue({
        id: 1,
        requesterId: 1,
        status: 'SUBMITTED',
      });

      await expect(
        service.submit(1, { id: 1, email: 'a@a.com', role: 'REQUESTER' } as any),
      ).rejects.toThrow(ConflictException);
    });

    it('throws ForbiddenException when a non-owner REQUESTER tries to submit', async () => {
      prisma.purchaseRequest.findUnique.mockResolvedValue({
        id: 1,
        requesterId: 999,
        status: 'DRAFT',
      });

      await expect(
        service.submit(1, { id: 1, email: 'a@a.com', role: 'REQUESTER' } as any),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
