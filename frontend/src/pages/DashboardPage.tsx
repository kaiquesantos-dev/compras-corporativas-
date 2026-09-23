import { useQuery } from '@tanstack/react-query'
import { fetchPurchaseMetrics } from '../api/purchase-requests'
import { useAuthStore } from '../store/auth-store'

const currencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[6px] bg-surface-card p-6 shadow-card">
      <p className="text-xs font-semibold tracking-wide text-ink-muted uppercase">{label}</p>
      <p className="mt-2 font-sans text-3xl font-bold text-ink italic">{value}</p>
    </div>
  )
}

export function DashboardPage() {
  const user = useAuthStore((state) => state.user)
  const canSeeMetrics = user?.role === 'BUYER' || user?.role === 'APPROVER' || user?.role === 'ADMIN'

  const { data: metrics, isLoading, isError } = useQuery({
    queryKey: ['purchase-metrics'],
    queryFn: fetchPurchaseMetrics,
    enabled: canSeeMetrics,
  })

  return (
    <div>
      <h1 className="mb-6 font-sans text-3xl font-bold text-accent italic">_Painel</h1>

      {!canSeeMetrics && (
        <p className="text-ink-muted">
          Use o menu "Solicitações" para acompanhar suas solicitações de compra.
        </p>
      )}

      {canSeeMetrics && isLoading && <p className="text-ink-muted">Carregando indicadores...</p>}
      {canSeeMetrics && isError && <p className="text-accent-text">Não foi possível carregar os indicadores.</p>}

      {canSeeMetrics && metrics && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard label="Aguardando aprovação" value={String(metrics.countByStatus.PENDING_APPROVAL ?? 0)} />
          <KpiCard label="Em cotação" value={String(metrics.countByStatus.IN_QUOTATION ?? 0)} />
          <KpiCard label="Concluídas" value={String(metrics.countByStatus.COMPLETED ?? 0)} />
          <KpiCard label="Valor total aprovado" value={currencyFormatter.format(metrics.totalApprovedValue)} />
        </div>
      )}
    </div>
  )
}
