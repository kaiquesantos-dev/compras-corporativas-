import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuthStore } from '../store/auth-store'
import type { Role } from '../api/types'
import { AppShell } from '../components/layout/AppShell'

// Só controla o que a UI mostra/esconde — a autorização de verdade acontece
// no backend (RolesGuard) a cada requisição. Isto aqui evita que um usuário
// veja uma tela que não conseguiria usar de qualquer forma.
export function ProtectedRoute({ roles, children }: { roles?: Role[]; children: ReactNode }) {
  const { token, user } = useAuthStore()

  if (!token || !user) {
    return <Navigate to="/login" replace />
  }
  const allowed = !roles || roles.includes(user.role) || (user.isAdminDelegate && roles.includes('ADMIN'))
  if (!allowed) {
    return <Navigate to="/" replace />
  }
  return <AppShell>{children}</AppShell>
}
