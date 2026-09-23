import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '../../lib/cn'

// Variantes do design system IT Lean (Button/README.md): primary (.main-link),
// outline (.btnenviar). "ghost" é uma adição nossa para ações secundárias de
// tabela/toolbar — o design system original não cobre esse caso (foi feito
// para um site, não para uma aplicação de gestão).
type Variant = 'primary' | 'outline' | 'ghost'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  children: ReactNode
}

const variantClasses: Record<Variant, string> = {
  primary:
    'bg-accent text-on-accent rounded-[22px] px-5 py-3.5 hover:brightness-110',
  outline:
    'border-2 border-accent text-accent-text rounded-[22px] px-5 py-3 hover:bg-accent hover:text-on-accent',
  ghost: 'text-ink hover:bg-grey1 rounded-[8px] px-3 py-2',
}

export function Button({ variant = 'primary', className, children, ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        'font-sans text-[13px] font-semibold italic uppercase tracking-wide transition-all duration-200 ease-in-out disabled:cursor-not-allowed disabled:opacity-50',
        variantClasses[variant],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  )
}
