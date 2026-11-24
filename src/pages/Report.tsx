import { useState } from 'react'
import { Link } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { BarChart3, ChevronLeft, ChevronRight, Download, Plus } from 'lucide-react'
import { db } from '../lib/db'
import { aggregate, fmtMinutes, periodRange, tripsToCsv, type Period } from '../lib/trip'
import { fmtEur, fmtKm } from '../lib/units'
import { Empty, PageHeader, Stat } from '../components/ui'
import CostChart from '../components/CostChart'

const PERIODS: { id: Period; label: string }[] = [
  { id: 'settimana', label: 'Settimana' },
  { id: 'mese', label: 'Mese' },
  { id: 'anno', label: 'Anno' },
  { id: 'tutto', label: 'Tutto' },
]

function periodTitle(period: Period, range: { from: Date; to: Date } | null) {
  if (!range) return 'Tutti i viaggi'
  if (period === 'anno') return String(range.from.getFullYear())
  if (period === 'mese') return range.from.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })
  const last = new Date(range.to)
  last.setDate(last.getDate() - 1)
  const f = (d: Date) => d.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })
  return `${f(range.from)} – ${f(last)} ${last.getFullYear()}`
}

export function downloadFile(name: string, content: string, type: string) {
  // BOM: Excel riconosce gli accenti nei CSV
  const blob = new Blob([type.startsWith('text/csv') ? '﻿' + content : content], { type })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

export default function Report() {
  const [period, setPeriod] = useState<Period>('mese')
  const [offset, setOffset] = useState(0)
  const trips = useLiveQuery(() => db.trips.orderBy('startedAt').toArray(), [])
  const range = periodRange(period, new Date(), offset)
  if (!trips) return null
  const { buckets, totals, trips: inRange } = aggregate(trips, period, range)

  const byDay = new Map<string, typeof inRange>()
  for (const t of [...inRange].reverse()) {
    const k = new Date(t.startedAt).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })
    byDay.set(k, [...(byDay.get(k) ?? []), t])
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Resoconto"
        action={
          <Link to="/viaggio/nuovo" className="btn-ghost text-sm" aria-label="Aggiungi viaggio a mano">
            <Plus size={18} /> Aggiungi
          </Link>
        }
      />
      <div className="grid grid-cols-4 gap-1 rounded-xl bg-stone-200/60 p-1">
        {PERIODS.map((p) => (
          <button
            key={p.id}
            className={`rounded-lg py-2 text-sm font-medium ${period === p.id ? 'bg-white shadow-sm' : 'text-stone-600'}`}
            onClick={() => {
              setPeriod(p.id)
              setOffset(0)
            }}
          >
            {p.label}
          </button>
        ))}
      </div>
      {period !== 'tutto' && (
        <div className="flex items-center justify-between">
          <button className="btn-ghost" onClick={() => setOffset(offset - 1)} aria-label="Periodo precedente">
            <ChevronLeft size={22} />
          </button>
          <p className="font-semibold capitalize">{periodTitle(period, range)}</p>
          <button className="btn-ghost" onClick={() => setOffset(offset + 1)} disabled={offset >= 0} aria-label="Periodo successivo">
            <ChevronRight size={22} />
          </button>
        </div>
      )}

      <section className="card space-y-3">
        <div>
          <p className="text-xs text-stone-500">Costo totale</p>
          <p className="text-4xl font-bold tabular-nums">{fmtEur(totals.total)}</p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Stat label="Carburante" value={fmtEur(totals.fuelCost)} hint={fmtKm(totals.km)} />
          <Stat label="Tempo" value={fmtEur(totals.timeCost)} hint={fmtMinutes(totals.minutes)} />
        </div>
        <p className="text-xs text-stone-500">
          {totals.trips === 1 ? '1 viaggio' : `${totals.trips} viaggi`}
          {totals.trips > 0 && ` · media ${fmtEur(totals.total / totals.trips)} a viaggio`}
        </p>
        {totals.trips > 0 && <CostChart buckets={buckets} />}
      </section>

      {inRange.length === 0 ? (
        <Empty icon={<BarChart3 size={40} />} title="Nessun viaggio nel periodo">
          Registra un viaggio con «Partenza» e «Arrivo», oppure aggiungilo a mano.
        </Empty>
      ) : (
        <section className="space-y-3">
          {[...byDay.entries()].map(([day, list]) => (
            <div key={day} className="card p-3">
              <div className="mb-1 flex justify-between">
                <p className="font-semibold capitalize">{day}</p>
                <p className="font-semibold tabular-nums">{fmtEur(list.reduce((s, t) => s + t.total, 0))}</p>
              </div>
              <ul className="divide-y divide-black/5">
                {list.map((t) => (
                  <li key={t.id}>
                    <Link to={`/viaggio/${t.id}`} className="flex items-center gap-2 py-2 text-sm">
                      <span className="tabular-nums text-stone-500">
                        {new Date(t.startedAt).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <span className="min-w-0 flex-1 truncate">
                        {t.note && <span className="font-medium">{t.note} · </span>}
                        {fmtKm(t.km)} · {fmtMinutes(t.minutes)}
                      </span>
                      <span className="text-right tabular-nums">
                        <span className="block font-semibold">{fmtEur(t.total)}</span>
                        <span className="block text-xs text-stone-500">
                          {fmtEur(t.fuelCost)} + {fmtEur(t.timeCost)}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      )}

      {inRange.length > 0 && (
        <button
          className="btn-secondary w-full"
          onClick={() => {
            const name = `extralavoro-${periodTitle(period, range).replace(/\s+/g, '-').replace(/[^\w-]/g, '').toLowerCase()}.csv`
            downloadFile(name, tripsToCsv(inRange), 'text/csv;charset=utf-8')
          }}
        >
          <Download size={18} /> Esporta il periodo per Excel (CSV)
        </button>
      )}
    </div>
  )
}
