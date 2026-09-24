import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';

function buildContext(
  user?: { role: string; isAdminDelegate?: boolean },
): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  it('allows access when no @Roles metadata is set', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(undefined),
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);
    expect(guard.canActivate(buildContext({ role: 'REQUESTER' }))).toBe(true);
  });

  it('allows access when the user role is in the required roles', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(['ADMIN', 'BUYER']),
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);
    expect(guard.canActivate(buildContext({ role: 'BUYER' }))).toBe(true);
  });

  it('throws when the user role is not in the required roles', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(['ADMIN']),
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);
    expect(() =>
      guard.canActivate(buildContext({ role: 'REQUESTER' })),
    ).toThrow();
  });

  it('throws when there is no authenticated user at all', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(['ADMIN']),
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);
    expect(() => guard.canActivate(buildContext(undefined))).toThrow();
  });

  it('allows an APPROVER with isAdminDelegate through a route that requires ADMIN', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(['ADMIN']),
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);
    expect(
      guard.canActivate(
        buildContext({ role: 'APPROVER', isAdminDelegate: true }),
      ),
    ).toBe(true);
  });

  it('still throws for an APPROVER without isAdminDelegate on a route that requires ADMIN', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(['ADMIN']),
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);
    expect(() =>
      guard.canActivate(
        buildContext({ role: 'APPROVER', isAdminDelegate: false }),
      ),
    ).toThrow();
  });

  it('does not let isAdminDelegate substitute for a route that does not require ADMIN', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(['BUYER']),
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);
    expect(() =>
      guard.canActivate(
        buildContext({ role: 'APPROVER', isAdminDelegate: true }),
      ),
    ).toThrow();
  });
});
