import { apiClient } from './client'
import type { Paginated, Supplier } from './types'

export async function fetchSuppliers(
  page = 1,
  options?: { isActive?: boolean; pageSize?: number },
): Promise<Paginated<Supplier>> {
  const { data } = await apiClient.get<Paginated<Supplier>>('/suppliers', {
    params: { page, pageSize: options?.pageSize ?? 20, isActive: options?.isActive },
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

// Sem "document": o CNPJ é a identidade legal do fornecedor e trava depois
// do cadastro (ver UpdateSupplierDto no backend — mandar esse campo aqui é
// rejeitado com 400, não apenas ignorado).
export interface UpdateSupplierInput {
  legalName?: string
  tradeName?: string
  email?: string
  phone?: string
  zipCode?: string
  street?: string
  city?: string
  state?: string
  isActive?: boolean
}

export async function updateSupplier(id: number, input: UpdateSupplierInput): Promise<Supplier> {
  const { data } = await apiClient.patch<Supplier>(`/suppliers/${id}`, input)
  return data
}

export async function deleteSupplier(id: number): Promise<void> {
  await apiClient.delete(`/suppliers/${id}`)
}
