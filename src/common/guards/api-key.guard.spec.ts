import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiKeyGuard } from './api-key.guard';

function buildContext(headers: Record<string, string>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ headers }) }),
  } as unknown as ExecutionContext;
}

describe('ApiKeyGuard', () => {
  it('allows the request when the X-API-KEY header matches API_KEY', () => {
    const configService = {
      getOrThrow: jest.fn().mockReturnValue('minha-chave'),
    } as unknown as ConfigService;
    const guard = new ApiKeyGuard(configService);
    expect(
      guard.canActivate(buildContext({ 'x-api-key': 'minha-chave' })),
    ).toBe(true);
  });

  it('throws UnauthorizedException when the header is missing', () => {
    const configService = {
      getOrThrow: jest.fn().mockReturnValue('minha-chave'),
    } as unknown as ConfigService;
    const guard = new ApiKeyGuard(configService);
    expect(() => guard.canActivate(buildContext({}))).toThrow(
      UnauthorizedException,
    );
  });

  it('throws UnauthorizedException when the header does not match', () => {
    const configService = {
      getOrThrow: jest.fn().mockReturnValue('minha-chave'),
    } as unknown as ConfigService;
    const guard = new ApiKeyGuard(configService);
    expect(() =>
      guard.canActivate(buildContext({ 'x-api-key': 'chave-errada' })),
    ).toThrow(UnauthorizedException);
  });
});
