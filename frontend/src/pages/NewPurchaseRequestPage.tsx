import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { createPurchaseRequest, type CreatePurchaseRequestInput } from '../api/purchase-requests'
import { Button } from '../components/ui/Button'
import { TextField } from '../components/ui/TextField'

type ItemDraft = CreatePurchaseRequestInput['items'][number]

const emptyItem: ItemDraft = { description: '', quantity: 1, unit: 'unidade' }

export function NewPurchaseRequestPage() {
  const [title, setTitle] = useState('')
  const [justification, setJustification] = useState('')
  const [items, setItems] = useState<ItemDraft[]>([{ ...emptyItem }])
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  function updateItem(index: number, patch: Partial<ItemDraft>) {
    setItems((current) => current.map((item, i) => (i === index ? { ...item, ...patch } : item)))
  }

  function addItem() {
    setItems((current) => [...current, { ...emptyItem }])
  }

  function removeItem(index: number) {
    setItems((current) => current.filter((_, i) => i !== index))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const created = await createPurchaseRequest({ title, justification, items })
      // Sem isso, voltar para a listagem logo em seguida podia mostrar dados
      // desatualizados (sem a solicitação recem-criada) ate o cache expirar
      // sozinho — nao falhava sempre, so dependia de quanto tempo tinha
      // passado desde a ultima vez que a lista foi carregada.
      queryClient.invalidateQueries({ queryKey: ['purchase-requests'] })
      navigate(`/purchase-requests/${created.id}`, { replace: true })
    } catch (err) {
      const message = isAxiosError(err)
        ? ((err.response?.data as { message?: string | string[] } | undefined)?.message ?? 'Não foi possível criar a solicitação.')
        : 'Não foi possível criar a solicitação.'
      setError(Array.isArray(message) ? message.join(' ') : message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-6 font-sans text-3xl font-bold text-accent italic">_Nova solicitação</h1>

      <form onSubmit={handleSubmit} className="flex flex-col gap-6 rounded-[6px] bg-surface-card p-6 shadow-card">
        <TextField
          label="Título"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          minLength={3}
          maxLength={200}
        />
        <TextField
          label="Justificativa"
          multiline
          value={justification}
          onChange={(e) => setJustification(e.target.value)}
          required
          minLength={10}
          maxLength={2000}
          hint={`${justification.length}/2000 caracteres`}
        />

        <div>
          <p className="mb-2 text-xs font-semibold tracking-wide text-ink-muted uppercase">Itens</p>
          <div className="flex flex-col gap-4">
            {items.map((item, index) => (
              <div
                key={index}
                className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_90px_100px_130px_auto] sm:items-center"
              >
                <TextField
                  label="Descrição"
                  value={item.description}
                  onChange={(e) => updateItem(index, { description: e.target.value })}
                  required
                  maxLength={200}
                  className="col-span-2 sm:col-span-1"
                />
                <TextField
                  label="Qtd."
                  type="number"
                  min={1}
                  max={100000}
                  step={1}
                  value={item.quantity}
                  onChange={(e) => updateItem(index, { quantity: Number(e.target.value) })}
                  required
                />
                <TextField
                  label="Unidade"
                  value={item.unit}
                  onChange={(e) => updateItem(index, { unit: e.target.value })}
                  required
                  maxLength={30}
                />
                <TextField
                  label="Preço unit. (R$)"
                  type="number"
                  min={0}
                  max={1000000000}
                  step="0.01"
                  value={item.estimatedUnitPrice ?? ''}
                  onChange={(e) =>
                    updateItem(index, {
                      estimatedUnitPrice: e.target.value === '' ? undefined : Number(e.target.value),
                    })
                  }
                  className="col-span-2 sm:col-span-1"
                />
                <button
                  type="button"
                  onClick={() => removeItem(index)}
                  disabled={items.length === 1}
                  className="col-span-2 text-xs font-semibold text-accent-text uppercase disabled:opacity-30 sm:col-span-1 sm:self-center"
                >
                  Remover
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={addItem}
            className="mt-3 text-xs font-semibold text-accent-text uppercase hover:underline"
          >
            + Adicionar item
          </button>
        </div>

        {error && <p className="text-sm text-accent-text">{error}</p>}

        <Button type="submit" disabled={submitting}>
          {submitting ? 'Criando...' : 'Criar solicitação'}
        </Button>
      </form>
    </div>
  )
}
