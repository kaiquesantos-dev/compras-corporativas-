import { useQuery } from '@tanstack/react-query'
import { fetchPurchaseRequestHistory } from '../../api/purchase-requests'
import { useAuthStore } from '../../store/auth-store'

const dateTimeFormatter = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' })

const statusLabels: Record<string, string> = {
  DRAFT: 'Rascunho',
  SUBMITTED: 'Submetida',
  IN_QUOTATION: 'Em cotação',
  PENDING_APPROVAL: 'Aguardando aprovação',
  APPROVED: 'Aprovada',
  REJECTED: 'Rejeitada',
  COMPLETED: 'Concluída',
  CANCELLED: 'Cancelada',
}

export function StatusHistory({ purchaseRequestId }: { purchaseRequestId: number }) {
  const currentUserId = useAuthStore((state) => state.user?.id)

  const { data: history, isLoading } = useQuery({
    queryKey: ['purchase-request-history', purchaseRequestId],
    queryFn: () => fetchPurchaseRequestHistory(purchaseRequestId),
  })

  if (isLoading || !history || history.length === 0) return null

  return (
    <div className="mb-6 rounded-[6px] bg-surface-card p-6 shadow-card">
      <p className="mb-4 text-xs font-semibold tracking-wide text-ink-muted uppercase">
        Histórico de status
      </p>
      <div className="flex flex-col gap-3">
        {history.map((entry) => (
          <div key={entry.id} className="flex items-start gap-3 text-sm">
            <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-accent" />
            <div>
              <p className="text-ink">
                {entry.fromStatus ? `${statusLabels[entry.fromStatus]} → ` : ''}
                <span className="font-semibold">{statusLabels[entry.toStatus]}</span>
              </p>
              <p className="text-xs text-ink-muted">
                {dateTimeFormatter.format(new Date(entry.changedAt))}
                {/* "você" pro próprio usuário (mais natural que ver o
                    próprio nome), nome de verdade pra qualquer outra
                    pessoa — antes disso, uma mudança feita por outro
                    usuário (ex: o comprador movendo a solicitação pra "Em
                    cotação" ao registrar a primeira cotação) não mostrava
                    autoria nenhuma. */}
                {entry.changedByUserId === currentUserId ? ' · por você' : entry.changedBy ? ` · por ${entry.changedBy.name}` : ''}
                {entry.note ? ` · ${entry.note}` : ''}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
