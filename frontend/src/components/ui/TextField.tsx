import { useId, useState, type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { cn } from '../../lib/cn'

interface BaseProps {
  label: string
  hint?: string
  error?: string
  multiline?: boolean
  // Aplicado no wrapper externo (não no <input>) — é o que um grid/flex pai
  // precisa controlar (ex: col-span) para posicionar o campo inteiro.
  className?: string
}

type TextFieldProps = BaseProps &
  Omit<InputHTMLAttributes<HTMLInputElement> & TextareaHTMLAttributes<HTMLTextAreaElement>, 'className'>

// Campo com rótulo flutuante (design system: TextField/README.md). O rótulo
// começa dentro do campo, em ink-muted, e "sobe" para cima em accent-text
// quando o campo tem foco ou já foi preenchido.
export function TextField({
  label,
  hint,
  error,
  multiline,
  className,
  id,
  value,
  defaultValue,
  ...props
}: TextFieldProps) {
  const generatedId = useId()
  const fieldId = id ?? generatedId
  const [hasValue, setHasValue] = useState(Boolean(value ?? defaultValue))
  const [focused, setFocused] = useState(false)
  const floated = focused || hasValue

  const fieldClassName = cn(
    'peer w-full rounded-[5px] border bg-surface-card px-4 pt-5 pb-2 font-bold text-ink outline-none transition-colors',
    error ? 'border-accent-text' : focused ? 'border-accent' : 'border-border',
  )

  const sharedProps = {
    id: fieldId,
    value,
    defaultValue,
    onFocus: () => setFocused(true),
    onBlur: (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setFocused(false)
      setHasValue(Boolean(e.target.value))
    },
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setHasValue(Boolean(e.target.value))
      props.onChange?.(e as never)
    },
  }

  return (
    <div className={cn('relative', className)}>
      <div className="relative">
        {multiline ? (
          <textarea
            {...sharedProps}
            {...(props as TextareaHTMLAttributes<HTMLTextAreaElement>)}
            className={cn(fieldClassName, 'h-[140px] resize-none')}
          />
        ) : (
          <input
            {...sharedProps}
            {...(props as InputHTMLAttributes<HTMLInputElement>)}
            className={fieldClassName}
          />
        )}
        <label
          htmlFor={fieldId}
          className={cn(
            'pointer-events-none absolute left-4 transition-all duration-150',
            floated
              ? 'top-1.5 text-[10px] font-bold text-accent-text'
              : 'top-1/2 -translate-y-1/2 text-base text-ink-muted',
          )}
        >
          {label}
        </label>
      </div>
      {error ? (
        <p className="mt-1 text-xs text-accent-text">{error}</p>
      ) : hint ? (
        <p className="mt-1 text-xs text-ink-muted">{hint}</p>
      ) : null}
    </div>
  )
}
