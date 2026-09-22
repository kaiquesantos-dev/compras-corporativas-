import { NotFoundException } from '@nestjs/common';
import { DepartmentsService } from './departments.service';

describe('DepartmentsService', () => {
  let service: DepartmentsService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      department: {
        create: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };
    service = new DepartmentsService(prisma);
  });

  it('creates a department', async () => {
    prisma.department.create.mockResolvedValue({ id: 1, name: 'TI' });
    const result = await service.create({ name: 'TI' });
    expect(result).toEqual({ id: 1, name: 'TI' });
  });

  it('throws NotFoundException on findOne when missing', async () => {
    prisma.department.findUnique.mockResolvedValue(null);
    await expect(service.findOne(999)).rejects.toThrow(NotFoundException);
  });

  it('throws NotFoundException on update when missing', async () => {
    prisma.department.findUnique.mockResolvedValue(null);
    await expect(service.update(999, { name: 'X' })).rejects.toThrow(
      NotFoundException,
    );
  });

  it('throws NotFoundException on remove when missing', async () => {
    prisma.department.findUnique.mockResolvedValue(null);
    await expect(service.remove(999)).rejects.toThrow(NotFoundException);
  });
});
