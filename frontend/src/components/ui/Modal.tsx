import type { ReactNode } from 'react'

export function Modal({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: ReactNode
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-[6px] bg-surface-card p-6 shadow-panel">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="font-sans text-xl font-bold text-accent italic">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Fechar"
            className="text-ink-muted hover:text-ink"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
