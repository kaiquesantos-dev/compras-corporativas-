import { apiClient } from './client'
import type { AuthenticatedUser } from './types'

export async function login(email: string, password: string): Promise<string> {
  const { data } = await apiClient.post<{ access_token: string }>('/auth/login', {
    email,
    password,
  })
  return data.access_token
}

// id/email/role/isAdminDelegate revalidados no banco a cada chamada — ao
// contrário de decodeJwtUser (uma "foto" fixa do momento do login), isto
// reflete mudanças feitas depois (ex: uma delegação de acesso ADMIN sendo
// concedida) sem precisar de um novo login.
export async function fetchCurrentUser(): Promise<AuthenticatedUser> {
  const { data } = await apiClient.get<AuthenticatedUser>('/auth/me')
  return data
}
