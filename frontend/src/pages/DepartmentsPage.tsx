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

function errorMessage(err: unknown, fallback: string): string {
  if (!isAxiosError(err)) return fallback
  const message = (err.response?.data as { message?: string | string[] } | undefined)?.message
  return Array.isArray(message) ? message.join(' ') : (message ?? fallback)
}

export function DepartmentsPage() {
  const [editing, setEditing] = useState<Department | 'new' | null>(null)
  const queryClient = useQueryClient()

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

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-sans text-3xl font-bold text-accent italic">_Departamentos</h1>
        <Button onClick={() => setEditing('new')}>Novo departamento</Button>
      </div>

      {isLoading && <p className="text-ink-muted">Carregando...</p>}
      {isError && <p className="text-accent-text">Não foi possível carregar os departamentos.</p>}

      {data && (
        <div className="overflow-x-auto rounded-[6px] bg-surface-card shadow-card">
          <table className="w-full text-left text-sm">
            <thead className="bg-grey1 text-xs font-semibold text-ink-muted uppercase">
              <tr>
                <th className="px-4 py-3">Nome</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {data.data.map((dept) => (
                <tr key={dept.id} className="border-t border-grey1 align-top">
                  <td className="px-4 py-3 text-ink">{dept.name}</td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <button
                      onClick={() => setEditing(dept)}
                      className="mr-4 text-xs font-semibold text-ink-muted uppercase hover:text-accent-text"
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(`Remover "${dept.name}"?`)) deleteMutation.mutate(dept.id)
                      }}
                      className="text-xs font-semibold text-accent-text uppercase"
                    >
                      Remover
                    </button>
                  </td>
                </tr>
              ))}
              {data.data.length === 0 && (
                <tr>
                  <td colSpan={2} className="px-4 py-8 text-center text-ink-muted">
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
        <TextField label="Nome" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
        {error ? <p className="text-sm text-accent-text">{errorMessage(error, 'Não foi possível salvar.')}</p> : null}
        <Button type="submit" disabled={pending}>
          {pending ? 'Salvando...' : 'Salvar'}
        </Button>
      </form>
    </Modal>
  )
}
