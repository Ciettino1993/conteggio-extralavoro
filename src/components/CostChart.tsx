import { useEffect, useRef, useState } from 'react'
import type { Bucket } from '../lib/trip'
import { fmtEur } from '../lib/units'

// Palette categorica validata (slot 1 blu, slot 2 arancio): colore = identità della serie.
export const SERIES = [
  { key: 'fuelCost', label: 'Carburante', color: '#2a78d6' },
  { key: 'timeCost', label: 'Tempo', color: '#eb6834' },
] as const

const H = 190
const PAD = { top: 10, right: 6, bottom: 22, left: 40 }
const GAP = 2 // spazio tra segmenti impilati

function niceMax(v: number) {
  if (v <= 0) return 10
  const p = 10 ** Math.floor(Math.log10(v))
  return [1, 2, 2.5, 5, 10].map((m) => m * p).find((x) => x >= v)!
}

/** Barre impilate carburante + tempo per giorno o mese, con tooltip al tocco. */
export default function CostChart({ buckets }: { buckets: Bucket[] }) {
  const wrap = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(320)
  const [hover, setHover] = useState<number | null>(null)

  useEffect(() => {
    const el = wrap.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setW(Math.max(240, e.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const max = niceMax(Math.max(...buckets.map((b) => b.fuelCost + b.timeCost), 0))
  const plotW = w - PAD.left - PAD.right
  const plotH = H - PAD.top - PAD.bottom
  const slot = plotW / Math.max(1, buckets.length)
  const barW = Math.max(3, Math.min(28, slot * 0.7))
  const y = (v: number) => PAD.top + plotH - (v / max) * plotH
  const ticks = [0, max / 2, max]
  const labelEvery = Math.ceil(buckets.length / Math.max(1, Math.floor(plotW / 34)))
  const hb = hover != null ? buckets[hover] : null

  // Rettangolo con angoli superiori arrotondati (estremità dati), base piatta sull'asse.
  const topRounded = (x: number, y0: number, width: number, height: number, r: number) => {
    const rr = Math.min(r, height, width / 2)
    return `M${x},${y0 + height}V${y0 + rr}Q${x},${y0} ${x + rr},${y0}H${x + width - rr}Q${x + width},${y0} ${x + width},${y0 + rr}V${y0 + height}Z`
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-4 text-xs text-stone-600" aria-hidden>
        {SERIES.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} /> {s.label}
          </span>
        ))}
      </div>
      <div ref={wrap} className="relative" onMouseLeave={() => setHover(null)}>
        <svg width={w} height={H} role="img" aria-label="Costi di carburante e tempo nel periodo">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={w - PAD.right} y1={y(t)} y2={y(t)} stroke="#e7e5e4" strokeWidth={1} />
              <text x={PAD.left - 6} y={y(t) + 4} textAnchor="end" fontSize={10} fill="#78716c">
                {t.toLocaleString('it-IT', { maximumFractionDigits: 0 })} €
              </text>
            </g>
          ))}
          {buckets.map((b, i) => {
            const x = PAD.left + i * slot + (slot - barW) / 2
            const fuelH = (b.fuelCost / max) * plotH
            const timeH = (b.timeCost / max) * plotH
            const base = PAD.top + plotH
            const hasTime = timeH > 0.5
            return (
              <g key={b.key} opacity={hover == null || hover === i ? 1 : 0.45}>
                {fuelH > 0.5 &&
                  (hasTime ? (
                    <rect x={x} y={base - fuelH} width={barW} height={fuelH} fill={SERIES[0].color} />
                  ) : (
                    <path d={topRounded(x, base - fuelH, barW, fuelH, 4)} fill={SERIES[0].color} />
                  ))}
                {hasTime && (
                  // Il segmento superiore cede 2px allo spazio di separazione: l'altezza totale resta esatta.
                  <path
                    d={topRounded(x, base - fuelH - timeH, barW, Math.max(0.5, timeH - (fuelH > 0.5 ? GAP : 0)), 4)}
                    fill={SERIES[1].color}
                  />
                )}
                {i % labelEvery === 0 && (
                  <text x={x + barW / 2} y={H - 6} textAnchor="middle" fontSize={10} fill="#78716c">
                    {b.label}
                  </text>
                )}
                {/* area di tocco più grande della barra */}
                <rect
                  x={PAD.left + i * slot}
                  y={PAD.top}
                  width={slot}
                  height={plotH}
                  fill="transparent"
                  onMouseEnter={() => setHover(i)}
                  onClick={() => setHover(hover === i ? null : i)}
                />
              </g>
            )
          })}
        </svg>
        {hb && (
          <div
            className="pointer-events-none absolute top-0 z-10 rounded-lg bg-stone-900 px-3 py-2 text-xs text-white shadow-lg"
            style={{ left: Math.min(Math.max(0, PAD.left + hover! * slot - 60), w - 150) }}
          >
            <p className="font-semibold">{hb.label}</p>
            <p>Carburante {fmtEur(hb.fuelCost)}</p>
            <p>Tempo {fmtEur(hb.timeCost)}</p>
            <p className="font-semibold">Totale {fmtEur(hb.total)}</p>
          </div>
        )}
      </div>
    </div>
  )
}
