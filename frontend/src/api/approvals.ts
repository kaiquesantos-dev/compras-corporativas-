import { apiClient } from './client'
import type { Approval, PurchaseRequest } from './types'

export async function fetchApproval(purchaseRequestId: number): Promise<Approval> {
  const { data } = await apiClient.get<Approval>(`/purchase-requests/${purchaseRequestId}/approval`)
  return data
}

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
