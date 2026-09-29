import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { fetchPurchaseMetrics, fetchPurchaseRequests } from '../api/purchase-requests'
import { StatusBadge } from '../components/ui/StatusBadge'
import { Button } from '../components/ui/Button'
import { PeriodPicker, type DateRange } from '../components/ui/PeriodPicker'
import { statusLabels } from '../lib/status-labels'
import { useAuthStore } from '../store/auth-store'
import type { PurchaseRequest, PurchaseRequestStatus } from '../api/types'

// Padrão "últimos 30 dias" ao abrir — preserva o comportamento anterior
// sem travar o usuário nele: PeriodPicker permite trocar para qualquer
// intervalo, incluindo todo o histórico.
function last30Days(): DateRange {
  const to = new Date()
  const from = new Date(to)
  from.setDate(from.getDate() - 29)
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) }
}

// Os dois quadros de lista do painel mostram sempre as mais recentes, sem
// seguir o filtro de período — o subtítulo de cada um diz isso na tela.
const RECENT_LIMIT = 8
const APPROVED_LIMIT = 6

const currencyFormatter =new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const dateFormatter = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' })
const dateTimeFormatter = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' })

// Ordem de exibição da distribuição de status — segue o fluxo natural do
// processo (rascunho → ... → terminal), não a ordem alfabética.
const STATUS_ORDER: PurchaseRequestStatus[] = [
  'DRAFT',
  'SUBMITTED',
  'IN_QUOTATION',
  'PENDING_APPROVAL',
  'APPROVED',
  'COMPLETED',
  'REJECTED',
  'CANCELLED',
]

const STATUS_BAR_COLOR: Record<PurchaseRequestStatus, string> = {
  DRAFT: 'bg-grey2',
  SUBMITTED: 'bg-slate-400',
  IN_QUOTATION: 'bg-blue-400',
  PENDING_APPROVAL: 'bg-amber-400',
  APPROVED: 'bg-emerald-400',
  COMPLETED: 'bg-emerald-600',
  REJECTED: 'bg-accent',
  CANCELLED: 'bg-grey2',
}

// O que cada status significa, mostrado ao passar o mouse na distribuição —
// principalmente para separar "Cancelada" (desistiram antes da decisão) de
// "Rejeitada" (o aprovador negou), que costumam ser confundidas.
const STATUS_HINTS: Record<PurchaseRequestStatus, string> = {
  DRAFT: 'Criada pelo solicitante, ainda não enviada.',
  SUBMITTED: 'Enviada pelo solicitante, aguardando um comprador assumir.',
  IN_QUOTATION: 'O comprador está reunindo propostas de fornecedores.',
  PENDING_APPROVAL: 'Cotação vencedora escolhida, aguardando o aprovador.',
  APPROVED: 'Aprovada. Aguardando o comprador concluir a compra.',
  COMPLETED: 'Compra finalizada pelo comprador.',
  REJECTED: 'O aprovador negou a compra.',
  CANCELLED: 'A solicitação inteira foi cancelada antes da aprovação (pelo solicitante, comprador ou administrador).',
}

// Uma casa decimal no padrão brasileiro (3,4 e não 3.4).
const decimalFormatter = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 })

function formatApprovalTime(hours: number | null): string {
  if (hours === null) return '—'
  if (hours < 1) return 'menos de 1 h'
  if (hours < 48) return `${Math.round(hours)} h`
  return `${decimalFormatter.format(hours / 24)} dias`
}

// Data relativa curta ("hoje", "ontem", "há 5 dias") — dá uma sensação de
// linha do tempo viva sem exigir que o usuário faça conta de cabeça a
// partir de uma data absoluta.
function formatRelativeDate(iso: string): string {
  const date = new Date(iso)
  // Diferença em dias de CALENDÁRIO, não em blocos de 24h: antes, algo
  // criado anteontem às 21h aparecia como "ontem" às 16h de hoje (só 43h
  // de diferença), contradizendo a data mostrada na lista.
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const diffDays = Math.round((startOfDay(new Date()) - startOfDay(date)) / (1000 * 60 * 60 * 24))
  if (diffDays <= 0) return 'hoje'
  if (diffDays === 1) return 'ontem'
  if (diffDays < 30) return `há ${diffDays} dias`
  return dateFormatter.format(date)
}

