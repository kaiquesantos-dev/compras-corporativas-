import type { PurchaseRequestStatus } from '../api/types'

export const statusLabels: Record<PurchaseRequestStatus, string> = {
  DRAFT: 'Rascunho',
  SUBMITTED: 'Submetida',
  IN_QUOTATION: 'Em cotação',
  PENDING_APPROVAL: 'Aguardando aprovação',
  APPROVED: 'Aprovada',
  REJECTED: 'Rejeitada',
  COMPLETED: 'Concluída',
  CANCELLED: 'Cancelada',
}
