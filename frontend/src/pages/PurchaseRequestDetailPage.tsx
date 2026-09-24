import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import {
  cancelPurchaseRequest,
  completePurchaseRequest,
  fetchPurchaseRequest,
  submitPurchaseRequest,
} from '../api/purchase-requests'
import { StatusBadge } from '../components/ui/StatusBadge'
import { Button } from '../components/ui/Button'
import { QuotesSection } from '../components/quotes/QuotesSection'
import { StatusHistory } from '../components/purchase-requests/StatusHistory'
import { useAuthStore } from '../store/auth-store'

const dateFormatter = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
const currencyFormatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

export function PurchaseRequestDetailPage() {
  const { id } = useParams<{ id: string }>()
  const purchaseRequestId = Number(id)
  const user = useAuthStore((state) => state.user)
  const queryClient = useQueryClient()

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

  const submitMutation = useMutation({ mutationFn: submitPurchaseRequest, onSuccess: invalidate })
  const cancelMutation = useMutation({ mutationFn: cancelPurchaseRequest, onSuccess: invalidate })
  const completeMutation = useMutation({ mutationFn: completePurchaseRequest, onSuccess: invalidate })

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
  const isBuyerOrAdmin = user?.role === 'BUYER' || user?.role === 'ADMIN'
  const canSubmit = isOwner && pr.status === 'DRAFT'
  // A partir de IN_QUOTATION o comprador já está negociando com
  // fornecedores de verdade — o dono (REQUESTER) não pode mais cancelar
  // sozinho nesse ponto em diante, só BUYER ou ADMIN (mesma regra aplicada
  // no backend, em purchase-requests.service.ts).
  const canCancel =
    pr.status === 'IN_QUOTATION'
      ? isBuyerOrAdmin
      : (isOwner || user?.role === 'ADMIN') && ['DRAFT', 'SUBMITTED'].includes(pr.status)
  const canComplete = isBuyerOrAdmin && pr.status === 'APPROVED'
  const showQuotes = pr.status !== 'DRAFT'

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="font-sans text-3xl font-bold text-accent italic">{pr.title}</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Criada em {dateFormatter.format(new Date(pr.createdAt))}
            {pr.requester ? ` por ${pr.requester.name}` : ''}
          </p>
        </div>
        <StatusBadge status={pr.status} />
      </div>

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
              <th className="px-4 py-3">Preço est.</th>
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
              </tr>
            ))}
          </tbody>
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
            <Button onClick={() => completeMutation.mutate(pr.id)} disabled={completeMutation.isPending}>
              {completeMutation.isPending ? 'Concluindo...' : 'Concluir compra'}
            </Button>
          )}
          {canCancel && (
            <Button
              variant="outline"
              onClick={() => cancelMutation.mutate(pr.id)}
              disabled={cancelMutation.isPending}
            >
              Cancelar
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
