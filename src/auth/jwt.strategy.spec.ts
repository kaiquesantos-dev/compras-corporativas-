import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy', () => {
  let prisma: { user: { findUnique: jest.Mock } };
  let strategy: JwtStrategy;

  beforeEach(() => {
    prisma = { user: { findUnique: jest.fn() } };
    const configService = {
      getOrThrow: () => 'test-secret',
    } as unknown as ConfigService;
    strategy = new JwtStrategy(configService, prisma as any);
  });

  it('rejects a payload missing required claims', async () => {
    await expect(
      strategy.validate({ sub: 0, email: '', role: 'ADMIN' } as any),
    ).rejects.toThrow(UnauthorizedException);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('re-fetches the user from the database instead of trusting the token payload', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 1,
      email: 'current@compras.com',
      role: 'REQUESTER',
    });

    // Payload traz um email/role antigos (ex: token emitido antes de uma
    // troca de papel) — o resultado deve vir do banco, não do payload.
    const result = await strategy.validate({
      sub: 1,
      email: 'old@compras.com',
      role: 'ADMIN',
    });

    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 1 },
      select: { id: true, email: true, role: true },
    });
    expect(result).toEqual({
      id: 1,
      email: 'current@compras.com',
      role: 'REQUESTER',
    });
  });

  it('rejects a token whose user no longer exists (deleted account)', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(
      strategy.validate({ sub: 999, email: 'ghost@compras.com', role: 'ADMIN' }),
    ).rejects.toThrow(UnauthorizedException);
  });
});
