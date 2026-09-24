import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { createUser, deleteUser, fetchUsers, setAdminDelegate, type CreateUserInput } from '../api/users'
import { fetchDepartments } from '../api/departments'
import type { Role } from '../api/types'
import { Button } from '../components/ui/Button'
import { TextField } from '../components/ui/TextField'
import { Select } from '../components/ui/Select'
import { Modal } from '../components/ui/Modal'
import { Pagination } from '../components/ui/Pagination'
import { useConfirm } from '../hooks/confirm-context'

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
  const [page, setPage] = useState(1)
  const queryClient = useQueryClient()
  const confirm = useConfirm()

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
  const deleteMutation = useMutation({ mutationFn: deleteUser, onSuccess: invalidate })
  const delegateMutation = useMutation({
    mutationFn: (input: { id: number; granted: boolean }) => setAdminDelegate(input.id, input.granted),
    onSuccess: invalidate,
  })

  // Ligar/desligar acesso ADMIN é uma ação sensível o suficiente pra pedir
  // confirmação antes — mesmo padrão usado em "Remover".
  async function handleToggleDelegate(user: { id: number; name: string }, granted: boolean) {
    const ok = await confirm({
      title: granted ? 'Delegar acesso ADMIN?' : 'Revogar acesso ADMIN?',
      message: granted
        ? `"${user.name}" passará a ter acesso total de administrador, além do papel de aprovador. Use para cobrir a ausência do admin (ex: férias).`
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

      {data && (
        <>
          <div className="overflow-x-auto rounded-[6px] bg-surface-card shadow-card">
            <table className="w-full text-left text-sm">
              <thead className="bg-grey1 text-xs font-semibold text-ink-muted uppercase">
                <tr>
                  <th className="px-4 py-3">Nome</th>
                  <th className="px-4 py-3">E-mail</th>
                  <th className="px-4 py-3">Papel</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {data.data.map((user) => (
                  <tr key={user.id} className="border-t border-grey1 align-top">
                    <td className="px-4 py-3 text-ink">{user.name}</td>
                    <td className="px-4 py-3 text-ink-muted">{user.email}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-ink-muted">
                      {roleLabels[user.role]}
                      {user.isAdminDelegate && (
                        <span className="ml-2 inline-block rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold text-on-accent uppercase">
                          Admin delegado
                        </span>
                      )}
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
                          {user.isAdminDelegate ? 'Revogar admin' : 'Delegar admin'}
                        </button>
                      )}
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

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
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
        <TextField label="Nome" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
        <TextField label="E-mail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <TextField
          label="Senha"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
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
        />

        {error ? <p className="text-sm text-accent-text">{errorMessage(error, 'Não foi possível criar.')}</p> : null}
        <Button type="submit" disabled={pending}>
          {pending ? 'Criando...' : 'Criar usuário'}
        </Button>
      </form>
    </Modal>
  )
}
