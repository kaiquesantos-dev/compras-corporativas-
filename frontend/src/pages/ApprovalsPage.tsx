import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { isAxiosError } from 'axios'
import { fetchPurchaseRequests } from '../api/purchase-requests'
import { decideApproval } from '../api/approvals'
import { Button } from '../components/ui/Button'
import { TextField } from '../components/ui/TextField'

const dateFormatter = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' })

function errorMessage(err: unknown, fallback: string): string {
  if (!isAxiosError(err)) return fallback
  const message = (err.response?.data as { message?: string | string[] } | undefined)?.message
  return Array.isArray(message) ? message.join(' ') : (message ?? fallback)
}

export function ApprovalsPage() {
  const queryClient = useQueryClient()
  const [comments, setComments] = useState<Record<number, string>>({})

  const { data, isLoading } = useQuery({
    queryKey: ['purchase-requests', 'pending-approval'],
    queryFn: () => fetchPurchaseRequests({ status: 'PENDING_APPROVAL', pageSize: 50 }),
  })

  const decideMutation = useMutation({
    mutationFn: (input: { id: number; decision: 'APPROVED' | 'REJECTED' }) =>
      decideApproval(input.id, input.decision, comments[input.id]),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['purchase-requests'] }),
  })

  return (
    <div>
      <h1 className="mb-6 font-sans text-3xl font-bold text-accent italic">_Aprovações</h1>
      <p className="mb-6 text-sm text-ink-muted">
        Solicitações aguardando decisão — a cotação vencedora já foi selecionada pelo comprador.
      </p>

      {isLoading && <p className="text-ink-muted">Carregando...</p>}

      {data && data.data.length === 0 && (
        <p className="text-ink-muted">Nenhuma solicitação aguardando aprovação no momento.</p>
      )}

      <div className="flex flex-col gap-4">
        {data?.data.map((pr) => (
          <div key={pr.id} className="rounded-[6px] bg-surface-card p-6 shadow-card">
            <div className="mb-3 flex items-start justify-between">
              <div>
                <Link
                  to={`/purchase-requests/${pr.id}`}
                  className="font-sans text-lg font-bold text-ink italic hover:text-accent"
                >
                  {pr.title}
                </Link>
                <p className="text-sm text-ink-muted">
                  {pr.requester?.name} · {dateFormatter.format(new Date(pr.createdAt))}
                </p>
              </div>
            </div>

            <TextField
              label="Comentário (opcional)"
              value={comments[pr.id] ?? ''}
              onChange={(e) => setComments((current) => ({ ...current, [pr.id]: e.target.value }))}
            />

            {decideMutation.isError && decideMutation.variables?.id === pr.id && (
              <p className="mt-2 text-sm text-accent-text">
                {errorMessage(decideMutation.error, 'Não foi possível registrar a decisão.')}
              </p>
            )}

            <div className="mt-4 flex gap-3">
              <Button
                onClick={() => decideMutation.mutate({ id: pr.id, decision: 'APPROVED' })}
                disabled={decideMutation.isPending}
              >
                Aprovar
              </Button>
              <Button
                variant="outline"
                onClick={() => decideMutation.mutate({ id: pr.id, decision: 'REJECTED' })}
                disabled={decideMutation.isPending}
              >
                Rejeitar
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
