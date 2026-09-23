import { apiClient } from './client'
import type { Quote } from './types'

export async function fetchQuotes(purchaseRequestId: number): Promise<Quote[]> {
  const { data } = await apiClient.get<Quote[]>(`/purchase-requests/${purchaseRequestId}/quotes`)
  return data
}

export interface CreateQuoteInput {
  purchaseRequestId: number
  supplierId: number
  totalValue: number
  validUntil?: string
  notes?: string
}

export async function createQuote(input: CreateQuoteInput): Promise<Quote> {
  const { purchaseRequestId, ...body } = input
  const { data } = await apiClient.post<Quote>(`/purchase-requests/${purchaseRequestId}/quotes`, body)
  return data
}

export async function uploadQuoteProposal(
  purchaseRequestId: number,
  quoteId: number,
  file: File,
): Promise<void> {
  const formData = new FormData()
  formData.append('file', file)
  await apiClient.post(
    `/purchase-requests/${purchaseRequestId}/quotes/${quoteId}/proposal`,
    formData,
    { headers: { 'Content-Type': 'multipart/form-data' } },
  )
}

// Não dá para usar um <a href> simples aqui: o endpoint exige X-API-KEY e
// Authorization, que um link comum não envia. Baixamos via axios (que já
// tem os headers configurados no client.ts) e disparamos o download a
// partir do blob recebido.
export async function downloadQuoteProposal(
  purchaseRequestId: number,
  quoteId: number,
  filename: string,
): Promise<void> {
  const response = await apiClient.get(
    `/purchase-requests/${purchaseRequestId}/quotes/${quoteId}/proposal`,
    { responseType: 'blob' },
  )
  const url = URL.createObjectURL(response.data as Blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

export async function selectQuote(purchaseRequestId: number, quoteId: number): Promise<void> {
  await apiClient.post(`/purchase-requests/${purchaseRequestId}/quotes/${quoteId}/select`)
}
