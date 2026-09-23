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

const currencyFormatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

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
  const [showForm, setShowForm] = useState(false)

  const { data: quotes, isLoading } = useQuery({
    queryKey: ['quotes', purchaseRequestId],
    queryFn: () => fetchQuotes(purchaseRequestId),
  })

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['quotes', purchaseRequestId] })
    queryClient.invalidateQueries({ queryKey: ['purchase-request', purchaseRequestId] })
  }

  const canAddQuote = canManage && (status === 'SUBMITTED' || status === 'IN_QUOTATION')
  const canSelect = canManage && status === 'IN_QUOTATION'

  const selectMutation = useMutation({
    mutationFn: (quoteId: number) => selectQuote(purchaseRequestId, quoteId),
    onSuccess: invalidateAll,
  })

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
              onSelect={() => selectMutation.mutate(quote.id)}
              selecting={selectMutation.isPending && selectMutation.variables === quote.id}
            />
          ))}
        </div>
      )}

      {showForm && (
        <NewQuoteForm
          purchaseRequestId={purchaseRequestId}
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
  onSelect,
  selecting,
}: {
  purchaseRequestId: number
  quote: import('../../api/types').Quote
  canSelect: boolean
  onSelect: () => void
  selecting: boolean
}) {
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const uploadMutation = useMutation({
    mutationFn: (file: File) => uploadQuoteProposal(purchaseRequestId, quote.id, file),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['quotes', purchaseRequestId] }),
  })

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) uploadMutation.mutate(file)
  }

  return (
    <div className="flex items-center justify-between rounded-[6px] border border-grey1 px-4 py-3">
      <div>
        <p className="font-semibold text-ink">{quote.supplier?.legalName ?? `Fornecedor #${quote.supplierId}`}</p>
        <p className="text-sm text-ink-muted">
          {currencyFormatter.format(Number(quote.totalValue))} · {statusLabels[quote.status]}
        </p>
        {uploadMutation.isError && (
          <p className="text-xs text-accent-text">
            {errorMessage(uploadMutation.error, 'Não foi possível anexar o arquivo.')}
          </p>
        )}
      </div>
      <div className="flex items-center gap-3">
        {quote.proposalFileName ? (
          <button
            onClick={() => downloadQuoteProposal(purchaseRequestId, quote.id, quote.proposalFileName!)}
            className="text-xs font-semibold text-ink-muted uppercase hover:text-accent-text"
          >
            Baixar proposta
          </button>
        ) : (
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
        )}
        {canSelect && quote.status === 'RECEIVED' && (
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
  onCancel,
  onCreated,
}: {
  purchaseRequestId: number
  onCancel: () => void
  onCreated: () => void
}) {
  const [supplierId, setSupplierId] = useState('')
  const [totalValue, setTotalValue] = useState('')
  const [notes, setNotes] = useState('')

  const { data: suppliers } = useQuery({ queryKey: ['suppliers'], queryFn: () => fetchSuppliers() })

  const createMutation = useMutation({
    mutationFn: createQuote,
    onSuccess: onCreated,
  })

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    createMutation.mutate({
      purchaseRequestId,
      supplierId: Number(supplierId),
      totalValue: Number(totalValue),
      notes: notes || undefined,
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 border-t border-grey1 pt-4">
      <div>
        <label className="mb-1 block text-xs font-semibold tracking-wide text-ink-muted uppercase">
          Fornecedor
        </label>
        <select
          value={supplierId}
          onChange={(e) => setSupplierId(e.target.value)}
          required
          className="w-full rounded-[5px] border border-border bg-surface-card px-4 py-3 text-ink"
        >
          <option value="">Selecione...</option>
          {suppliers?.data.map((supplier) => (
            <option key={supplier.id} value={supplier.id}>
              {supplier.legalName}
            </option>
          ))}
        </select>
      </div>
      <TextField
        label="Valor total"
        type="number"
        step="0.01"
        min="0.01"
        value={totalValue}
        onChange={(e) => setTotalValue(e.target.value)}
        required
      />
      <TextField label="Observações (opcional)" value={notes} onChange={(e) => setNotes(e.target.value)} />

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
