import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { isAxiosError } from 'axios'
import { fetchCurrentUser, login } from '../api/auth'
import { decodeJwtUser } from '../lib/jwt'
import { useAuthStore } from '../store/auth-store'
import { Button } from '../components/ui/Button'
import { TextField } from '../components/ui/TextField'

export function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const setSession = useAuthStore((state) => state.setSession)
  const navigate = useNavigate()

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const token = await login(email, password)
      // Popula a sessão com o decode do JWT primeiro (instantâneo, e já
      // deixa o token disponível pro apiClient) e em seguida confirma com
      // os dados de verdade do banco via /auth/me — captura isAdminDelegate
      // corretamente desde o primeiro carregamento, em vez de só na
      // próxima sincronização periódica.
      setSession(token, decodeJwtUser(token))
      setSession(token, await fetchCurrentUser())
      navigate('/', { replace: true })
    } catch (err) {
      const message = isAxiosError(err)
        ? ((err.response?.data as { message?: string } | undefined)?.message ?? 'Não foi possível entrar.')
        : 'Não foi possível entrar.'
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-muted px-4">
      <div className="w-full max-w-sm rounded-[6px] bg-surface-card p-8 shadow-card">
        <img src="/brand/itlean-logo-black.svg" alt="IT Lean" className="mb-8 h-7 w-auto" />
        <h1 className="mb-1 font-sans text-2xl font-bold text-accent italic">_Entrar</h1>
        <p className="mb-6 text-sm text-ink-muted">Compras Corporativas</p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <TextField
            label="E-mail"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
          />
          <TextField
            label="Senha"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {error && <p className="text-sm text-accent-text">{error}</p>}
          <Button type="submit" disabled={loading} className="mt-2 w-full">
            {loading ? 'Entrando...' : 'Entrar'}
          </Button>
        </form>
      </div>
    </div>
  )
}
