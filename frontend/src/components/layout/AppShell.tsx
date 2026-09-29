import { useEffect, useState, type ReactNode } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { fetchCurrentUser } from '../../api/auth'
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
  // GET /suppliers e GET /departments são liberados pra qualquer papel
  // autenticado no backend — só as ações de escrita são restritas (BUYER/
  // ADMIN e ADMIN, respectivamente), e essa restrição é aplicada dentro de
  // cada página, não escondendo o item do menu inteiro.
  { label: 'Fornecedores', to: '/suppliers', roles: ['REQUESTER', 'BUYER', 'APPROVER', 'ADMIN'] },
  { label: 'Aprovações', to: '/approvals', roles: ['APPROVER', 'ADMIN'] },
  { label: 'Usuários', to: '/users', roles: ['ADMIN'] },
  { label: 'Departamentos', to: '/departments', roles: ['REQUESTER', 'BUYER', 'APPROVER', 'ADMIN'] },
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
  const setSession = useAuthStore((state) => state.setSession)
  const token = useAuthStore((state) => state.token)
  const navigate = useNavigate()
  // Sidebar fixa a partir do breakpoint md; abaixo disso vira um drawer que
  // começa fechado — numa tela de celular (~375px) uma sidebar de 256px
  // sozinha já ocupa 2/3 da largura e deixa o conteúdo ilegível.
  const [menuOpen, setMenuOpen] = useState(false)

  // Revalida id/email/role/isAdminDelegate periodicamente enquanto a app
  // fica aberta — sem isso, um admin concedendo/revogando uma delegação de
  // acesso só apareceria pro usuário delegado depois de um logout/login
  // manual, já que o estado local (user) só era populado uma vez, no login.
  //
  // A query key inclui o token (não é só ['auth-me']) de propósito: sem
  // isso, se o usuário A deslogasse e o usuário B logasse na mesma aba
  // antes de uma resposta de A ainda em voo chegar, essa resposta cairia
  // no cache compartilhado da mesma key e podia parear o token novo de B
  // com os dados antigos de A (role/isAdminDelegate errados). Com a key
  // por token, trocar de sessão sempre gera uma query nova e isolada —
  // uma resposta tardia da sessão anterior nunca alcança o cache atual.
  const { data: currentUser } = useQuery({
    queryKey: ['auth-me', token],
    queryFn: fetchCurrentUser,
    enabled: !!token,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  })
  useEffect(() => {
    if (currentUser && token) setSession(token, currentUser)
  }, [currentUser, token, setSession])

  const visibleItems = NAV_ITEMS.filter(
    (item) =>
      user && (item.roles.includes(user.role) || (user.isAdminDelegate && item.roles.includes('ADMIN'))),
  )

  function handleLogout() {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="min-h-screen md:flex">
      {/* Barra superior só em mobile/tablet: logo + botão de abrir o menu. */}
      <div className="flex items-center justify-between bg-surface-inverse px-4 py-3 md:hidden">
        <img src="/brand/itlean-logo-white.svg" alt="IT Lean" className="h-5 w-auto" />
        <button
          onClick={() => setMenuOpen(true)}
          aria-label="Abrir menu"
          className="text-2xl leading-none text-white"
        >
          ☰
        </button>
      </div>

      {/* Overlay escuro atrás do drawer, só quando aberto em telas pequenas. */}
      {menuOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setMenuOpen(false)}
        />
      )}

      {/* Sidebar escura — adaptação do Footer do design system (surface
          inverse / darkblack) para navegação de aplicação em vez de rodapé
          de site institucional. Fixa em desktop; drawer deslizante abaixo
          do breakpoint md. */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-64 shrink-0 flex-col bg-surface-inverse text-ink-inverse transition-transform duration-200 ease-in-out md:static md:translate-x-0',
          menuOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="hidden px-6 py-6 md:block">
          <img src="/brand/itlean-logo-white.svg" alt="IT Lean" className="h-6 w-auto" />
          <p className="mt-1 text-xs tracking-wide text-grey6 uppercase">Compras Corporativas</p>
        </div>
        <nav className="flex-1 px-3 pt-6 md:pt-0">
          {visibleItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              onClick={() => setMenuOpen(false)}
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
          <p className="text-xs text-grey6">
            {user ? roleLabels[user.role] : ''}
            {user?.isAdminDelegate && (
              <span className="ml-1 rounded-full bg-accent px-1.5 py-0.5 text-[9px] font-semibold text-on-accent uppercase">
                Administrador delegado
              </span>
            )}
          </p>
          <button
            onClick={handleLogout}
            className="mt-3 text-xs font-semibold text-grey6 uppercase hover:text-white"
          >
            Sair
          </button>
        </div>
      </aside>

      <main className="min-w-0 flex-1 overflow-y-auto bg-surface-muted p-4 md:p-8">{children}</main>
    </div>
  )
}
