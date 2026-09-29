import { useEffect, useRef, useState } from 'react'
import { cn } from '../../lib/cn'

export interface DateRange {
  from?: string
  to?: string
}

type PresetId = 'today' | 'yesterday' | '7d' | '30d' | 'thisMonth' | 'lastMonth' | 'thisYear' | 'all'

const toISODate = (date: Date) => date.toISOString().slice(0, 10)

function presetRange(preset: PresetId): DateRange {
  const now = new Date()
  const today = toISODate(now)
  switch (preset) {
    case 'today':
      return { from: today, to: today }
    case 'yesterday': {
      const d = new Date(now)
      d.setDate(d.getDate() - 1)
      return { from: toISODate(d), to: toISODate(d) }
    }
    case '7d': {
      const d = new Date(now)
      d.setDate(d.getDate() - 6)
      return { from: toISODate(d), to: today }
    }
    case '30d': {
      const d = new Date(now)
      d.setDate(d.getDate() - 29)
      return { from: toISODate(d), to: today }
    }
    case 'thisMonth': {
      const start = new Date(now.getFullYear(), now.getMonth(), 1)
      return { from: toISODate(start), to: today }
    }
    case 'lastMonth': {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const end = new Date(now.getFullYear(), now.getMonth(), 0)
      return { from: toISODate(start), to: toISODate(end) }
    }
    case 'thisYear': {
      const start = new Date(now.getFullYear(), 0, 1)
      return { from: toISODate(start), to: today }
    }
    case 'all':
      return {}
  }
}

const PRESETS: { id: PresetId; label: string }[] = [
  { id: 'today', label: 'Hoje' },
  { id: 'yesterday', label: 'Ontem' },
  { id: '7d', label: 'Últimos 7 dias' },
  { id: '30d', label: 'Últimos 30 dias' },
  { id: 'thisMonth', label: 'Este mês' },
  { id: 'lastMonth', label: 'Mês passado' },
  { id: 'thisYear', label: 'Este ano' },
  { id: 'all', label: 'Todo o período' },
]

const dateLabelFormatter = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' })

// Rótulo do botão fechado: tenta casar o range atual com um preset
// conhecido (para mostrar "Últimos 30 dias" em vez da data crua sempre que
// possível) e cai para "dd/mm — dd/mm" quando é um range escolhido à mão.
function currentLabel(range: DateRange): string {
  if (!range.from && !range.to) return 'Todo o período'
  const matchedPreset = PRESETS.find((p) => {
    const r = presetRange(p.id)
    return r.from === range.from && r.to === range.to
  })
  if (matchedPreset) return matchedPreset.label
  const from = range.from ? dateLabelFormatter.format(new Date(`${range.from}T00:00:00`)) : '…'
  const to = range.to ? dateLabelFormatter.format(new Date(`${range.to}T00:00:00`)) : '…'
  return `${from} — ${to}`
}

// Seletor de período no padrão comum de dashboards de mercado (Stripe,
// Google Analytics etc.): um botão que abre um painel com atalhos comuns
// de um lado e um range de datas personalizável do outro — em vez de um
// punhado fixo de botões "7/30/90 dias" que não cobre nada fora deles.
export function PeriodPicker({ value, onChange }: { value: DateRange; onChange: (range: DateRange) => void }) {
  const [open, setOpen] = useState(false)
  const [draftFrom, setDraftFrom] = useState(value.from ?? '')
  const [draftTo, setDraftTo] = useState(value.to ?? '')
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setDraftFrom(value.from ?? '')
    setDraftTo(value.to ?? '')
  }, [value.from, value.to])

  useEffect(() => {
    if (!open) return
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    // Esc fecha o painel, igual ao Select e às janelas.
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  function applyPreset(preset: PresetId) {
    onChange(presetRange(preset))
    setOpen(false)
  }

  function applyCustomRange() {
    onChange({ from: draftFrom || undefined, to: draftTo || undefined })
    setOpen(false)
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={`Período: ${currentLabel(value)}`}
        className="flex items-center gap-2 rounded-full bg-surface-card px-4 py-1.5 text-xs font-semibold text-ink uppercase shadow-card hover:opacity-80"
      >
        <span aria-hidden>📅</span>
        {currentLabel(value)}
      </button>

      {open && (
        <div className="absolute right-0 z-20 mt-2 flex w-[560px] max-w-[90vw] flex-col gap-4 rounded-[6px] border border-grey1 bg-surface-card p-4 shadow-panel sm:flex-row">
          <div className="flex shrink-0 flex-col gap-1 sm:w-40 sm:border-r sm:border-grey1 sm:pr-4">
            {PRESETS.map((preset) => (
              <button
                key={preset.id}
                onClick={() => applyPreset(preset.id)}
                className={cn(
                  'rounded-[6px] px-3 py-2 text-left text-sm hover:bg-surface-muted',
                  currentLabel(value) === preset.label ? 'bg-accent text-on-accent hover:bg-accent' : 'text-ink',
                )}
              >
                {preset.label}
              </button>
            ))}
          </div>

          <div className="flex flex-1 flex-col gap-3">
            <p className="text-xs font-semibold tracking-wide text-ink-muted uppercase">Personalizado</p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <label className="flex flex-1 flex-col gap-1 text-xs text-ink-muted">
                De
                <input
                  type="date"
                  value={draftFrom}
                  max={draftTo || undefined}
                  onChange={(e) => setDraftFrom(e.target.value)}
                  className="rounded-[5px] border border-border px-3 py-2 text-sm text-ink"
                />
              </label>
              <label className="flex flex-1 flex-col gap-1 text-xs text-ink-muted">
                Até
                <input
                  type="date"
                  value={draftTo}
                  min={draftFrom || undefined}
                  onChange={(e) => setDraftTo(e.target.value)}
                  className="rounded-[5px] border border-border px-3 py-2 text-sm text-ink"
                />
              </label>
            </div>
            <button
              onClick={applyCustomRange}
              className="mt-auto self-end rounded-[22px] bg-accent px-5 py-2 text-xs font-semibold text-on-accent uppercase hover:brightness-110"
            >
              Aplicar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
