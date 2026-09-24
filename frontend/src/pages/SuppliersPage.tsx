import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import {
  createSupplier,
  deleteSupplier,
  fetchSuppliers,
  type CreateSupplierInput,
} from '../api/suppliers'
import { useAuthStore } from '../store/auth-store'
import { Button } from '../components/ui/Button'
import { TextField } from '../components/ui/TextField'
import { Modal } from '../components/ui/Modal'
import { Pagination } from '../components/ui/Pagination'
import { useConfirm } from '../hooks/confirm-context'

function errorMessage(err: unknown, fallback: string): string {
  if (!isAxiosError(err)) return fallback
  const message = (err.response?.data as { message?: string | string[] } | undefined)?.message
  return Array.isArray(message) ? message.join(' ') : (message ?? fallback)
}

export function SuppliersPage() {
  const [creating, setCreating] = useState(false)
  const [page, setPage] = useState(1)
  const user = useAuthStore((state) => state.user)
  const queryClient = useQueryClient()
  const confirm = useConfirm()

  const { data, isLoading, isError } = useQuery({
    queryKey: ['suppliers', page],
    queryFn: () => fetchSuppliers(page),
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['suppliers'] })
  const createMutation = useMutation({ mutationFn: createSupplier, onSuccess: invalidate })
  const deleteMutation = useMutation({ mutationFn: deleteSupplier, onSuccess: invalidate })

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="font-sans text-3xl font-bold text-accent italic">_Fornecedores</h1>
        <Button onClick={() => setCreating(true)}>Novo fornecedor</Button>
      </div>

      {isLoading && <p className="text-ink-muted">Carregando...</p>}
      {isError && <p className="text-accent-text">Não foi possível carregar os fornecedores.</p>}

      {data && (
        <>
          <div className="overflow-x-auto rounded-[6px] bg-surface-card shadow-card">
            <table className="w-full text-left text-sm">
              <thead className="bg-grey1 text-xs font-semibold text-ink-muted uppercase">
                <tr>
                  <th className="px-4 py-3">Razão social</th>
                  <th className="px-4 py-3">CNPJ</th>
                  <th className="px-4 py-3">Cidade/UF</th>
                  <th className="px-4 py-3">Status</th>
                  {user?.role === 'ADMIN' && <th className="px-4 py-3" />}
                </tr>
              </thead>
              <tbody>
                {data.data.map((supplier) => (
                  // align-top: nomes de razão social longos quebram em várias
                  // linhas — sem isso, as demais células ficam centralizadas
                  // verticalmente numa linha mais alta e o layout desalinha.
                  <tr key={supplier.id} className="border-t border-grey1 align-top">
                    <td className="px-4 py-3 text-ink">{supplier.legalName}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-ink-muted">{supplier.document}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-ink-muted">
                      {supplier.city ? `${supplier.city}/${supplier.state}` : '—'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={supplier.isActive ? 'text-emerald-700' : 'text-ink-muted'}>
                        {supplier.isActive ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    {user?.role === 'ADMIN' && (
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <button
                          onClick={async () => {
                            const ok = await confirm({
                              title: 'Remover fornecedor?',
                              message: `"${supplier.legalName}" será removido permanentemente.`,
                              confirmLabel: 'Remover',
                            })
                            if (ok) deleteMutation.mutate(supplier.id)
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
                    <td colSpan={5} className="px-4 py-8 text-center text-ink-muted">
                      Nenhum fornecedor cadastrado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPageChange={setPage} />
        </>
      )}

      {creating && (
        <NewSupplierModal
          onClose={() => setCreating(false)}
          onSubmit={(input) => createMutation.mutate(input, { onSuccess: () => setCreating(false) })}
          pending={createMutation.isPending}
          error={createMutation.error}
        />
      )}
    </div>
  )
}

function NewSupplierModal({
  onClose,
  onSubmit,
  pending,
  error,
}: {
  onClose: () => void
  onSubmit: (input: CreateSupplierInput) => void
  pending: boolean
  error: unknown
}) {
  const [document, setDocument] = useState('')
  const [legalName, setLegalName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    onSubmit({
      document,
      legalName: legalName || undefined,
      email: email || undefined,
      phone: phone || undefined,
    })
  }

  return (
    <Modal title="_Novo fornecedor" onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <TextField
          label="CNPJ"
          value={document}
          onChange={(e) => setDocument(e.target.value)}
          required
          autoFocus
          hint="Razão social e endereço são preenchidos automaticamente via consulta ao CNPJ, se não informados."
        />
        <TextField
          label="Razão social (opcional)"
          value={legalName}
          onChange={(e) => setLegalName(e.target.value)}
        />
        <TextField label="E-mail (opcional)" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <TextField label="Telefone (opcional)" value={phone} onChange={(e) => setPhone(e.target.value)} />

        {error ? <p className="text-sm text-accent-text">{errorMessage(error, 'Não foi possível cadastrar.')}</p> : null}
        <Button type="submit" disabled={pending}>
          {pending ? 'Cadastrando...' : 'Cadastrar fornecedor'}
        </Button>
      </form>
    </Modal>
  )
}
