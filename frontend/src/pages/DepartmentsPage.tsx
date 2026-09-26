import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import {
  createDepartment,
  deleteDepartment,
  fetchDepartments,
  updateDepartment,
} from '../api/departments'
import type { Department } from '../api/types'
import { Button } from '../components/ui/Button'
import { TextField } from '../components/ui/TextField'
import { Modal } from '../components/ui/Modal'
import { useConfirm } from '../hooks/confirm-context'
import { useAuthStore } from '../store/auth-store'
import { actsAsAdmin } from '../lib/roles'

function errorMessage(err: unknown, fallback: string): string {
  if (!isAxiosError(err)) return fallback
  const message = (err.response?.data as { message?: string | string[] } | undefined)?.message
  return Array.isArray(message) ? message.join(' ') : (message ?? fallback)
}

export function DepartmentsPage() {
  const [editing, setEditing] = useState<Department | 'new' | null>(null)
  const queryClient = useQueryClient()
  const confirm = useConfirm()
  // GET /departments é liberado pra qualquer papel; criar/editar/remover é
  // ADMIN only no backend (departments.controller.ts) — as ações escritas
  // ficam escondidas pra quem não é ADMIN, mas a listagem continua visível.
  const isAdmin = actsAsAdmin(useAuthStore((state) => state.user))

  const { data, isLoading, isError } = useQuery({
    queryKey: ['departments'],
    queryFn: () => fetchDepartments(),
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['departments'] })
  const createMutation = useMutation({ mutationFn: createDepartment, onSuccess: invalidate })
  const updateMutation = useMutation({
    mutationFn: (input: { id: number; name: string }) => updateDepartment(input.id, input.name),
    onSuccess: invalidate,
  })
  const deleteMutation = useMutation({ mutationFn: deleteDepartment, onSuccess: invalidate })
  const deleteError = deleteMutation.error
    ? errorMessage(deleteMutation.error, 'Não foi possível remover este departamento.')
    : null

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="font-sans text-3xl font-bold text-accent italic">_Departamentos</h1>
        {isAdmin && <Button onClick={() => setEditing('new')}>Novo departamento</Button>}
      </div>

      {isLoading && <p className="text-ink-muted">Carregando...</p>}
      {isError && <p className="text-accent-text">Não foi possível carregar os departamentos.</p>}

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
        <div className="overflow-x-auto rounded-[6px] bg-surface-card shadow-card">
          <table className="w-full text-left text-sm">
            <thead className="bg-grey1 text-xs font-semibold text-ink-muted uppercase">
              <tr>
                <th className="px-4 py-3">Nome</th>
                {isAdmin && <th className="px-4 py-3" />}
              </tr>
            </thead>
            <tbody>
              {data.data.map((dept) => (
                <tr key={dept.id} className="border-t border-grey1 align-top">
                  <td className="px-4 py-3 text-ink">{dept.name}</td>
                  {isAdmin && (
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <button
                        onClick={() => setEditing(dept)}
                        className="mr-4 text-xs font-semibold text-ink-muted uppercase hover:text-accent-text"
                      >
                        Editar
                      </button>
                      <button
                        onClick={async () => {
                          const ok = await confirm({
                            title: 'Remover departamento?',
                            message: `"${dept.name}" será removido permanentemente.`,
                            confirmLabel: 'Remover',
                          })
                          if (ok) deleteMutation.mutate(dept.id)
                        }}
                        className="text-xs font-semibold text-accent-text uppercase"
                      >
                        Remover
                      </button>
                    </td>
                  )}
                </tr>
              ))}
              {data.data.length === 0 && (
                <tr>
                  <td colSpan={isAdmin ? 2 : 1} className="px-4 py-8 text-center text-ink-muted">
                    Nenhum departamento cadastrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <DepartmentFormModal
          department={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onCreate={(name) =>
            createMutation.mutate(name, { onSuccess: () => setEditing(null) })
          }
          onUpdate={(id, name) =>
            updateMutation.mutate({ id, name }, { onSuccess: () => setEditing(null) })
          }
          pending={createMutation.isPending || updateMutation.isPending}
          error={createMutation.error ?? updateMutation.error}
        />
      )}
    </div>
  )
}

function DepartmentFormModal({
  department,
  onClose,
  onCreate,
  onUpdate,
  pending,
  error,
}: {
  department: Department | null
  onClose: () => void
  onCreate: (name: string) => void
  onUpdate: (id: number, name: string) => void
  pending: boolean
  error: unknown
}) {
  const [name, setName] = useState(department?.name ?? '')

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (department) onUpdate(department.id, name)
    else onCreate(name)
  }

  return (
    <Modal title={department ? '_Editar departamento' : '_Novo departamento'} onClose={onClose}>
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
        {error ? <p className="text-sm text-accent-text">{errorMessage(error, 'Não foi possível salvar.')}</p> : null}
        <Button type="submit" disabled={pending}>
          {pending ? 'Salvando...' : 'Salvar'}
        </Button>
      </form>
    </Modal>
  )
}