// periodStart/periodEnd chegam como ISO UTC (ex: "2026-08-01T00:00:00.000Z"),
// representando a data de calendário que o usuário escolheu no PeriodPicker.
// Formatar com `new Date(iso)` direto sofre o fuso local (ex: UTC-3 mostraria
// "31/07" em vez de "01/08") — extrai só a parte da data e reconstrói sem
// horário, para o dateFormatter interpretar em horário local sem deslocar o dia.
function formatUtcDate(iso: string): string {
  return dateFormatter.format(new Date(`${iso.slice(0, 10)}T00:00:00`))
}

// Frase curta explicando exatamente o que os KPIs abaixo estão contando —
// é a resposta direta para "esses números são de quando?".
function PeriodSummary({ periodStart, periodEnd }: { periodStart: string | null; periodEnd: string | null }) {
  let text: string
  if (periodStart && periodEnd && periodStart.slice(0, 10) === periodEnd.slice(0, 10)) {
    // Um dia só ("Hoje", "Ontem"): "entre 27/09 e 27/09" soava estranho.
    text = `Considerando solicitações criadas em ${formatUtcDate(periodStart)}`
  } else if (periodStart && periodEnd) {
    text = `Considerando solicitações criadas entre ${formatUtcDate(periodStart)} e ${formatUtcDate(periodEnd)}`
  } else if (periodStart) {
    text = `Considerando solicitações criadas a partir de ${formatUtcDate(periodStart)}`
  } else if (periodEnd) {
    text = `Considerando solicitações criadas até ${formatUtcDate(periodEnd)}`
  } else {
    text = `Considerando todo o histórico, até ${dateTimeFormatter.format(new Date())}`
  }
  return <p className="mb-4 text-xs text-ink-muted">{text}</p>
}

function KpiCard({
  label,
  value,
  hint,
  accent = false,
}: {
  label: string
  value: string
  hint?: string
  accent?: boolean
}) {
  return (
    // min-w-0: um item de grid não encolhe abaixo da largura do seu
    // conteúdo por padrão, mesmo com minmax(220px, 1fr) na track — sem
    // isso, um valor comprido ainda força o card (e a coluna inteira) a
    // ficar mais largo que o previsto em vez de quebrar linha.
    <div className="min-w-0 rounded-[6px] bg-surface-card p-6 shadow-card">
      <p className="text-xs font-semibold tracking-wide text-ink-muted uppercase">{label}</p>
      {/* Sem break-words de propósito: break-words (overflow-wrap:
          break-word) deixa o navegador quebrar a string em QUALQUER ponto
          quando ela não cabe — inclusive no meio de "20.300,00", virando
          "20.300,0" / "0" numa tela mais estreita. Só existe UM ponto de
          quebra seguro no valor ("R$" / "20.300,00", no espaço), que é
          exatamente o que o wrap padrão do navegador já faz sozinho. */}
      <p
        className={`mt-2 font-sans text-xl leading-tight font-bold italic ${accent ? 'text-accent' : 'text-ink'}`}
      >
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-ink-muted">{hint}</p>}
    </div>
  )
}

