import { useEffect, useRef, useState } from 'react'
import { cn } from '../../lib/cn'

export interface SelectOption {
  value: string
  label: string
}

interface SelectProps {
  label: string
  value: string
  onChange: (value: string) => void
  options: SelectOption[]
  placeholder?: string
  hint?: string
  error?: string
  required?: boolean
  disabled?: boolean
  // Aplicado no wrapper externo — mesmo papel do className em TextField.tsx.
  className?: string
}

// Dropdown com a lista de opções renderizada por nós, em vez de um <select>
// nativo: o navegador delega o popup de opções pro SO, que ignora o design
// system inteiro e sempre destaca a opção selecionada em azul (a cor padrão
// do Chrome/Windows) — não dá pra trocar isso em um <select> real. Aqui o
// destaque usa o accent vermelho da IT Lean, igual ao resto da interface.
export function Select({
  label,
  value,
  onChange,
  options,
  placeholder = 'Selecione...',
  hint,
  error,
  required,
  disabled,
  className,
}: SelectProps) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  const selected = options.find((o) => o.value === value)

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <label className="mb-1 block text-xs font-semibold tracking-wide text-ink-muted uppercase">
        {label}
        {required ? <span className="text-accent-text"> *</span> : null}
      </label>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'flex w-full items-center justify-between gap-2 rounded-[5px] border bg-surface-card px-4 py-3 text-left outline-none transition-colors disabled:cursor-not-allowed disabled:opacity-60',
          error ? 'border-accent-text' : open ? 'border-accent' : 'border-border',
        )}
      >
        <span className={cn('truncate', selected ? 'font-bold text-ink' : 'text-ink-muted')}>
          {selected ? selected.label : placeholder}
        </span>
        <svg
          aria-hidden
          viewBox="0 0 20 20"
          className={cn('h-4 w-4 shrink-0 text-ink-muted transition-transform', open && 'rotate-180')}
        >
          <path
            d="M5.5 7.5l4.5 4.5 4.5-4.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {open && (
        <ul
          role="listbox"
          className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-[6px] border border-grey1 bg-surface-card py-1 shadow-panel"
        >
          {options.map((option) => (
            <li key={option.value}>
              <button
                type="button"
                role="option"
                aria-selected={option.value === value}
                onClick={() => {
                  onChange(option.value)
                  setOpen(false)
                }}
                className={cn(
                  'block w-full px-4 py-2 text-left text-sm',
                  option.value === value ? 'bg-accent font-semibold text-on-accent' : 'text-ink hover:bg-surface-muted',
                )}
              >
                {option.label}
              </button>
            </li>
          ))}
        </ul>
      )}

      {error ? (
        <p className="mt-1 text-xs text-accent-text">{error}</p>
      ) : hint ? (
        <p className="mt-1 text-xs text-ink-muted">{hint}</p>
      ) : null}
    </div>
  )
}
