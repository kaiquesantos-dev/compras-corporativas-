import { useRef, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import {
  createQuote,
  downloadQuoteProposal,
  fetchQuotes,
  selectQuote,
  uploadQuoteProposal,
} from '../../api/quotes'
import { fetchSuppliers } from '../../api/suppliers'
import type { PurchaseRequestStatus } from '../../api/types'
import { Button } from '../ui/Button'
import { TextField } from '../ui/TextField'
import { Select } from '../ui/Select'
import { useConfirm } from '../../hooks/confirm-context'

const currencyFormatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
// validUntil é uma data pura gravada como meia-noite UTC — formatar no fuso
// local (UTC-3) mostraria o dia anterior.
const validityFormatter = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeZone: 'UTC' })

const statusLabels: Record<'RECEIVED' | 'SELECTED' | 'DISCARDED', string> = {
  RECEIVED: 'Recebida',
  SELECTED: 'Selecionada',
  DISCARDED: 'Descartada',
}

function errorMessage(err: unknown, fallback: string): string {
  if (!isAxiosError(err)) return fallback
  const message = (err.response?.data as { message?: string | string[] } | undefined)?.message
  return Array.isArray(message) ? message.join(' ') : (message ?? fallback)
}

export function QuotesSection({
  purchaseRequestId,
  status,
  canManage,
}: {
  purchaseRequestId: number
  status: PurchaseRequestStatus
  canManage: boolean
}) {
  const queryClient = useQueryClient()
  const confirm = useConfirm()
  const [showForm, setShowForm] = useState(false)

  const { data: quotes, isLoading, isError: quotesError } = useQuery({
    queryKey: ['quotes', purchaseRequestId],
    queryFn: () => fetchQuotes(purchaseRequestId),
  })

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['quotes', purchaseRequestId] })
    queryClient.invalidateQueries({ queryKey: ['purchase-request', purchaseRequestId] })
    // Selecionar a cotação vencedora também move o status (IN_QUOTATION ->
    // PENDING_APPROVAL) e gera uma linha no histórico — sem isso, o
    // "Histórico de status" só refletia a mudança depois de um reload manual.
    queryClient.invalidateQueries({ queryKey: ['purchase-request-history', purchaseRequestId] })
  }

  const canAddQuote = canManage && (status === 'SUBMITTED' || status === 'IN_QUOTATION')
  const canSelect = canManage && status === 'IN_QUOTATION'

  const selectMutation = useMutation({
    mutationFn: (quoteId: number) => selectQuote(purchaseRequestId, quoteId),
    onSuccess: invalidateAll,
  })

  // Escolher a vencedora descarta as demais cotações e manda a solicitação
  // para aprovação — não dá para voltar atrás pela tela, então confirma
  // antes e diz exatamente o que vai acontecer.
  async function handleSelect(quote: import('../../api/types').Quote) {
    const others = (quotes?.length ?? 1) - 1
    const ok = await confirm({
      title: 'Selecionar cotação vencedora?',
      message: `${quote.supplier?.legalName ?? 'Este fornecedor'} (${currencyFormatter.format(Number(quote.totalValue))}) será a cotação vencedora e a solicitação vai para aprovação.${
        others > 0 ? ` As outras ${others === 1 ? 'cotação será descartada' : `${others} cotações serão descartadas`}.` : ''
      } Esta ação não pode ser desfeita.`,
      confirmLabel: 'Selecionar vencedora',
      cancelLabel: 'Voltar',
      variant: 'success',
    })
    if (ok) selectMutation.mutate(quote.id)
  }

  return (
    <div className="mb-6 rounded-[6px] bg-surface-card p-6 shadow-card">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-xs font-semibold tracking-wide text-ink-muted uppercase">Cotações</p>
        {canAddQuote && !showForm && (
          <Button variant="ghost" onClick={() => setShowForm(true)}>
            + Registrar cotação
          </Button>
        )}
      </div>

      {isLoading && <p className="text-sm text-ink-muted">Carregando...</p>}
      {quotesError && <p className="text-sm text-accent-text">Não foi possível carregar as cotações.</p>}

      {quotes && quotes.length === 0 && !showForm && (
        <p className="text-sm text-ink-muted">Nenhuma cotação registrada ainda.</p>
      )}

      {quotes && quotes.length > 0 && (
        <div className="mb-4 flex flex-col gap-3">
          {quotes.map((quote) => (
            <QuoteRow
              key={quote.id}
              purchaseRequestId={purchaseRequestId}
              quote={quote}
              canSelect={canSelect}
              canUpload={canAddQuote}
              onSelect={() => handleSelect(quote)}
              selecting={selectMutation.isPending && selectMutation.variables === quote.id}
            />
          ))}
        </div>
      )}

      {selectMutation.isError && (
        <p className="mb-4 text-sm text-accent-text">
          {errorMessage(selectMutation.error, 'Não foi possível selecionar a cotação.')}
        </p>
      )}

      {showForm && (
        <NewQuoteForm
          purchaseRequestId={purchaseRequestId}
          quotedSupplierIds={quotes?.map((quote) => quote.supplierId) ?? []}
          onCancel={() => setShowForm(false)}
          onCreated={() => {
            setShowForm(false)
            invalidateAll()
          }}
        />
      )}
    </div>
  )
}

