import axios from 'axios'
import { useAuthStore } from '../store/auth-store'

// Todas as chamadas passam por "/api" (ver proxy do vite.config.ts em dev);
// em produção, VITE_API_URL aponta direto para a API real.
const baseURL = import.meta.env.VITE_API_URL ?? '/api'

export const apiClient = axios.create({ baseURL })

// A API exige X-API-KEY em TODA rota (ver backend), então every request já
// sai com ela. O token JWT (quando existe) vai junto no Authorization.
apiClient.interceptors.request.use((config) => {
  config.headers['X-API-KEY'] = import.meta.env.VITE_API_KEY ?? ''
  const token = useAuthStore.getState().token
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Um 401 aqui significa "sessão expirou ou token inválido" (a API nunca usa
// 401 para "sem permissão" — isso é 403). Desloga automaticamente para o
// usuário não ficar preso vendo erros em toda tela.
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      useAuthStore.getState().logout()
    }
    return Promise.reject(error)
  },
)
