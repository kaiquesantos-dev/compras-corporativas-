import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SuppliersService } from './suppliers.service';

describe('SuppliersService', () => {
  let service: SuppliersService;
  let prisma: any;
  let cnpjLookupService: { lookup: jest.Mock };

  beforeEach(() => {
    prisma = {
      supplier: {
        create: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };
    cnpjLookupService = { lookup: jest.fn() };
    service = new SuppliersService(prisma, cnpjLookupService as any);
  });

  describe('create', () => {
    it('fills legalName/address from the CNPJ lookup when not provided manually', async () => {
      cnpjLookupService.lookup.mockResolvedValue({
        legalName: 'Fornecedor Real LTDA',
        tradeName: 'Fornecedor Real',
        zipCode: '01311902',
        street: 'Paulista, 37',
        city: 'São Paulo',
        state: 'SP',
        federalRegistrationStatus: 'ATIVA',
      });
      prisma.supplier.create.mockImplementation(({ data }: any) =>
        Promise.resolve({ id: 1, ...data }),
      );

      const result: any = await service.create({
        document: '19131243000197',
      });

      expect(result.legalName).toBe('Fornecedor Real LTDA');
      expect(result.city).toBe('São Paulo');
    });

    it('lets a manually provided field override the CNPJ lookup result', async () => {
      cnpjLookupService.lookup.mockResolvedValue({
        legalName: 'Nome Oficial LTDA',
        tradeName: 'Nome Oficial',
        zipCode: '01311902',
        street: 'Paulista, 37',
        city: 'São Paulo',
        state: 'SP',
        federalRegistrationStatus: 'ATIVA',
      });
      prisma.supplier.create.mockImplementation(({ data }: any) =>
        Promise.resolve({ id: 1, ...data }),
      );

      const result: any = await service.create({
        document: '19131243000197',
        tradeName: 'Nome Escolhido Pelo Comprador',
      });

      expect(result.tradeName).toBe('Nome Escolhido Pelo Comprador');
      expect(result.legalName).toBe('Nome Oficial LTDA');
    });

    it('falls back to manual data when the lookup fails and legalName was provided', async () => {
      cnpjLookupService.lookup.mockResolvedValue(null);
      prisma.supplier.create.mockImplementation(({ data }: any) =>
        Promise.resolve({ id: 1, ...data }),
      );

      const result: any = await service.create({
        document: '19131243000197',
        legalName: 'Fornecedor Informado Manualmente LTDA',
      });

      expect(result.legalName).toBe('Fornecedor Informado Manualmente LTDA');
    });

    it('throws BadRequestException when the lookup fails and no manual legalName was given', async () => {
      cnpjLookupService.lookup.mockResolvedValue(null);

      await expect(
        service.create({ document: '19131243000197' } as any),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('findOne', () => {
    it('throws NotFoundException when the supplier does not exist', async () => {
      prisma.supplier.findUnique.mockResolvedValue(null);
      await expect(service.findOne(999)).rejects.toThrow(NotFoundException);
    });
  });
});
