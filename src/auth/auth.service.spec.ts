import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;
  let prisma: { user: { findUnique: jest.Mock } };
  let jwtService: { signAsync: jest.Mock };

  beforeEach(() => {
    prisma = { user: { findUnique: jest.fn() } };
    jwtService = { signAsync: jest.fn().mockResolvedValue('signed-token') };
    service = new AuthService(prisma as any, jwtService as any);
  });

  it('returns an access_token when credentials are valid', async () => {
    const hashed = await bcrypt.hash('correct-password', 10);
    prisma.user.findUnique.mockResolvedValue({
      id: 1,
      email: 'a@a.com',
      password: hashed,
      role: 'ADMIN',
    });

    const result = await service.login('a@a.com', 'correct-password');

    expect(result).toEqual({ access_token: 'signed-token' });
    expect(jwtService.signAsync).toHaveBeenCalledWith({
      sub: 1,
      email: 'a@a.com',
      role: 'ADMIN',
    });
  });

  it('throws UnauthorizedException when the user does not exist', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(service.login('nope@a.com', 'x')).rejects.toThrow(UnauthorizedException);
  });

  it('throws UnauthorizedException when the password does not match', async () => {
    const hashed = await bcrypt.hash('correct-password', 10);
    prisma.user.findUnique.mockResolvedValue({
      id: 1,
      email: 'a@a.com',
      password: hashed,
      role: 'ADMIN',
    });
    await expect(service.login('a@a.com', 'wrong')).rejects.toThrow(UnauthorizedException);
  });
});
