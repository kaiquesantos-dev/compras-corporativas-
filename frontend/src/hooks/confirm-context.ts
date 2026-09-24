import { createContext, useContext } from 'react'
import type { ConfirmOptions } from '../components/ui/ConfirmDialog'

export type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>

export const ConfirmContext = createContext<ConfirmFn | null>(null)

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext)
  if (!ctx) {
    throw new Error('useConfirm precisa estar dentro de um <ConfirmProvider>.')
  }
  return ctx
}
