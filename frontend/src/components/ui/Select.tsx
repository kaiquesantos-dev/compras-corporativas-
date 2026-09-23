import { useId, useState, type SelectHTMLAttributes } from 'react'
import { cn } from '../../lib/cn'

interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'className'> {
  label: string
  hint?: string
  error?: string
  // Aplicado no wrapper externo (não no <select>) — mesmo papel do
  // className em TextField.tsx, para o pai controlar posicionamento.
  className?: string
}

// Select com o mesmo tratamento visual dos campos do design system
// (borda que reage a foco/erro, igual ao TextField) — mas com rótulo fixo
// acima em vez de flutuante, já que um <select> sempre mostra um valor
// selecionado (não existe o estado "vazio" que justifica o rótulo flutuar).
export function Select({ label, hint, error, className, id, children, onFocus, onBlur, ...props }: SelectProps) {
  const generatedId = useId()
  const fieldId = id ?? generatedId
  const [focused, setFocused] = useState(false)

  return (
    <div className={cn('relative', className)}>
      <label htmlFor={fieldId} className="mb-1 block text-xs font-semibold tracking-wide text-ink-muted uppercase">
        {label}
      </label>
      <select
        id={fieldId}
        onFocus={(e) => {
          setFocused(true)
          onFocus?.(e)
        }}
        onBlur={(e) => {
          setFocused(false)
          onBlur?.(e)
        }}
        className={cn(
          'w-full rounded-[5px] border bg-surface-card px-4 py-3 font-bold text-ink outline-none transition-colors',
          error ? 'border-accent-text' : focused ? 'border-accent' : 'border-border',
        )}
        {...props}
      >
        {children}
      </select>
      {error ? (
        <p className="mt-1 text-xs text-accent-text">{error}</p>
      ) : hint ? (
        <p className="mt-1 text-xs text-ink-muted">{hint}</p>
      ) : null}
    </div>
  )
}
