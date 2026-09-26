import type { AuthenticatedUser } from '../api/types'

// Um APPROVER com acesso ADMIN delegado (isAdminDelegate) cobre o admin por
// completo — mesma regra do RolesGuard no backend. Toda tela que decide
// mostrar uma ação de admin deve usar isto, nunca só `role === 'ADMIN'`.
export function actsAsAdmin(user: AuthenticatedUser | null | undefined): boolean {
  return user?.role === 'ADMIN' || Boolean(user?.isAdminDelegate)
}
