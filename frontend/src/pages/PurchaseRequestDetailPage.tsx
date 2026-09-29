import { useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import {
  cancelPurchaseRequest,
  completePurchaseRequest,
  fetchPurchaseRequest,
  submitPurchaseRequest,
  updatePurchaseRequest,
} from '../api/purchase-requests'
import { StatusBadge } from '../components/ui/StatusBadge'
import { Button } from '../components/ui/Button'
import { TextField } from '../components/ui/TextField'
import { Modal } from '../components/ui/Modal'
import { QuotesSection } from '../components/quotes/QuotesSection'
import { StatusHistory } from '../components/purchase-requests/StatusHistory'
import { useAuthStore } from '../store/auth-store'
import { useConfirm } from '../hooks/confirm-context'
import { actsAsAdmin } from '../lib/roles'
import type { PurchaseRequest } from '../api/types'

function errorMessage(err: unknown, fallback: string): string {
  if (!isAxiosError(err)) return fallback
  const message = (err.response?.data as { message?: string | string[] } | undefined)?.message
  return Array.isArray(message) ? message.join(' ') : (message ?? fallback)
}

const dateFormatter = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
const currencyFormatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

export function PurchaseRequestDetailPage() {
  const { id } = useParams<{ id: string }>()
  const purchaseRequestId = Number(id)
  const user = useAuthStore((state) => state.user)
  const queryClient = useQueryClient()
  const confirm = useConfirm()

  const { data: pr, isLoading, isError, error } = useQuery({
    queryKey: ['purchase-request', purchaseRequestId],
    queryFn: () => fetchPurchaseRequest(purchaseRequestId),
    retry: false,
  })

  // Sem invalidar o histórico aqui, ele so ficava atualizado depois de um
  // reload manual da pagina: submit/cancel/complete mudam o status (e por
  // tabela geram uma nova linha no historico), mas a query do historico
  // e independente da query da solicitacao e nao era avisada da mudanca.
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['purchase-request', purchaseRequestId] })
    queryClient.invalidateQueries({ queryKey: ['purchase-request-history', purchaseRequestId] })
  }

  const [editing, setEditing] = useState(false)
  const submitMutation = useMutation({ mutationFn: submitPurchaseRequest, onSuccess: invalidate })
  const cancelMutation = useMutation({ mutationFn: cancelPurchaseRequest, onSuccess: invalidate })
  const completeMutation = useMutation({ mutationFn: completePurchaseRequest, onSuccess: invalidate })
  const updateMutation = useMutation({
    mutationFn: (input: { title: string; justification: string }) =>
      updatePurchaseRequest(purchaseRequestId, input),
    onSuccess: () => {
      invalidate()
      setEditing(false)
    },
  })

  if (isLoading) {
    return <p className="text-ink-muted">Carregando...</p>
  }

  // Sem isso, uma query que falha (404 solicitação inexistente, 403 sem
  // acesso) deixava isLoading em false mas pr continuava undefined — a
  // página ficava travada em "Carregando..." para sempre.
  if (isError || !pr) {
    const status = isAxiosError(error) ? error.response?.status : undefined
    const message =
      status === 404
        ? 'Solicitação não encontrada.'
        : status === 403
          ? 'Você não tem acesso a esta solicitação.'
          : 'Não foi possível carregar esta solicitação.'
    return (
      <div>
        <p className="text-accent-text">{message}</p>
        <Link to="/purchase-requests" className="mt-4 inline-block text-sm font-semibold text-accent-text uppercase hover:underline">
          Voltar para solicitações
        </Link>
      </div>
    )
  }

  const isOwner = user?.id === pr.requesterId
  const isAdmin = actsAsAdmin(user)
  const isBuyerOrAdmin = user?.role === 'BUYER' || isAdmin
  const canSubmit = isOwner && pr.status === 'DRAFT'
  // Editar título/justificativa só faz sentido em DRAFT: depois de submeter,
  // a solicitação já entrou no fluxo de cotação/aprovação (mesma regra do
  // backend, em purchase-requests.service.ts update()).
  const canEdit = isOwner && pr.status === 'DRAFT'
  // A partir de IN_QUOTATION o comprador já está negociando com
  // fornecedores de verdade — o dono (REQUESTER) não pode mais cancelar
  // sozinho nesse ponto em diante, só BUYER ou ADMIN (mesma regra aplicada
  // no backend, em purchase-requests.service.ts).
  const canCancel =
    pr.status === 'IN_QUOTATION'
      ? isBuyerOrAdmin
      : (isOwner || isAdmin) && ['DRAFT', 'SUBMITTED'].includes(pr.status)
  const canComplete = isBuyerOrAdmin && pr.status === 'APPROVED'
  const showQuotes = pr.status !== 'DRAFT'

  // Sem isso, um 409/403 da API (ex: outra pessoa mudou o status antes)
  // não aparecia em lugar nenhum — o botão só voltava ao normal.
  const actionError = submitMutation.error ?? completeMutation.error ?? cancelMutation.error

  const pricedItems =pr.items.filter((item) => item.estimatedUnitPrice)
  const estimatedTotal =
    pricedItems.length > 0
      ? pricedItems.reduce((sum, item) => sum + Number(item.estimatedUnitPrice) * item.quantity, 0)
      : null
  const hasItemWithoutPrice = pricedItems.length > 0 && pricedItems.length < pr.items.length

  // Concluir também é definitivo: encerra o fluxo da solicitação.
  async function handleComplete() {
    const ok = await confirm({
      title: 'Concluir compra?',
      message: `"${pr!.title}" será marcada como concluída, indicando que a compra foi efetivada com o fornecedor. Esta ação não pode ser desfeita.`,
      confirmLabel: 'Concluir compra',
      cancelLabel: 'Voltar',
      variant: 'success',
    })
    if (ok) completeMutation.mutate(pr!.id)
  }

  // Cancelar é definitivo (não existe "descancelar"), então pede
  // confirmação — mesmo padrão de aprovar/rejeitar e das exclusões.
  async function handleCancel() {
    const ok = await confirm({
      title: 'Cancelar solicitação?',
      message: `"${pr!.title}" será cancelada e sai do fluxo de compra. Esta ação não pode ser desfeita.`,
      confirmLabel: 'Cancelar solicitação',
      cancelLabel: 'Voltar',
      variant: 'danger',
    })
    if (ok) cancelMutation.mutate(pr!.id)
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="font-sans text-3xl font-bold text-accent italic">{pr.title}</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Solicitação #{pr.id} · Criada em {dateFormatter.format(new Date(pr.createdAt))}
            {pr.requester ? ` por ${pr.requester.name}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {canEdit && (
            <button
              onClick={() => setEditing(true)}
              className="text-xs font-semibold text-ink-muted uppercase hover:text-accent-text"
            >
              Editar
            </button>
          )}
          <StatusBadge status={pr.status} />
        </div>
      </div>

      {/* Rascunho é privado até ser submetido — sem este aviso, dava para
          criar a solicitação, sair da página e achar que ela já tinha ido
          para o comprador. */}
      {pr.status === 'DRAFT' && (
        <div className="mb-6 rounded-[6px] border border-amber-300 bg-amber-50 px-5 py-4 text-sm text-amber-900">
          <p className="font-semibold">Esta solicitação ainda é um rascunho.</p>
          <p className="mt-1">
            {canSubmit
              ? 'Só você consegue vê-la. Clique em "Submeter para cotação" no fim da página para enviá-la ao time de compras.'
              : 'Só quem criou consegue vê-la e enviá-la para cotação.'}
          </p>
        </div>
      )}

      <div className="mb-6 rounded-[6px] bg-surface-card p-6 shadow-card">
        <p className="mb-1 text-xs font-semibold tracking-wide text-ink-muted uppercase">Justificativa</p>
        <p className="text-ink">{pr.justification}</p>
      </div>

      <div className="mb-6 overflow-x-auto rounded-[6px] bg-surface-card shadow-card">
        <table className="w-full text-left text-sm">
          <thead className="bg-grey1 text-xs font-semibold text-ink-muted uppercase">
            <tr>
              <th className="px-4 py-3">Item</th>
              <th className="px-4 py-3">Qtd.</th>
              <th className="px-4 py-3">Unidade</th>
              <th className="px-4 py-3">Preço unit. estimado</th>
              <th className="px-4 py-3 text-right">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {pr.items.map((item) => (
              <tr key={item.id} className="border-t border-grey1 align-top">
                <td className="px-4 py-3">{item.description}</td>
                <td className="px-4 py-3 whitespace-nowrap">{item.quantity}</td>
                <td className="px-4 py-3 whitespace-nowrap">{item.unit}</td>
                <td className="px-4 py-3 whitespace-nowrap">
                  {item.estimatedUnitPrice ? currencyFormatter.format(Number(item.estimatedUnitPrice)) : '—'}
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  {item.estimatedUnitPrice
                    ? currencyFormatter.format(Number(item.estimatedUnitPrice) * item.quantity)
                    : '—'}
                </td>
              </tr>
            ))}
          </tbody>
          {/* Total só quando algum item tem preço estimado — o campo é
              opcional, e "Total: R$ 0,00" daria a entender que é de graça. */}
          {estimatedTotal !== null && (
            <tfoot>
              <tr className="border-t border-grey1 bg-grey1/40">
                <td colSpan={4} className="px-4 py-3 text-right text-xs font-semibold tracking-wide text-ink-muted uppercase">
                  Total estimado{hasItemWithoutPrice ? ' (itens sem preço não entram)' : ''}
                </td>
                <td className="px-4 py-3 text-right font-sans font-bold whitespace-nowrap text-ink italic">
                  {currencyFormatter.format(estimatedTotal)}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {showQuotes && (
        <QuotesSection purchaseRequestId={pr.id} status={pr.status} canManage={isBuyerOrAdmin} />
      )}

      <StatusHistory purchaseRequestId={pr.id} />

      {(canSubmit || canCancel || canComplete) && (
        <div className="flex gap-3">
          {canSubmit && (
            <Button onClick={() => submitMutation.mutate(pr.id)} disabled={submitMutation.isPending}>
              Submeter para cotação
            </Button>
          )}
          {canComplete && (
            <Button onClick={handleComplete} disabled={completeMutation.isPending}>
              {completeMutation.isPending ? 'Concluindo...' : 'Concluir compra'}
            </Button>
          )}
          {canCancel && (
            <Button variant="outline" onClick={handleCancel} disabled={cancelMutation.isPending}>
              {cancelMutation.isPending ? 'Cancelando...' : 'Cancelar solicitação'}
            </Button>
          )}
        </div>
      )}

      {actionError ? (
        <p className="mt-3 text-sm text-accent-text">{errorMessage(actionError, 'Não foi possível concluir a ação.')}</p>
      ) : null}

      {editing && (
        <EditPurchaseRequestModal
          pr={pr}
          onClose={() => setEditing(false)}
          onSubmit={(input) => updateMutation.mutate(input)}
          pending={updateMutation.isPending}
          error={updateMutation.error}
        />
      )}
    </div>
  )
}

function EditPurchaseRequestModal({
  pr,
  onClose,
  onSubmit,
  pending,
  error,
}: {
  pr: PurchaseRequest
  onClose: () => void
  onSubmit: (input: { title: string; justification: string }) => void
  pending: boolean
  error: unknown
}) {
  const [title, setTitle] = useState(pr.title)
  const [justification, setJustification] = useState(pr.justification)

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    onSubmit({ title, justification })
  }

  return (
    <Modal title="_Editar solicitação" onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <TextField
          label="Título"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          autoFocus
          minLength={3}
          maxLength={200}
        />
        <TextField
          label="Justificativa"
          multiline
          value={justification}
          onChange={(e) => setJustification(e.target.value)}
          required
          minLength={10}
          maxLength={2000}
          hint={`${justification.length}/2000 caracteres`}
        />
        {/* A API só permite editar título e justificativa — sem este aviso,
            a pessoa ficava procurando onde mudar os itens. */}
        <p className="rounded-[5px] bg-grey1 px-3 py-2 text-xs text-ink-muted">
          Os itens não podem ser alterados depois de criados. Para mudar itens, cancele este rascunho e crie uma nova
          solicitação.
        </p>
        {error ? <p className="text-sm text-accent-text">{errorMessage(error, 'Não foi possível salvar.')}</p> : null}
        <Button type="submit" disabled={pending}>
          {pending ? 'Salvando...' : 'Salvar alterações'}
        </Button>
      </form>
    </Modal>
  )
}
