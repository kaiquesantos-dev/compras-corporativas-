import { NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { UsersService } from './users.service';

describe('UsersService', () => {
  let service: UsersService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      user: {
        create: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      department: { findUnique: jest.fn() },
    };
    service = new UsersService(prisma);
  });

  describe('create', () => {
    it('hashes the password before persisting', async () => {
      prisma.department.findUnique.mockResolvedValue({ id: 1 });
      prisma.user.create.mockImplementation(({ data }: any) =>
        Promise.resolve({ id: 1, ...data }),
      );

      const result: any = await service.create({
        name: 'Maria',
        email: 'maria@teste.com',
        password: 'senha123',
        role: 'REQUESTER',
        departmentId: 1,
      });

      expect(result.password).not.toBe('senha123');
      expect(await bcrypt.compare('senha123', result.password)).toBe(true);
    });

    it('throws NotFoundException when departmentId does not exist', async () => {
      prisma.department.findUnique.mockResolvedValue(null);

      await expect(
        service.create({
          name: 'Maria',
          email: 'maria@teste.com',
          password: 'senha123',
          role: 'REQUESTER',
          departmentId: 999,
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('findOne', () => {
    it('throws NotFoundException when the user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.findOne(999)).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('hashes the new password when provided', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 1, name: 'Maria' });
      prisma.user.update.mockImplementation(({ data }: any) =>
        Promise.resolve({ id: 1, ...data }),
      );

      const result: any = await service.update(1, { password: 'novaSenha123' });

      expect(await bcrypt.compare('novaSenha123', result.password)).toBe(true);
    });
  });

  describe('remove', () => {
    it('throws NotFoundException when the user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.remove(999)).rejects.toThrow(NotFoundException);
    });
  });
});
