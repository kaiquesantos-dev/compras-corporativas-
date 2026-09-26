import type { AuthenticatedUser } from './types/authenticated-user.type';

// Um APPROVER com acesso ADMIN delegado (isAdminDelegate) cobre o admin por
// completo nas regras de negócio — mesma equivalência que o RolesGuard aplica
// nas rotas. Exceção deliberada: ações que só um ADMIN de verdade pode fazer
// (ver assertRealAdmin em UsersService) não usam este helper.
export function actsAsAdmin(user: AuthenticatedUser): boolean {
  return user.role === 'ADMIN' || user.isAdminDelegate;
}