function QuoteRow({
  purchaseRequestId,
  quote,
  canSelect,
  canUpload,
  onSelect,
  selecting,
}: {
  purchaseRequestId: number
  quote: import('../../api/types').Quote
  canSelect: boolean
  canUpload: boolean
  onSelect: () => void
  selecting: boolean
}) {
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  // Mesma regra do backend: válida até o fim do dia informado. Uma cotação
  // vencida não pode ser escolhida como vencedora (o backend barra com 409).
  const expired = Boolean(
    quote.validUntil && quote.validUntil.slice(0, 10) < new Date().toISOString().slice(0, 10),
  )

  const uploadMutation = useMutation({
    mutationFn: (file: File) => uploadQuoteProposal(purchaseRequestId, quote.id, file),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['quotes', purchaseRequestId] }),
  })

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) uploadMutation.mutate(file)
  }

  return (
    // items-start (não items-center): a razão social pode ser longa o
    // suficiente para quebrar em duas linhas, e com items-center os botões
    // à direita ficavam descentralizados em relação ao texto.
    // A vencedora ganha borda e fundo verdes; as descartadas ficam apagadas —
    // dá pra saber de relance qual proposta ganhou.
    <div
      className={`flex flex-wrap items-start justify-between gap-3 rounded-[6px] border px-4 py-3 ${
        quote.status === 'SELECTED'
          ? 'border-emerald-400 bg-emerald-50/60'
          : quote.status === 'DISCARDED'
            ? 'border-grey1 opacity-60'
            : 'border-grey1'
      }`}
    >
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-2 font-semibold text-ink">
          {quote.supplier?.legalName ?? `Fornecedor #${quote.supplierId}`}
          {quote.status === 'SELECTED' && (
            <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-white uppercase">
              Vencedora
            </span>
          )}
        </p>
        <p className="text-sm text-ink-muted">
          {currencyFormatter.format(Number(quote.totalValue))}
          {quote.status !== 'SELECTED' && ` · ${statusLabels[quote.status]}`}
          {expired && <span className="font-semibold text-accent-text"> · Vencida</span>}
          {quote.validUntil && !expired && ` · válida até ${validityFormatter.format(new Date(quote.validUntil))}`}
        </p>
        {uploadMutation.isError && (
          <p className="text-xs text-accent-text">
            {errorMessage(uploadMutation.error, 'Não foi possível anexar o arquivo.')}
          </p>
        )}
      </div>
      {/* flex-wrap sem shrink-0: em telas estreitas, "Anexar proposta" e o
          botão "Selecionar vencedora" juntos podem ser mais largos que o
          espaço restante do card — sem wrap eles estouravam para fora do
          card em vez de quebrar para uma nova linha. */}
      <div className="flex flex-wrap items-center gap-3">
        {quote.proposalFileName ? (
          <button
            onClick={() => downloadQuoteProposal(purchaseRequestId, quote.id, quote.proposalFileName!)}
            className="text-xs font-semibold text-ink-muted uppercase hover:text-accent-text"
          >
            Baixar proposta
          </button>
        ) : (
          canUpload && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.png,.jpg,.jpeg"
                className="hidden"
                onChange={handleFileChange}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadMutation.isPending}
                className="text-xs font-semibold text-ink-muted uppercase hover:text-accent-text"
              >
                {uploadMutation.isPending ? 'Enviando...' : 'Anexar proposta'}
              </button>
            </>
          )
        )}
        {canSelect && quote.status === 'RECEIVED' && !expired && (
          <Button variant="outline" onClick={onSelect} disabled={selecting}>
            {selecting ? 'Selecionando...' : 'Selecionar vencedora'}
          </Button>
        )}
      </div>
    </div>
  )
}

