import { apiClient } from './client'
import type {
  Paginated,
  PurchaseMetrics,
  PurchaseRequest,
  PurchaseRequestStatus,
  PurchaseRequestStatusHistoryEntry,
} from './types'

export async function fetchPurchaseRequests(params: {
  page?: number
  pageSize?: number
  status?: PurchaseRequestStatus
}): Promise<Paginated<PurchaseRequest>> {
  const { data } = await apiClient.get<Paginated<PurchaseRequest>>('/purchase-requests', {
    params,
  })
  return data
}

export async function fetchPurchaseRequest(id: number): Promise<PurchaseRequest> {
  const { data } = await apiClient.get<PurchaseRequest>(`/purchase-requests/${id}`)
  return data
}

export async function fetchPurchaseMetrics(): Promise<PurchaseMetrics> {
  const { data } = await apiClient.get<PurchaseMetrics>('/purchase-requests/metrics')
  return data
}

export interface CreatePurchaseRequestInput {
  title: string
  justification: string
  items: {
    description: string
    quantity: number
    unit: string
    estimatedUnitPrice?: number
  }[]
}

export async function createPurchaseRequest(
  input: CreatePurchaseRequestInput,
): Promise<PurchaseRequest> {
  const { data } = await apiClient.post<PurchaseRequest>('/purchase-requests', input)
  return data
}

export async function submitPurchaseRequest(id: number): Promise<PurchaseRequest> {
  const { data } = await apiClient.post<PurchaseRequest>(`/purchase-requests/${id}/submit`)
  return data
}

export async function cancelPurchaseRequest(id: number): Promise<PurchaseRequest> {
  const { data } = await apiClient.post<PurchaseRequest>(`/purchase-requests/${id}/cancel`)
  return data
}

export async function completePurchaseRequest(id: number): Promise<PurchaseRequest> {
  const { data } = await apiClient.post<PurchaseRequest>(`/purchase-requests/${id}/complete`)
  return data
}

export async function fetchPurchaseRequestHistory(
  id: number,
): Promise<PurchaseRequestStatusHistoryEntry[]> {
  const { data } = await apiClient.get<PurchaseRequestStatusHistoryEntry[]>(
    `/purchase-requests/${id}/history`,
  )
  return data
}
