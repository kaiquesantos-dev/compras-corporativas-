import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { AuthenticatedUser } from '../api/types'

interface AuthState {
  token: string | null
  user: AuthenticatedUser | null
  setSession: (token: string, user: AuthenticatedUser) => void
  logout: () => void
}

// Guardamos o token em sessionStorage (não localStorage): sobrevive a um F5
// durante o uso normal, mas some ao fechar a aba/navegador — um meio-termo
// razoável já que a API não tem refresh token (só um JWT simples que expira
// em JWT_EXPIRES_IN, hoje 1 dia).
export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      setSession: (token, user) => set({ token, user }),
      logout: () => set({ token: null, user: null }),
    }),
    {
      name: 'compras-corporativas-auth',
      storage: {
        getItem: (name) => {
          const value = sessionStorage.getItem(name)
          return value ? JSON.parse(value) : null
        },
        setItem: (name, value) => sessionStorage.setItem(name, JSON.stringify(value)),
        removeItem: (name) => sessionStorage.removeItem(name),
      },
    },
  ),
)
