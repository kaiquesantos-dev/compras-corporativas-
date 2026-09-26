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

  describe('update', () => {
    // O CNPJ não está em UpdateSupplierDto (é a identidade legal do
    // fornecedor, trava depois do cadastro — ver o comentário no DTO). Um
    // "document" nesse body só chegaria aqui contornando o ValidationPipe
    // (ex: um teste unitário chamando o service direto, como abaixo); ainda
    // assim o update() atual simplesmente ignora esse campo.
    it('never re-consults the CNPJ lookup on update, mesmo se "document" vier no body', async () => {
      prisma.supplier.findUnique.mockResolvedValue({ id: 1, document: '11111111000191' });
      prisma.supplier.update.mockResolvedValue({ id: 1, document: '11111111000191' });

      await service.update(1, { document: '19131243000197', phone: '11999999999' } as any);

      expect(cnpjLookupService.lookup).not.toHaveBeenCalled();
      expect(prisma.supplier.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.not.objectContaining({ document: expect.anything() }),
        }),
      );
    });

    it('updates contact fields normally', async () => {
      prisma.supplier.findUnique.mockResolvedValue({ id: 1, document: '11111111000191' });
      prisma.supplier.update.mockResolvedValue({ id: 1 });

      await service.update(1, { phone: '11999999999', isActive: false } as any);

      expect(prisma.supplier.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 1 },
          data: expect.objectContaining({ phone: '11999999999', isActive: false }),
        }),
      );
    });
  });

  describe('findOne', () => {
    it('throws NotFoundException when the supplier does not exist', async () => {
      prisma.supplier.findUnique.mockResolvedValue(null);
      await expect(service.findOne(999)).rejects.toThrow(NotFoundException);
    });
  });
});
