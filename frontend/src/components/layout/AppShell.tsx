import type { ReactNode } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../store/auth-store'
import { cn } from '../../lib/cn'
import type { Role } from '../../api/types'

interface NavItem {
  label: string
  to: string
  roles: Role[]
}

// Cada item declara quais papéis podem vê-lo — a mesma matriz de permissões
// documentada no Swagger do backend (ver "Papéis permitidos" em cada
// endpoint), só que aplicada à navegação em vez de a uma rota HTTP.
const NAV_ITEMS: NavItem[] = [
  { label: 'Painel', to: '/', roles: ['REQUESTER', 'BUYER', 'APPROVER', 'ADMIN'] },
  { label: 'Solicitações', to: '/purchase-requests', roles: ['REQUESTER', 'BUYER', 'APPROVER', 'ADMIN'] },
  { label: 'Fornecedores', to: '/suppliers', roles: ['BUYER', 'ADMIN'] },
  { label: 'Aprovações', to: '/approvals', roles: ['APPROVER', 'ADMIN'] },
  { label: 'Usuários', to: '/users', roles: ['ADMIN'] },
  { label: 'Departamentos', to: '/departments', roles: ['ADMIN'] },
]

const roleLabels: Record<Role, string> = {
  REQUESTER: 'Solicitante',
  BUYER: 'Comprador',
  APPROVER: 'Aprovador',
  ADMIN: 'Administrador',
}

export function AppShell({ children }: { children: ReactNode }) {
  const user = useAuthStore((state) => state.user)
  const logout = useAuthStore((state) => state.logout)
  const navigate = useNavigate()

  const visibleItems = NAV_ITEMS.filter((item) => user && item.roles.includes(user.role))

  function handleLogout() {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="flex min-h-screen">
      {/* Sidebar escura — adaptação do Footer do design system (surface
          inverse / darkblack) para navegação de aplicação em vez de rodapé
          de site institucional. */}
      <aside className="flex w-64 shrink-0 flex-col bg-surface-inverse text-ink-inverse">
        <div className="px-6 py-6">
          <img src="/brand/itlean-logo-white.svg" alt="IT Lean" className="h-6 w-auto" />
          <p className="mt-1 text-xs tracking-wide text-grey6 uppercase">Compras Corporativas</p>
        </div>
        <nav className="flex-1 px-3">
          {visibleItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                cn(
                  'mb-1 block rounded-[6px] px-3 py-2.5 text-sm font-semibold uppercase transition-colors',
                  isActive ? 'bg-accent text-on-accent' : 'text-grey6 hover:bg-graphite hover:text-white',
                )
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-darkblue px-6 py-4">
          <p className="truncate text-sm font-semibold text-white">{user?.email}</p>
          <p className="text-xs text-grey6">{user ? roleLabels[user.role] : ''}</p>
          <button
            onClick={handleLogout}
            className="mt-3 text-xs font-semibold text-grey6 uppercase hover:text-white"
          >
            Sair
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto bg-surface-muted p-8">{children}</main>
    </div>
  )
}
