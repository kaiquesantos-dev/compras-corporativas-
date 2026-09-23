import { Link } from 'react-router-dom'

export function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-surface-muted px-4 text-center">
      <p className="font-sans text-6xl font-bold text-accent italic">_404</p>
      <p className="mt-2 text-ink-muted">Página não encontrada.</p>
      <Link to="/" className="mt-6 text-sm font-semibold text-accent-text uppercase hover:underline">
        Voltar ao painel
      </Link>
    </div>
  )
}
