import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { createUser, deleteUser, fetchUsers, type CreateUserInput } from '../api/users'
import { fetchDepartments } from '../api/departments'
import type { Role } from '../api/types'
import { Button } from '../components/ui/Button'
import { TextField } from '../components/ui/TextField'
import { Modal } from '../components/ui/Modal'
import { Pagination } from '../components/ui/Pagination'

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
                    <td className="px-4 py-3 whitespace-nowrap text-ink-muted">{roleLabels[user.role]}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <button
                        onClick={() => {
                          if (confirm(`Remover "${user.name}"?`)) deleteMutation.mutate(user.id)
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

        <div>
          <label className="mb-1 block text-xs font-semibold tracking-wide text-ink-muted uppercase">Papel</label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
            className="w-full rounded-[5px] border border-border bg-surface-card px-4 py-3 text-ink"
          >
            {Object.entries(roleLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold tracking-wide text-ink-muted uppercase">
            Departamento
          </label>
          <select
            value={departmentId}
            onChange={(e) => setDepartmentId(e.target.value)}
            className="w-full rounded-[5px] border border-border bg-surface-card px-4 py-3 text-ink"
          >
            <option value="">Sem departamento</option>
            {departments.map((dept) => (
              <option key={dept.id} value={dept.id}>
                {dept.name}
              </option>
            ))}
          </select>
        </div>

        {error ? <p className="text-sm text-accent-text">{errorMessage(error, 'Não foi possível criar.')}</p> : null}
        <Button type="submit" disabled={pending}>
          {pending ? 'Criando...' : 'Criar usuário'}
        </Button>
      </form>
    </Modal>
  )
}
