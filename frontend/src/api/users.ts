import { apiClient } from './client'
import type { Paginated, Role, User } from './types'

export async function fetchUsers(page = 1): Promise<Paginated<User>> {
  const { data } = await apiClient.get<Paginated<User>>('/users', {
    params: { page, pageSize: 20 },
  })
  return data
}

export interface CreateUserInput {
  name: string
  email: string
  password: string
  role: Role
  departmentId?: number
}

export async function createUser(input: CreateUserInput): Promise<User> {
  const { data } = await apiClient.post<User>('/users', input)
  return data
}

export interface UpdateUserInput {
  name?: string
  email?: string
  role?: Role
  departmentId?: number
}

export async function updateUser(id: number, input: UpdateUserInput): Promise<User> {
  const { data } = await apiClient.patch<User>(`/users/${id}`, input)
  return data
}

export async function deleteUser(id: number): Promise<void> {
  await apiClient.delete(`/users/${id}`)
}

// Delegação temporária de acesso ADMIN pra um usuário APPROVER (ex: cobrir
// férias do admin) — toggle manual, sem data de início/fim.
export async function setAdminDelegate(id: number, granted: boolean): Promise<User> {
  const { data } = await apiClient.patch<User>(`/users/${id}/admin-delegate`, { granted })
  return data
}
