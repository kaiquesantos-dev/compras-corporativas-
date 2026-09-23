import { apiClient } from './client'
import type { PurchaseRequest } from './types'

export async function decideApproval(
  purchaseRequestId: number,
  decision: 'APPROVED' | 'REJECTED',
  comment?: string,
): Promise<PurchaseRequest> {
  const { data } = await apiClient.post<PurchaseRequest>(
    `/purchase-requests/${purchaseRequestId}/approval`,
    { decision, comment },
  )
  return data
}
