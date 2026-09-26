import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { isAxiosError } from 'axios'
import { fetchPurchaseRequests } from '../api/purchase-requests'
import { decideApproval } from '../api/approvals'
import { Button } from '../components/ui/Button'
import { TextField } from '../components/ui/TextField'
import { StatusBadge } from '../components/ui/StatusBadge'
import { Pagination } from '../components/ui/Pagination'
import { useConfirm } from '../hooks/confirm-context'
import { useAuthStore } from '../store/auth-store'
import type { PurchaseRequest } from '../api/types'

const dateFormatter = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' })
const dateTimeFormatter = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' })

function errorMessage(err: unknown, fallback: string): string {
  if (!isAxiosError(err)) return fallback
  const message = (err.response?.data as { message?: string | string[] } | undefined)?.message
  return Array.isArray(message) ? message.join(' ') : (message ?? fallback)
}

type Tab = 'pending' | 'history'

export function ApprovalsPage() {
  const queryClient = useQueryClient()
  const confirm = useConfirm()
  const currentUserId = useAuthStore((state) => state.user?.id)
  const [comments, setComments] = useState<Record<number, string>>({})
  const [tab, setTab] = useState<Tab>('pending')
  const [pendingPage, setPendingPage] = useState(1)

  const { data, isLoading } = useQuery({
    // Paginado: antes buscava só as 50 primeiras, sem aviso — a partir da
    // 51ª, a solicitação simplesmente não aparecia pra ninguém aprovar.
    queryKey: ['purchase-requests', 'pending-approval', pendingPage],
    queryFn: () => fetchPurchaseRequests({ status: 'PENDING_APPROVAL', page: pendingPage, pageSize: 20 }),
  })

  // A API só filtra por um status de cada vez — pra juntar aprovadas e
  // rejeitadas num histórico só, buscamos as duas listas em paralelo e
  // mesclamos aqui, ordenando pela data da decisão (mais recente primeiro).
  // pageSize:100 é o máximo que o backend aceita (MAX_PAGE_SIZE) — se algum
  // dia isso não bastar, "truncated" abaixo avisa em vez de esconder dados
  // silenciosamente.
  const HISTORY_PAGE_SIZE = 100
  const { data: approvedData, isLoading: approvedLoading } = useQuery({
    queryKey: ['purchase-requests', 'decision-history', 'APPROVED'],
    queryFn: () => fetchPurchaseRequests({ status: 'APPROVED', pageSize: HISTORY_PAGE_SIZE }),
    enabled: tab === 'history',
  })
  const { data: rejectedData, isLoading: rejectedLoading } = useQuery({
    queryKey: ['purchase-requests', 'decision-history', 'REJECTED'],
    queryFn: () => fetchPurchaseRequests({ status: 'REJECTED', pageSize: HISTORY_PAGE_SIZE }),
    enabled: tab === 'history',
  })
  // Uma solicitação aprovada que depois teve a compra concluída sai de
  // APPROVED e vira COMPLETED — sem esta terceira busca, toda aprovação que
  // virou compra de verdade sumia do histórico de decisões.
  const { data: completedData, isLoading: completedLoading } = useQuery({
    queryKey: ['purchase-requests', 'decision-history', 'COMPLETED'],
    queryFn: () => fetchPurchaseRequests({ status: 'COMPLETED', pageSize: HISTORY_PAGE_SIZE }),
    enabled: tab === 'history',
  })

  const historySources = [approvedData, rejectedData, completedData]
  const history: PurchaseRequest[] = historySources
    .flatMap((source) => source?.data ?? [])
    .sort(
      (a, b) =>
        new Date(b.decidedAt ?? b.createdAt).getTime() - new Date(a.decidedAt ?? a.createdAt).getTime(),
    )
  const historyLoading = approvedLoading || rejectedLoading || completedLoading
  const historyTruncated = historySources.some((source) => source && source.total > source.data.length)

  const decideMutation = useMutation({
    mutationFn: (input: { id: number; decision: 'APPROVED' | 'REJECTED' }) =>
      decideApproval(input.id, input.decision, comments[input.id]),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchase-requests'] })
      // Sem isso, quem decidiu aqui e depois abre a tela de detalhe da
      // mesma solicitação (via cache do React Query) via ainda o status e o
      // historico antigos, ate expirar o cache ou dar reload manual.
      queryClient.invalidateQueries({ queryKey: ['purchase-request'] })
      queryClient.invalidateQueries({ queryKey: ['purchase-request-history'] })
      // Faltava isso: aprovar/rejeitar muda "aguardando aprovação",
      // "aprovadas" e a distribuição por status do Painel — sem invalidar,
      // os KPIs lá ficavam mostrando os números de antes da decisão até o
      // cache expirar sozinho.
      queryClient.invalidateQueries({ queryKey: ['purchase-metrics'] })
    },
  })

  // Aprovar/rejeitar move a solicitação pra um estado terminal (ou quase) e
  // não tem como desfazer pela UI — por isso pede confirmação antes, no
  // lugar de disparar a decisão direto no clique do botão.
  async function handleDecide(pr: PurchaseRequest, decision: 'APPROVED' | 'REJECTED') {
    const ok = await confirm({
      title: decision === 'APPROVED' ? 'Aprovar solicitação?' : 'Rejeitar solicitação?',
      message: `"${pr.title}" será ${decision === 'APPROVED' ? 'aprovada' : 'rejeitada'}. Esta decisão fica registrada no histórico e não pode ser desfeita.`,
      confirmLabel: decision === 'APPROVED' ? 'Aprovar' : 'Rejeitar',
      variant: decision === 'APPROVED' ? 'success' : 'danger',
    })
    if (ok) decideMutation.mutate({ id: pr.id, decision })
  }

  return (
    <div>
      <h1 className="mb-6 font-sans text-3xl font-bold text-accent italic">_Aprovações</h1>

      <div className="mb-6 flex gap-2">
        <button
          onClick={() => setTab('pending')}
          className={`rounded-full px-4 py-1.5 text-xs font-semibold uppercase transition-colors ${
            tab === 'pending' ? 'bg-accent text-on-accent' : 'bg-surface-card text-ink-muted shadow-card hover:text-ink'
          }`}
        >
          Pendentes
        </button>
        <button
          onClick={() => setTab('history')}
          className={`rounded-full px-4 py-1.5 text-xs font-semibold uppercase transition-colors ${
            tab === 'history' ? 'bg-accent text-on-accent' : 'bg-surface-card text-ink-muted shadow-card hover:text-ink'
          }`}
        >
          Histórico
        </button>
      </div>

      {tab === 'pending' && (
        <>
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
                  multiline
                  value={comments[pr.id] ?? ''}
                  onChange={(e) => setComments((current) => ({ ...current, [pr.id]: e.target.value }))}
                  maxLength={1000}
                />

                {decideMutation.isError && decideMutation.variables?.id === pr.id && (
                  <p className="mt-2 text-sm text-accent-text">
                    {errorMessage(decideMutation.error, 'Não foi possível registrar a decisão.')}
                  </p>
                )}

                {/* Segregação de funções: quem pediu a compra não decide
                    sobre ela (o backend também barra com 403). */}
                {pr.requesterId === currentUserId ? (
                  <p className="mt-4 text-sm text-ink-muted">
                    Você criou esta solicitação, então outro aprovador precisa decidir sobre ela.
                  </p>
                ) : (
                  <div className="mt-4 flex gap-3">
                    <Button onClick={() => handleDecide(pr, 'APPROVED')} disabled={decideMutation.isPending}>
                      Aprovar
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => handleDecide(pr, 'REJECTED')}
                      disabled={decideMutation.isPending}
                    >
                      Rejeitar
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
          {data && (
            <Pagination
              page={data.page}
              pageSize={data.pageSize}
              total={data.total}
              onPageChange={setPendingPage}
            />
          )}
        </>
      )}

      {tab === 'history' && (
        <>
          <p className="mb-6 text-sm text-ink-muted">
            Todas as solicitações já decididas — aprovadas (inclusive as que já tiveram a compra
            concluída) ou rejeitadas. Cada linha leva ao histórico completo de status da solicitação,
            incluindo quem decidiu e quando.
          </p>

          {historyLoading && <p className="text-ink-muted">Carregando...</p>}

          {!historyLoading && history.length === 0 && (
            <p className="text-ink-muted">Nenhuma decisão registrada ainda.</p>
          )}

          {!historyLoading && historyTruncated && (
            <p className="mb-4 text-xs text-ink-muted">
              Mostrando as {HISTORY_PAGE_SIZE} decisões mais recentes de cada tipo (aprovada, concluída, rejeitada).
              Há mais decisões além dessas.
            </p>
          )}

          {history.length > 0 && (
            <div className="overflow-x-auto rounded-[6px] bg-surface-card shadow-card">
              <table className="w-full text-left text-sm">
                <thead className="bg-grey1 text-xs font-semibold text-ink-muted uppercase">
                  <tr>
                    <th className="px-4 py-3">Título</th>
                    <th className="px-4 py-3">Solicitante</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Decidida em</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((pr) => (
                    <tr key={pr.id} className="border-t border-grey1 align-top hover:bg-surface-muted">
                      <td className="px-4 py-3">
                        <Link
                          to={`/purchase-requests/${pr.id}`}
                          className="font-semibold text-ink hover:text-accent"
                        >
                          {pr.title}
                        </Link>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-ink-muted">{pr.requester?.name ?? '—'}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <StatusBadge status={pr.status} />
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-ink-muted">
                        {pr.decidedAt ? dateTimeFormatter.format(new Date(pr.decidedAt)) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}
