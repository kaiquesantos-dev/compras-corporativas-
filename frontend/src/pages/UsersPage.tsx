import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import {
  createUser,
  deleteUser,
  fetchUsers,
  setAdminDelegate,
  updateUser,
  type CreateUserInput,
  type UpdateUserInput,
} from '../api/users'
import { fetchDepartments } from '../api/departments'
import type { Role, User } from '../api/types'
import { Button } from '../components/ui/Button'
import { TextField } from '../components/ui/TextField'
import { Select } from '../components/ui/Select'
import { Modal } from '../components/ui/Modal'
import { Pagination } from '../components/ui/Pagination'
import { useConfirm } from '../hooks/confirm-context'
import { useAuthStore } from '../store/auth-store'

const REQUESTER_NEEDS_DEPARTMENT = 'Solicitantes precisam de um departamento.'

const roleLabels: Record<Role, string> = {
  REQUESTER: 'Solicitante',
  BUYER: 'Comprador',
  APPROVER: 'Aprovador',
  ADMIN: 'Administrador',
}

function errorMessage(err: unknown, fallback: string): string {
  if (!isAxiosError(err)) return fallback
  const message = (err.response?.data as { message?: string | string[] } | undefined)?.message
  return Array.isArray(message) ? message.join(' ') : (message ?? fallback)
}

