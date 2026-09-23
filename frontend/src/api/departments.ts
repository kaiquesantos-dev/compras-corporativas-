import { apiClient } from './client'
import type { Department, Paginated } from './types'

export async function fetchDepartments(page = 1): Promise<Paginated<Department>> {
  const { data } = await apiClient.get<Paginated<Department>>('/departments', {
    params: { page, pageSize: 50 },
  })
  return data
}

export async function createDepartment(name: string): Promise<Department> {
  const { data } = await apiClient.post<Department>('/departments', { name })
  return data
}

export async function updateDepartment(id: number, name: string): Promise<Department> {
  const { data } = await apiClient.patch<Department>(`/departments/${id}`, { name })
  return data
}

export async function deleteDepartment(id: number): Promise<void> {
  await apiClient.delete(`/departments/${id}`)
}
