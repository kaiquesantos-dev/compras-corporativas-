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
  // Opcional: quando informado, a proposta é anexada na mesma chamada que
  // cria a cotação, em vez de precisar de um upload separado depois.
  file?: File
}

export async function createQuote(input: CreateQuoteInput): Promise<Quote> {
  const { purchaseRequestId, file, ...fields } = input

  // Só usa multipart quando há arquivo — mantém a chamada mais simples
  // (JSON) para o caso comum de cotação sem proposta anexada ainda.
  if (!file) {
    const { data } = await apiClient.post<Quote>(`/purchase-requests/${purchaseRequestId}/quotes`, fields)
    return data
  }

  const formData = new FormData()
  formData.append('supplierId', String(fields.supplierId))
  formData.append('totalValue', String(fields.totalValue))
  if (fields.validUntil) formData.append('validUntil', fields.validUntil)
  if (fields.notes) formData.append('notes', fields.notes)
  formData.append('file', file)

  const { data } = await apiClient.post<Quote>(`/purchase-requests/${purchaseRequestId}/quotes`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
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
