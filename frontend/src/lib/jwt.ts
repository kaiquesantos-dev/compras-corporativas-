import type { AuthenticatedUser } from '../api/types'

interface JwtPayload {
  sub: number
  email: string
  role: AuthenticatedUser['role']
}

// Decodifica só a parte pública do payload do JWT (base64url), sem validar
// assinatura — isso é seguro aqui porque usamos só para preencher a UI (nome,
// papel); toda decisão de segurança de verdade é validada pelo backend a
// cada requisição, que verifica a assinatura de fato.
// isAdminDelegate nunca vem do token (o payload do JWT é fixo desde o login
// e não tem esse campo) — aqui é só um placeholder até GET /auth/me
// confirmar o valor de verdade vindo do banco, logo em seguida no login.
export function decodeJwtUser(token: string): AuthenticatedUser {
  const payloadBase64 = token.split('.')[1]
  const normalized = payloadBase64.replace(/-/g, '+').replace(/_/g, '/')
  const payload = JSON.parse(atob(normalized)) as JwtPayload
  return { id: payload.sub, email: payload.email, role: payload.role, isAdminDelegate: false }
}
