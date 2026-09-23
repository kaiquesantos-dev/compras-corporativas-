import { apiClient } from './client'
import type { Paginated, Supplier } from './types'

export async function fetchSuppliers(page = 1): Promise<Paginated<Supplier>> {
  const { data } = await apiClient.get<Paginated<Supplier>>('/suppliers', {
    params: { page, pageSize: 20 },
  })
  return data
}

export interface CreateSupplierInput {
  document: string
  legalName?: string
  tradeName?: string
  email?: string
  phone?: string
}

export async function createSupplier(input: CreateSupplierInput): Promise<Supplier> {
  const { data } = await apiClient.post<Supplier>('/suppliers', input)
  return data
}

export async function deleteSupplier(id: number): Promise<void> {
  await apiClient.delete(`/suppliers/${id}`)
}