function StatusDistribution({ countByStatus }: { countByStatus: Partial<Record<PurchaseRequestStatus, number>> }) {
  const total = STATUS_ORDER.reduce((sum, status) => sum + (countByStatus[status] ?? 0), 0)

  return (
    <div className="rounded-[6px] bg-surface-card p-6 shadow-card">
      <p className="text-xs font-semibold tracking-wide text-ink-muted uppercase">Distribuição por status</p>
      <p className="mb-4 text-xs text-ink-muted">Passe o mouse sobre um status para ver o que ele significa.</p>
      {total === 0 ? (
        // "neste período", não "ainda": os indicadores seguem o filtro de
        // período, e zero aqui quase sempre é o período, não o sistema vazio.
        <p className="text-sm text-ink-muted">Nenhuma solicitação criada neste período.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {STATUS_ORDER.map((status) => {
            const count = countByStatus[status] ?? 0
            const percent = total > 0 ? (count / total) * 100 : 0
            return (
              <div key={status} className="flex items-center gap-3" title={STATUS_HINTS[status]}>
                <span className="w-40 shrink-0 cursor-help text-sm text-ink-muted underline decoration-grey2 decoration-dotted underline-offset-4">
                  {statusLabels[status]}
                </span>
                <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-grey1">
                  <div
                    className={`h-full rounded-full ${STATUS_BAR_COLOR[status]}`}
                    style={{ width: `${percent}%` }}
                  />
                </div>
                <span className="w-8 shrink-0 text-right text-sm font-semibold text-ink">{count}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function RecentActivity({
  requests,
  onlyMine,
  failed,
}: {
  requests: PurchaseRequest[]
  onlyMine: boolean
  failed: boolean
}) {
  return (
    <div className="rounded-[6px] bg-surface-card p-6 shadow-card">
      <p className="text-xs font-semibold tracking-wide text-ink-muted uppercase">
        {onlyMine ? 'Suas solicitações recentes' : 'Solicitações recentes'}
      </p>
      <p className="mb-4 text-xs text-ink-muted">
        {onlyMine
          ? `As suas ${RECENT_LIMIT} últimas, em qualquer status.`
          : `As ${RECENT_LIMIT} últimas criadas, em qualquer status.`}
      </p>
      {failed ? (
        // Sem isso, uma falha da API aparecia como "nenhuma solicitação".
        <p className="text-sm text-accent-text">Não foi possível carregar as solicitações.</p>
      ) : requests.length === 0 ? (
        <p className="text-sm text-ink-muted">Nenhuma solicitação registrada ainda.</p>
      ) : (
        <div className="flex flex-col divide-y divide-grey1">
          {requests.map((pr) => (
            <Link
              key={pr.id}
              to={`/purchase-requests/${pr.id}`}
              className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0 hover:opacity-80"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-ink">{pr.title}</p>
                <p className="text-xs text-ink-muted">
                  {pr.requester?.name ?? 'Solicitante'} · {formatRelativeDate(pr.createdAt)}
                </p>
              </div>
              <StatusBadge status={pr.status} />
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

// Só compras já aprovadas (Aprovada ou Concluída): é o mesmo recorte do
// card "Valor total aprovado", então os dois contam a mesma história. Antes
// este quadro reaproveitava as 8 solicitações recentes e filtrava as que
// tinham cotação — misturava "Aguardando aprovação" e até "Rejeitada" sob
// um título financeiro, e a quantidade de linhas variava sem motivo claro.
function ApprovedPurchases() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['purchase-requests', 'dashboard-approved'],
    queryFn: async () => {
      const [approved, completed] = await Promise.all([
        fetchPurchaseRequests({ page: 1, pageSize: APPROVED_LIMIT, status: 'APPROVED' }),
        fetchPurchaseRequests({ page: 1, pageSize: APPROVED_LIMIT, status: 'COMPLETED' }),
      ])
      return [...approved.data, ...completed.data]
        .filter((pr) => pr.selectedQuote)
        .sort((a, b) => (b.decidedAt ?? '').localeCompare(a.decidedAt ?? ''))
        .slice(0, APPROVED_LIMIT)
    },
  })
  const purchases = data ?? []

  return (
    <div className="rounded-[6px] bg-surface-card p-6 shadow-card">
      <p className="text-xs font-semibold tracking-wide text-ink-muted uppercase">Compras aprovadas</p>
      <p className="mb-4 text-xs text-ink-muted">
        As {APPROVED_LIMIT} aprovações mais recentes, com o fornecedor escolhido e o valor.
      </p>
      {isLoading ? (
        <p className="text-sm text-ink-muted">Carregando...</p>
      ) : isError ? (
        <p className="text-sm text-accent-text">Não foi possível carregar as compras aprovadas.</p>
      ) : purchases.length === 0 ? (
        <p className="text-sm text-ink-muted">Nenhuma compra aprovada ainda.</p>
      ) : (
        <div className="flex flex-col divide-y divide-grey1">
          {purchases.map((pr) => (
            <Link
              key={pr.id}
              to={`/purchase-requests/${pr.id}`}
              className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0 hover:opacity-80"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-ink">{pr.title}</p>
                <p className="truncate text-xs text-ink-muted">
                  {pr.selectedQuote?.supplier?.legalName ?? 'Fornecedor'}
                  {pr.decidedAt ? ` · aprovada em ${dateFormatter.format(new Date(pr.decidedAt))}` : ''}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <p className="font-sans text-sm font-bold text-ink italic">
                  {currencyFormatter.format(Number(pr.selectedQuote!.totalValue))}
                </p>
                <StatusBadge status={pr.status} />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

export function DashboardPage() {
  const user = useAuthStore((state) => state.user)
  const canSeeMetrics = user?.role === 'BUYER' || user?.role === 'APPROVER' || user?.role === 'ADMIN'
  const [range, setRange] = useState<DateRange>(last30Days)

  const { data: metrics, isLoading: metricsLoading, isError: metricsError } = useQuery({
    queryKey: ['purchase-metrics', range.from, range.to],
    queryFn: () => fetchPurchaseMetrics(range),
    enabled: canSeeMetrics,
  })

  const { data: recent, isLoading: recentLoading, isError: recentError } = useQuery({
    queryKey: ['purchase-requests', 'dashboard-recent'],
    queryFn: () => fetchPurchaseRequests({ page: 1, pageSize: RECENT_LIMIT }),
  })

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="font-sans text-3xl font-bold text-accent italic">_Painel</h1>
        {canSeeMetrics && <PeriodPicker value={range} onChange={setRange} />}
      </div>

      {/* Solicitante não vê indicadores: em vez de só apontar para o menu,
          oferece direto a ação principal dele. */}
      {!canSeeMetrics && (
        <div className="mb-6 flex flex-col gap-4 rounded-[6px] bg-surface-card p-6 shadow-card sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-sans text-lg font-bold text-ink italic">Precisa comprar algo?</p>
            <p className="text-sm text-ink-muted">
              Crie uma solicitação e acompanhe cada etapa até a compra ser concluída.
            </p>
          </div>
          <Link to="/purchase-requests/new" className="shrink-0">
            <Button>Nova solicitação</Button>
          </Link>
        </div>
      )}

      {canSeeMetrics && metricsLoading && !metrics && <p className="text-ink-muted">Carregando indicadores...</p>}
      {canSeeMetrics && metricsError && !metrics && (
        <p className="text-accent-text">Não foi possível carregar os indicadores.</p>
      )}

      {canSeeMetrics && metrics && (
        <>
          <PeriodSummary periodStart={metrics.periodStart} periodEnd={metrics.periodEnd} />

          {/* auto-fit + minmax em vez de um número fixo de colunas por
              breakpoint: xl:grid-cols-6 espremia cada card pra 1/6 da
              largura em qualquer tela grande (notebook, TV, monitor
              ultrawide), estourando valores mais longos como "R$ 40.800,00"
              pra fora do card. Com minmax(220px, 1fr), o grid nunca deixa
              uma coluna ficar mais estreita que 220px — largura suficiente
              pro maior valor esperado (moeda) em uma linha só — e adiciona
              mais colunas conforme sobra espaço, em vez de forçar um número
              fixo delas independente da largura real disponível. */}
          <div className="mb-6 grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4">
            <KpiCard label="Aguardando aprovação" value={String(metrics.countByStatus.PENDING_APPROVAL ?? 0)} />
            <KpiCard label="Em cotação" value={String(metrics.countByStatus.IN_QUOTATION ?? 0)} />
            <KpiCard label="Aprovadas" value={String(metrics.countByStatus.APPROVED ?? 0)} />
            <KpiCard label="Concluídas" value={String(metrics.countByStatus.COMPLETED ?? 0)} />
            <KpiCard
              label="Valor total aprovado"
              value={currencyFormatter.format(metrics.totalApprovedValue)}
              hint="Soma das aprovadas e concluídas"
              accent
            />
            <KpiCard
              // Do envio pelo solicitante até a decisão do aprovador — inclui
              // o tempo de cotação e conta aprovações E rejeições, por isso
              // não se chama "tempo de aprovação" nem "tempo do aprovador".
              label="Tempo médio até a decisão"
              value={formatApprovalTime(metrics.averageApprovalTimeHours)}
              hint="Do envio à aprovação ou rejeição"
            />
          </div>

          <div className="mb-6">
            <StatusDistribution countByStatus={metrics.countByStatus} />
          </div>
        </>
      )}

      {recentLoading ? (
        <p className="text-ink-muted">Carregando atividade recente...</p>
      ) : (
        // Duas colunas só quando existe o segundo quadro (Compras aprovadas);
        // para o solicitante, a lista ocupa a largura toda em vez de deixar
        // metade da tela vazia.
        <div className={`grid grid-cols-1 gap-6 ${canSeeMetrics ? 'lg:grid-cols-2' : ''}`}>
          <RecentActivity
            requests={recent?.data ?? []}
            onlyMine={user?.role === 'REQUESTER'}
            failed={recentError}
          />
          {canSeeMetrics && <ApprovedPurchases />}
        </div>
      )}
    </div>
  )
}
