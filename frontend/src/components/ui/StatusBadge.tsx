import { cn } from '../../lib/cn'
import { statusLabels } from '../../lib/status-labels'
import type { PurchaseRequestStatus } from '../../api/types'

// Cores por status: neutro para estados de rascunho/andamento, accent (red)
// para o que precisa de atenção, verde/vermelho fora da paleta da marca só
// para os dois estados terminais de sucesso/falha — onde uma cor semântica
// universal (verde = ok, vermelho = problema) ajuda mais que seguir a marca
// à risca.
const styles: Record<PurchaseRequestStatus, string> = {
  DRAFT: 'bg-grey1 text-ink-muted',
  SUBMITTED: 'bg-grey1 text-ink',
  IN_QUOTATION: 'bg-blue-50 text-blue-700',
  PENDING_APPROVAL: 'bg-amber-50 text-amber-700',
  APPROVED: 'bg-emerald-50 text-emerald-700',
  COMPLETED: 'bg-emerald-100 text-emerald-800',
  REJECTED: 'bg-red-50 text-accent-text',
  CANCELLED: 'bg-grey1 text-ink-muted line-through',
}

export function StatusBadge({ status }: { status: PurchaseRequestStatus }) {
  return (
    <span
      className={cn(
        'inline-block rounded-full px-3 py-1 text-xs font-semibold whitespace-nowrap',
        styles[status],
      )}
    >
      {statusLabels[status]}
    </span>
  )
}
