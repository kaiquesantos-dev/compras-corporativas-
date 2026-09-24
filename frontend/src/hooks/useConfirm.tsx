import { useCallback, useRef, useState, type ReactNode } from 'react'
import { ConfirmDialog, type ConfirmOptions } from '../components/ui/ConfirmDialog'
import { ConfirmContext, type ConfirmFn } from './confirm-context'

// Provider único (montado uma vez em main.tsx, em volta de toda a árvore)
// que guarda o estado do diálogo atual e resolve a Promise que confirm()
// devolveu quando o usuário clica em confirmar/cancelar — é o que permite
// escrever `if (await confirm({...})) fazAlgo()` em qualquer componente,
// no lugar de `if (window.confirm('...')) fazAlgo()`.
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null)
  const resolveRef = useRef<((value: boolean) => void) | null>(null)

  const confirm = useCallback<ConfirmFn>((opts) => {
    setOptions(opts)
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve
    })
  }, [])

  function settle(result: boolean) {
    resolveRef.current?.(result)
    resolveRef.current = null
    setOptions(null)
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <ConfirmDialog
        open={options !== null}
        title={options?.title ?? ''}
        message={options?.message}
        confirmLabel={options?.confirmLabel}
        cancelLabel={options?.cancelLabel}
        variant={options?.variant}
        onConfirm={() => settle(true)}
        onCancel={() => settle(false)}
      />
    </ConfirmContext.Provider>
  )
}
