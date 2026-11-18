import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { ChevronLeft } from 'lucide-react'
import type { PriceSource, PriceStatus } from '../lib/compare'

export function PageHeader({ title, back, action }: { title: string; back?: string; action?: ReactNode }) {
  return (
    <header className="mb-4 flex items-center gap-2">
      {back && (
        <Link to={back} className="btn-ghost -ml-2" aria-label="Indietro">
          <ChevronLeft size={24} />
        </Link>
      )}
      <h1 className="h1 flex-1 truncate">{title}</h1>
      {action}
    </header>
  )
}

const STATUS_STYLE: Record<PriceStatus | 'scaduto', string> = {
  verificato: 'bg-brand-100 text-brand-800',
  segnalato: 'bg-amber-100 text-amber-800',
  scaduto: 'bg-stone-200 text-stone-600',
  rifiutato: 'bg-red-100 text-red-700',
}

const SOURCE_LABEL: Record<PriceSource, string> = {
  openprices: 'Open Prices',
  utente: 'tuo rilievo',
  ufficiale: 'fonte ufficiale',
}

export function PriceStatusChip({ status, source }: { status: PriceStatus | 'scaduto'; source?: PriceSource }) {
  return (
    <span className={`chip ${STATUS_STYLE[status]}`}>
      {status}
      {source && ` · ${SOURCE_LABEL[source]}`}
    </span>
  )
}

export function Empty({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center gap-2 py-8 text-center">
      <div className="text-stone-400">{icon}</div>
      <p className="font-semibold">{title}</p>
      {children && <div className="muted max-w-sm">{children}</div>}
    </div>
  )
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="min-w-0 rounded-xl bg-stone-50 p-2.5">
      <p className="text-xs text-stone-500">{label}</p>
      <p className="text-base font-bold leading-tight tabular-nums">{value}</p>
      {hint && <p className="text-xs text-stone-500">{hint}</p>}
    </div>
  )
}

export function NumberField({
  label,
  value,
  onChange,
  step = 1,
  min,
  max,
  suffix,
  hint,
}: {
  label: string
  value: number | null
  onChange: (v: number | null) => void
  step?: number
  min?: number
  max?: number
  suffix?: string
  hint?: string
}) {
  // Testo locale: il valore viene salvato quando si esce dal campo (si può cancellare e riscrivere).
  const [text, setText] = useState(value == null ? '' : String(value))
  const [focused, setFocused] = useState(false)
  useEffect(() => {
    if (!focused) setText(value == null ? '' : String(value))
  }, [value, focused])
  const commit = () => {
    setFocused(false)
    const v = text.trim() === '' ? null : Number(text.replace(',', '.'))
    if (v === null || Number.isFinite(v)) onChange(v)
  }
  return (
    <label className="block">
      <span className="label">{label}</span>
      <div className="flex items-center gap-2">
        <input
          className="input"
          type="text"
          inputMode="decimal"
          data-step={step}
          aria-valuemin={min}
          aria-valuemax={max}
          value={text}
          onFocus={() => setFocused(true)}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
        {suffix && <span className="shrink-0 text-sm text-stone-500">{suffix}</span>}
      </div>
      {hint && <span className="mt-1 block text-xs text-stone-500">{hint}</span>}
    </label>
  )
}
