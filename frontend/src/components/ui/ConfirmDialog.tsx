import { useEffect, useRef } from 'react'
import { cn } from '../../lib/cn'
import { Button } from './Button'

export type ConfirmVariant = 'danger' | 'success' | 'neutral'

export interface ConfirmOptions {
  title: string
  message?: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: ConfirmVariant
}

const ICON_RING: Record<ConfirmVariant, string> = {
  danger: 'border-accent text-accent-text',
  success: 'border-emerald-500 text-emerald-500',
  neutral: 'border-ink-muted text-ink-muted',
}

const CONFIRM_BUTTON_CLASS: Record<ConfirmVariant, string> = {
  danger: 'bg-accent text-on-accent hover:brightness-110',
  success: 'bg-emerald-600 text-white hover:brightness-110',
  neutral: 'bg-accent text-on-accent hover:brightness-110',
}

function Icon({ variant }: { variant: ConfirmVariant }) {
  if (variant === 'success') {
    return (
      <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="2.5">
        <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }
  if (variant === 'danger') {
    return (
      <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="2.5">
        <path d="M12 9v4M12 16.5h.01" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="12" cy="12" r="9" strokeLinecap="round" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="M12 8v5M12 16h.01" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="9" strokeLinecap="round" />
    </svg>
  )
}

// "Sweet alert" no estilo do design system da IT Lean — substitui o
// window.confirm() nativo do navegador (sem estilo nenhum, quebra a
// identidade visual) por um modal consistente com o resto da aplicação.
// Ícone circular colorido por variante (danger = vermelho de destruição,
// success = verde de confirmação positiva) + título + mensagem + 2 botões.
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  variant = 'danger',
  pending = false,
  onConfirm,
  onCancel,
}: ConfirmOptions & {
  open: boolean
  pending?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  const cancelButtonRef = useRef<HTMLButtonElement>(null)
  // Guarda quem tinha foco antes do modal abrir (o botão "Remover"/"Delegar
  // admin" que disparou o confirm()) pra devolver o foco pra lá quando
  // fechar — sem isso, um usuário de teclado/leitor de tela perde a
  // referência de onde estava depois de confirmar/cancelar.
  const triggerRef = useRef<Element | null>(null)

  useEffect(() => {
    if (!open) return
    triggerRef.current = document.activeElement
    // Foco no botão "Cancelar" por padrão (não no de confirmar): pressionar
    // Enter sem querer não deveria disparar a ação destrutiva/irreversível.
    cancelButtonRef.current?.focus()

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      if (triggerRef.current instanceof HTMLElement) {
        triggerRef.current.focus()
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
    >
      <div className="w-full max-w-sm rounded-[6px] bg-surface-card p-6 text-center shadow-panel">
        <div
          className={cn(
            'mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full border-[3px]',
            ICON_RING[variant],
          )}
        >
          <Icon variant={variant} />
        </div>

        <h2 id="confirm-dialog-title" className="mb-2 font-sans text-xl font-bold text-ink italic">
          {title}
        </h2>
        {message ? <p className="mb-6 text-sm text-ink-muted">{message}</p> : <div className="mb-6" />}

        <div className="flex flex-col gap-3 sm:flex-row-reverse">
          <Button
            type="button"
            onClick={onConfirm}
            disabled={pending}
            className={cn('flex-1 rounded-[22px]', CONFIRM_BUTTON_CLASS[variant])}
          >
            {pending ? 'Aguarde...' : confirmLabel}
          </Button>
          <Button
            ref={cancelButtonRef}
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={pending}
            className="flex-1"
          >
            {cancelLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
