import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import {
  createSupplier,
  deleteSupplier,
  fetchSuppliers,
  updateSupplier,
  type CreateSupplierInput,
  type UpdateSupplierInput,
} from '../api/suppliers'
import type { Supplier } from '../api/types'
import { useAuthStore } from '../store/auth-store'
import { Button } from '../components/ui/Button'
import { TextField } from '../components/ui/TextField'
import { Select } from '../components/ui/Select'
import { Modal } from '../components/ui/Modal'
import { Pagination } from '../components/ui/Pagination'
import { useConfirm } from '../hooks/confirm-context'
import { formatCnpj, isValidCnpj, onlyDigits } from '../lib/cnpj'
import { formatPhone } from '../lib/phone'
import { actsAsAdmin } from '../lib/roles'

function errorMessage(err: unknown, fallback: string): string {
  if (!isAxiosError(err)) return fallback
  const message = (err.response?.data as { message?: string | string[] } | undefined)?.message
  return Array.isArray(message) ? message.join(' ') : (message ?? fallback)
}

export function SuppliersPage() {
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<Supplier | null>(null)
  const [page, setPage] = useState(1)
  const user = useAuthStore((state) => state.user)
  const isAdmin = actsAsAdmin(user)
  const isBuyerOrAdmin = user?.role === 'BUYER' || isAdmin
  const queryClient = useQueryClient()
  const confirm = useConfirm()

  const { data, isLoading, isError } = useQuery({
    queryKey: ['suppliers', page],
    queryFn: () => fetchSuppliers(page),
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['suppliers'] })
  const createMutation = useMutation({ mutationFn: createSupplier, onSuccess: invalidate })
  const updateMutation = useMutation({
    mutationFn: (input: { id: number; data: UpdateSupplierInput }) => updateSupplier(input.id, input.data),
    onSuccess: invalidate,
  })
  const deleteMutation = useMutation({ mutationFn: deleteSupplier, onSuccess: invalidate })
  const deleteError = deleteMutation.error
    ? errorMessage(deleteMutation.error, 'Não foi possível remover este fornecedor.')
    : null

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="font-sans text-3xl font-bold text-accent italic">_Fornecedores</h1>
        {/* Cadastrar exige BUYER/ADMIN no backend — Solicitante e Aprovador
            continuam vendo a listagem (GET é liberado pra todos), só não
            veem este botão. */}
        {isBuyerOrAdmin && <Button onClick={() => setCreating(true)}>Novo fornecedor</Button>}
      </div>

      {isLoading && <p className="text-ink-muted">Carregando...</p>}
      {isError && <p className="text-accent-text">Não foi possível carregar os fornecedores.</p>}

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
                  <th className="px-4 py-3">Razão social</th>
                  <th className="px-4 py-3">CNPJ</th>
                  <th className="px-4 py-3">Cidade/UF</th>
                  <th className="px-4 py-3">Status</th>
                  {isBuyerOrAdmin && <th className="px-4 py-3" />}
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
                    {isBuyerOrAdmin && (
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        {isBuyerOrAdmin && (
                          <button
                            onClick={() => setEditing(supplier)}
                            className="mr-4 text-xs font-semibold text-ink-muted uppercase hover:text-accent-text"
                          >
                            Editar
                          </button>
                        )}
                        {isAdmin && (
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
                        )}
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

      {editing && (
        <EditSupplierModal
          supplier={editing}
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
  const documentDigits = onlyDigits(document)
  // Só mostra "inválido" quando o CNPJ já está completo (14 dígitos) —
  // enquanto a pessoa ainda está digitando, um CNPJ parcial sempre falharia
  // essa checagem, o que deixaria o campo vermelho o tempo todo à toa.
  const documentError =
    documentDigits.length === 14 && !isValidCnpj(document)
      ? 'CNPJ inválido (dígito verificador não confere).'
      : undefined

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
          onChange={(e) => setDocument(formatCnpj(e.target.value))}
          inputMode="numeric"
          maxLength={18}
          required
          autoFocus
          error={documentError}
          hint={
            documentError
              ? undefined
              : 'Razão social e endereço são preenchidos automaticamente via consulta ao CNPJ, se não informados.'
          }
        />
        <TextField
          label="Razão social (opcional)"
          value={legalName}
          onChange={(e) => setLegalName(e.target.value)}
          maxLength={200}
        />
        <TextField
          label="E-mail (opcional)"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          maxLength={255}
        />
        <TextField
          label="Telefone (opcional)"
          value={phone}
          onChange={(e) => setPhone(formatPhone(e.target.value))}
          inputMode="numeric"
          maxLength={15}
        />

        {error ? <p className="text-sm text-accent-text">{errorMessage(error, 'Não foi possível cadastrar.')}</p> : null}
        <Button type="submit" disabled={pending || documentDigits.length !== 14 || Boolean(documentError)}>
          {pending ? 'Cadastrando...' : 'Cadastrar fornecedor'}
        </Button>
      </form>
    </Modal>
  )
}

function EditSupplierModal({
  supplier,
  onClose,
  onSubmit,
  pending,
  error,
}: {
  supplier: Supplier
  onClose: () => void
  onSubmit: (input: UpdateSupplierInput) => void
  pending: boolean
  error: unknown
}) {
  const [legalName, setLegalName] = useState(supplier.legalName)
  const [email, setEmail] = useState(supplier.email ?? '')
  const [phone, setPhone] = useState(supplier.phone ? formatPhone(supplier.phone) : '')
  const [isActive, setIsActive] = useState(String(supplier.isActive))

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    onSubmit({
      legalName,
      email: email || undefined,
      phone: phone || undefined,
      isActive: isActive === 'true',
    })
  }

  return (
    <Modal title="_Editar fornecedor" onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {/* CNPJ não é editável depois do cadastro — é a identidade legal do
            fornecedor. Se foi cadastrado errado, desative este registro e
            cadastre um novo com o CNPJ certo. */}
        <div>
          <p className="mb-1 text-xs font-semibold tracking-wide text-ink-muted uppercase">CNPJ</p>
          <p className="rounded-[5px] border border-border bg-grey1 px-4 py-3 font-bold text-ink-muted">
            {formatCnpj(supplier.document)}
          </p>
          <p className="mt-1 text-xs text-ink-muted">
            Não é possível editar. Cadastrado errado? Desative este fornecedor e cadastre um novo.
          </p>
        </div>
        <TextField
          label="Razão social"
          value={legalName}
          onChange={(e) => setLegalName(e.target.value)}
          required
          maxLength={200}
        />
        <TextField
          label="E-mail (opcional)"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          maxLength={255}
        />
        <TextField
          label="Telefone (opcional)"
          value={phone}
          onChange={(e) => setPhone(formatPhone(e.target.value))}
          inputMode="numeric"
          maxLength={15}
        />
        <Select
          label="Status"
          value={isActive}
          onChange={setIsActive}
          options={[
            { value: 'true', label: 'Ativo' },
            { value: 'false', label: 'Inativo' },
          ]}
        />

        {error ? <p className="text-sm text-accent-text">{errorMessage(error, 'Não foi possível salvar.')}</p> : null}
        <Button type="submit" disabled={pending}>
          {pending ? 'Salvando...' : 'Salvar alterações'}
        </Button>
      </form>
    </Modal>
  )
}