export function UsersPage() {
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<User | null>(null)
  const [page, setPage] = useState(1)
  const queryClient = useQueryClient()
  const confirm = useConfirm()
  const currentUserId = useAuthStore((state) => state.user?.id)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['users', page],
    queryFn: () => fetchUsers(page),
  })
  const { data: departments } = useQuery({
    queryKey: ['departments'],
    queryFn: () => fetchDepartments(),
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['users'] })
  const createMutation = useMutation({ mutationFn: createUser, onSuccess: invalidate })
  const updateMutation = useMutation({
    mutationFn: (input: { id: number; data: UpdateUserInput }) => updateUser(input.id, input.data),
    onSuccess: invalidate,
  })
  const deleteMutation = useMutation({ mutationFn: deleteUser, onSuccess: invalidate })
  const deleteError = deleteMutation.error
    ? errorMessage(deleteMutation.error, 'Não foi possível remover este usuário.')
    : null
  const delegateMutation = useMutation({
    mutationFn: (input: { id: number; granted: boolean }) => setAdminDelegate(input.id, input.granted),
    onSuccess: invalidate,
  })

  // Ligar/desligar acesso ADMIN é uma ação sensível o suficiente pra pedir
  // confirmação antes — mesmo padrão usado em "Remover".
  async function handleToggleDelegate(user: { id: number; name: string }, granted: boolean) {
    const ok = await confirm({
      title: granted ? 'Delegar acesso de administrador?' : 'Revogar acesso de administrador?',
      message: granted
        ? `"${user.name}" passará a ter acesso total de administrador, além do papel de aprovador. Use para cobrir a ausência do administrador (ex: férias).`
        : `"${user.name}" perderá o acesso de administrador delegado imediatamente, voltando a ter só as permissões de aprovador.`,
      confirmLabel: granted ? 'Delegar' : 'Revogar',
      variant: granted ? 'success' : 'danger',
    })
    if (ok) delegateMutation.mutate({ id: user.id, granted })
  }

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="font-sans text-3xl font-bold text-accent italic">_Usuários</h1>
        <Button onClick={() => setCreating(true)}>Novo usuário</Button>
      </div>

      {isLoading && <p className="text-ink-muted">Carregando...</p>}
      {isError && <p className="text-accent-text">Não foi possível carregar os usuários.</p>}

      {deleteError && (
        <div className="mb-4 flex items-start justify-between gap-4 rounded-[6px] border border-accent-text/30 bg-accent-text/10 p-4 text-sm text-accent-text">
          <p>{deleteError}</p>
          <button
            onClick={() => deleteMutation.reset()}
            className="shrink-0 text-xs font-semibold uppercase hover:underline"
          >
            Fechar
          </button>
        </div>
      )}

      {data && (
        <>
          <div className="overflow-x-auto rounded-[6px] bg-surface-card shadow-card">
            <table className="w-full text-left text-sm">
              <thead className="bg-grey1 text-xs font-semibold text-ink-muted uppercase">
                <tr>
                  <th className="px-4 py-3">Nome</th>
                  <th className="px-4 py-3">E-mail</th>
                  <th className="px-4 py-3">Papel · Departamento</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {data.data.map((user) => (
                  <tr
                    key={user.id}
                    className={`border-t border-grey1 align-top ${user.isActive ? '' : 'bg-surface-muted/60'}`}
                  >
                    <td className={`px-4 py-3 ${user.isActive ? 'text-ink' : 'text-ink-muted'}`}>
                      {user.name}
                      {/* Soft delete: desativado continua na lista (e no
                          histórico), só sinalizado. */}
                      {!user.isActive && (
                        <span className="ml-2 inline-block rounded-full bg-grey2 px-2 py-0.5 text-[10px] font-semibold text-ink uppercase">
                          Inativo
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-ink-muted">{user.email}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-ink-muted">
                      {roleLabels[user.role]}
                      {user.isAdminDelegate && (
                        <span className="ml-2 inline-block rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold text-on-accent uppercase">
                          Administrador delegado
                        </span>
                      )}
                      {/* Departamento como segunda linha, não como coluna: uma
                          coluna a mais empurrava as ações para fora da tela. */}
                      <p className="text-xs text-ink-muted/80">
                        {departments?.data.find((dept) => dept.id === user.departmentId)?.name ?? 'Sem departamento'}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {/* Delegação de ADMIN só faz sentido pra um APPROVER
                          (é a regra que o backend também aplica) — outros
                          papéis nem mostram o botão. */}
                      {user.role === 'APPROVER' && (
                        <button
                          onClick={() => handleToggleDelegate(user, !user.isAdminDelegate)}
                          disabled={delegateMutation.isPending}
                          className="mr-4 text-xs font-semibold text-ink-muted uppercase hover:text-accent-text"
                        >
                          {user.isAdminDelegate ? 'Revogar administrador' : 'Delegar administrador'}
                        </button>
                      )}
                      <button
                        onClick={() => setEditing(user)}
                        className="mr-4 text-xs font-semibold text-ink-muted uppercase hover:text-accent-text"
                      >
                        Editar
                      </button>
                      {/* Ninguém exclui a própria conta (o backend também
                          barra) — senão o sistema podia ficar sem admin. */}
                      {user.id !== currentUserId && (
                        <button
                          onClick={async () => {
                            const ok = await confirm({
                              title: 'Remover usuário?',
                              message: `"${user.name}" será removido permanentemente.`,
                              confirmLabel: 'Remover',
                            })
                            if (ok) deleteMutation.mutate(user.id)
                          }}
                          className="text-xs font-semibold text-accent-text uppercase"
                        >
                          Remover
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPageChange={setPage} />
        </>
      )}

      {creating && (
        <NewUserModal
          departments={departments?.data ?? []}
          onClose={() => setCreating(false)}
          onSubmit={(input) => createMutation.mutate(input, { onSuccess: () => setCreating(false) })}
          pending={createMutation.isPending}
          error={createMutation.error}
        />
      )}

      {editing && (
        <EditUserModal
          user={editing}
          isSelf={editing.id === currentUserId}
          departments={departments?.data ?? []}
          onClose={() => setEditing(null)}
          onSubmit={(input) =>
            updateMutation.mutate({ id: editing.id, data: input }, { onSuccess: () => setEditing(null) })
          }
          pending={updateMutation.isPending}
          error={updateMutation.error}
        />
      )}
    </div>
  )
}

function NewUserModal({
  departments,
  onClose,
  onSubmit,
  pending,
  error,
}: {
  departments: { id: number; name: string }[]
  onClose: () => void
  onSubmit: (input: CreateUserInput) => void
  pending: boolean
  error: unknown
}) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<Role>('REQUESTER')
  const [departmentId, setDepartmentId] = useState<string>('')
  const missingDepartment = role === 'REQUESTER' && !departmentId

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (missingDepartment) return
    onSubmit({
      name,
      email,
      password,
      role,
      departmentId: departmentId ? Number(departmentId) : undefined,
    })
  }

  return (
    <Modal title="_Novo usuário" onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <TextField
          label="Nome"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          autoFocus
          minLength={2}
          maxLength={100}
        />
        <TextField
          label="E-mail"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          maxLength={255}
        />
        <TextField
          label="Senha"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={6}
          maxLength={72}
          hint="Mínimo de 6 caracteres."
        />

        <Select
          label="Papel"
          value={role}
          onChange={(v) => setRole(v as Role)}
          options={Object.entries(roleLabels).map(([value, label]) => ({ value, label }))}
        />

        <Select
          label="Departamento"
          value={departmentId}
          onChange={setDepartmentId}
          options={[
            { value: '', label: 'Sem departamento' },
            ...departments.map((dept) => ({ value: String(dept.id), label: dept.name })),
          ]}
          // No cadastro novo é orientação (cinza), não erro: o formulário
          // acabou de abrir e a pessoa ainda nem escolheu nada. O botão
          // continua desabilitado enquanto faltar o departamento.
          hint={missingDepartment ? 'Obrigatório para solicitantes.' : undefined}
        />

        {error ? <p className="text-sm text-accent-text">{errorMessage(error, 'Não foi possível criar.')}</p> : null}
        <Button type="submit" disabled={pending || missingDepartment}>
          {pending ? 'Criando...' : 'Criar usuário'}
        </Button>
      </form>
    </Modal>
  )
}

function EditUserModal({
  user,
  isSelf,
  departments,
  onClose,
  onSubmit,
  pending,
  error,
}: {
  user: User
  isSelf: boolean
  departments: { id: number; name: string }[]
  onClose: () => void
  onSubmit: (input: UpdateUserInput) => void
  pending: boolean
  error: unknown
}) {
  const [name, setName] = useState(user.name)
  const [email, setEmail] = useState(user.email)
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<Role>(user.role)
  const [departmentId, setDepartmentId] = useState<string>(user.departmentId ? String(user.departmentId) : '')
  const [isActive, setIsActive] = useState(String(user.isActive))
  const missingDepartment = role === 'REQUESTER' && !departmentId

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (missingDepartment) return
    onSubmit({
      // Ninguém desativa a própria conta (o backend barra com 403) — não
      // manda o campo quando é você mesmo.
      isActive: isSelf ? undefined : isActive === 'true',
      name,
      email,
      password: password || undefined,
      // O próprio papel não é editável (o backend barra com 403) — não
      // manda o campo, pra salvar nome/e-mail/senha não falhar à toa.
      role: isSelf ? undefined : role,
      // null (e não undefined) quando "Sem departamento": undefined some do
      // JSON e o backend manteria o departamento antigo em silêncio.
      departmentId: departmentId ? Number(departmentId) : null,
    })
  }

  return (
    <Modal title="_Editar usuário" onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <TextField
          label="Nome"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          autoFocus
          minLength={2}
          maxLength={100}
        />
        <TextField
          label="E-mail"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          maxLength={255}
        />
        <TextField
          label="Nova senha (opcional)"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={6}
          maxLength={72}
          hint="Deixe em branco para manter a senha atual."
        />

        <Select
          label="Papel"
          value={role}
          onChange={(v) => setRole(v as Role)}
          options={Object.entries(roleLabels).map(([value, label]) => ({ value, label }))}
          disabled={isSelf}
          hint={isSelf ? 'Você não pode alterar o seu próprio papel.' : undefined}
        />

        <Select
          label="Departamento"
          value={departmentId}
          onChange={setDepartmentId}
          options={[
            { value: '', label: 'Sem departamento' },
            ...departments.map((dept) => ({ value: String(dept.id), label: dept.name })),
          ]}
          error={missingDepartment ? REQUESTER_NEEDS_DEPARTMENT : undefined}
        />

        <Select
          label="Status"
          value={isActive}
          onChange={setIsActive}
          options={[
            { value: 'true', label: 'Ativo' },
            { value: 'false', label: 'Inativo' },
          ]}
          disabled={isSelf}
          hint={
            isSelf
              ? 'Você não pode desativar a sua própria conta.'
              : 'Inativo não consegue entrar e perde a sessão na hora, mas continua no histórico.'
          }
        />

        {error ? <p className="text-sm text-accent-text">{errorMessage(error, 'Não foi possível salvar.')}</p> : null}
        <Button type="submit" disabled={pending || missingDepartment}>
          {pending ? 'Salvando...' : 'Salvar alterações'}
        </Button>
      </form>
    </Modal>
  )
}
