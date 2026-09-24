import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { UsersService } from './users.service';

const REAL_ADMIN = { id: 99, email: 'admin@teste.com', role: 'ADMIN' as const, isAdminDelegate: false };
const DELEGATE = { id: 5, email: 'delegado@teste.com', role: 'APPROVER' as const, isAdminDelegate: true };

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
      prisma.user.findUnique.mockResolvedValue({ id: 1, name: 'Maria', role: 'REQUESTER' });
      prisma.user.update.mockImplementation(({ data }: any) =>
        Promise.resolve({ id: 1, ...data }),
      );

      const result: any = await service.update(1, { password: 'novaSenha123' }, REAL_ADMIN);

      expect(await bcrypt.compare('novaSenha123', result.password)).toBe(true);
    });

    it('clears isAdminDelegate when the role changes away from APPROVER', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 1,
        role: 'APPROVER',
        isAdminDelegate: true,
      });
      prisma.user.update.mockImplementation(({ data }: any) =>
        Promise.resolve({ id: 1, ...data }),
      );

      const result: any = await service.update(1, { role: 'REQUESTER' }, REAL_ADMIN);

      expect(result.isAdminDelegate).toBe(false);
    });

    it('keeps isAdminDelegate untouched when the role stays APPROVER', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 1,
        role: 'APPROVER',
        isAdminDelegate: true,
      });
      prisma.user.update.mockImplementation(({ data }: any) =>
        Promise.resolve({ id: 1, isAdminDelegate: true, ...data }),
      );

      await service.update(1, { role: 'APPROVER' }, REAL_ADMIN);

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.not.objectContaining({ isAdminDelegate: expect.anything() }),
        }),
      );
    });

    it('rejects a delegate (isAdminDelegate, not a real ADMIN) editing a real ADMIN account', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 1, role: 'ADMIN' });

      await expect(
        service.update(1, { name: 'Hackeado' }, DELEGATE),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('allows a real ADMIN to edit another ADMIN account', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 1, role: 'ADMIN' });
      prisma.user.update.mockResolvedValue({ id: 1, role: 'ADMIN', name: 'Novo nome' });

      await expect(
        service.update(1, { name: 'Novo nome' }, REAL_ADMIN),
      ).resolves.toEqual({ id: 1, role: 'ADMIN', name: 'Novo nome' });
    });
  });

  describe('delegateAdmin', () => {
    it('grants isAdminDelegate to an APPROVER when called by a real ADMIN', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 1, role: 'APPROVER' });
      prisma.user.update.mockResolvedValue({ id: 1, isAdminDelegate: true });

      const result = await service.delegateAdmin(1, true, REAL_ADMIN);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 1, role: 'APPROVER' },
        data: { isAdminDelegate: true },
        select: expect.anything(),
      });
      expect(result.isAdminDelegate).toBe(true);
    });

    it('rejects a delegate (not a real ADMIN) trying to grant delegation to someone else', async () => {
      await expect(service.delegateAdmin(1, true, DELEGATE)).rejects.toThrow(
        ForbiddenException,
      );
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('rejects granting delegation to a non-APPROVER', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 1, role: 'BUYER' });

      await expect(service.delegateAdmin(1, true, REAL_ADMIN)).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('allows revoking even if the current role is not APPROVER', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 1, role: 'REQUESTER' });
      prisma.user.update.mockResolvedValue({ id: 1, isAdminDelegate: false });

      await expect(service.delegateAdmin(1, false, REAL_ADMIN)).resolves.toEqual({
        id: 1,
        isAdminDelegate: false,
      });
    });

    it('throws NotFoundException when the target user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.delegateAdmin(999, true, REAL_ADMIN)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('remove', () => {
    it('throws NotFoundException when the user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.remove(999, REAL_ADMIN)).rejects.toThrow(NotFoundException);
    });

    it('rejects a delegate (not a real ADMIN) deleting a real ADMIN account', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 1, role: 'ADMIN' });

      await expect(service.remove(1, DELEGATE)).rejects.toThrow(ForbiddenException);
      expect(prisma.user.delete).not.toHaveBeenCalled();
    });

    it('allows a real ADMIN to delete another ADMIN account', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 1, role: 'ADMIN' });
      prisma.user.delete.mockResolvedValue({ id: 1 });

      await expect(service.remove(1, REAL_ADMIN)).resolves.toEqual({
        message: 'Usuário removido com sucesso.',
      });
    });

    it('allows a delegate to delete a non-ADMIN user normally', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 1, role: 'REQUESTER' });
      prisma.user.delete.mockResolvedValue({ id: 1 });

      await expect(service.remove(1, DELEGATE)).resolves.toEqual({
        message: 'Usuário removido com sucesso.',
      });
    });
  });
});