function NewQuoteForm({
  purchaseRequestId,
  quotedSupplierIds,
  onCancel,
  onCreated,
}: {
  purchaseRequestId: number
  quotedSupplierIds: number[]
  onCancel: () => void
  onCreated: () => void
}) {
  const [supplierId, setSupplierId] = useState('')
  const [totalValue, setTotalValue] = useState('')
  const [notes, setNotes] = useState('')
  const [validUntil, setValidUntil] = useState('')
  const today = new Date().toISOString().slice(0, 10)
  const [file, setFile] = useState<File | null>(null)

  // Só fornecedores ativos aqui: um inativo (tipicamente cadastrado com
  // CNPJ errado, ou que parou de operar com a empresa) não pode receber
  // cotação nova — o backend já bloqueia isso (409), mas nem faz sentido
  // deixar a pessoa escolher uma opção que vai falhar.
  const { data: suppliers } = useQuery({
    queryKey: ['suppliers', 'active'],
    queryFn: () => fetchSuppliers(1, { isActive: true, pageSize: 100 }),
  })

  const createMutation = useMutation({
    mutationFn: createQuote,
    onSuccess: onCreated,
  })

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    // Select customizado não tem validação nativa de "required" do
    // navegador (não é um <select> de verdade) — a checagem precisa ser
    // feita aqui antes de disparar a mutation.
    if (!supplierId) return
    createMutation.mutate({
      purchaseRequestId,
      supplierId: Number(supplierId),
      totalValue: Number(totalValue),
      notes: notes || undefined,
      validUntil: validUntil || undefined,
      file: file ?? undefined,
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 border-t border-grey1 pt-4">
      <Select
        label="Fornecedor"
        value={supplierId}
        onChange={setSupplierId}
        required
        // Cada fornecedor participa com uma única cotação (o backend barra a
        // segunda com 409) — quem já cotou nem aparece como opção.
        options={
          suppliers?.data
            .filter((supplier) => !quotedSupplierIds.includes(supplier.id))
            .map((supplier) => ({ value: String(supplier.id), label: supplier.legalName })) ?? []
        }
      />
      <TextField
        label="Valor total"
        type="number"
        step="0.01"
        min="0.01"
        max={1000000000}
        value={totalValue}
        onChange={(e) => setTotalValue(e.target.value)}
        required
      />
      <TextField
        label="Válida até (opcional)"
        type="date"
        min={today}
        value={validUntil}
        onChange={(e) => setValidUntil(e.target.value)}
        hint="Até quando o fornecedor garante este preço. Cotação vencida não pode ser escolhida como vencedora."
      />
      <TextField
        label="Observações (opcional)"
        multiline
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        maxLength={1000}
      />

      <div>
        <label className="mb-1 block text-xs font-semibold tracking-wide text-ink-muted uppercase">
          Proposta (opcional)
        </label>
        <input
          type="file"
          accept=".pdf,.png,.jpg,.jpeg"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="w-full rounded-[5px] border border-border bg-surface-card px-4 py-3 text-sm text-ink file:mr-3 file:rounded-[5px] file:border-0 file:bg-grey1 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:uppercase file:text-ink"
        />
        <p className="mt-1 text-xs text-ink-muted">PDF, PNG ou JPEG, até 5MB. Pode ser anexada depois também.</p>
      </div>

      {createMutation.isError && (
        <p className="text-sm text-accent-text">
          {errorMessage(createMutation.error, 'Não foi possível registrar a cotação.')}
        </p>
      )}

      <div className="flex gap-3">
        <Button type="submit" disabled={createMutation.isPending}>
          {createMutation.isPending ? 'Salvando...' : 'Registrar cotação'}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </form>
  )
}
