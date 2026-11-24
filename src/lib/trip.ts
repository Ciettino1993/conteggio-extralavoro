// Calcoli del viaggio: distanza da GPS, costi, scelta dei km e resoconti. Funzioni pure (trip.test.ts).
import { haversineKm, type LatLon } from './geo'
import type { KmSource, Trip } from './db'

// ---------- Distanza dal GPS ----------

export interface Fix extends LatLon {
  /** Precisione in metri. */
  acc: number
  /** Timestamp in millisecondi. */
  t: number
}

export interface GpsState {
  km: number
  last: Fix | null
  lastSeen: number | null
  /** Secondi senza posizioni utili (app in secondo piano, segnale perso). */
  gapSeconds: number
  track: [number, number][]
  fixes: number
}

export const EMPTY_GPS: GpsState = { km: 0, last: null, lastSeen: null, gapSeconds: 0, track: [], fixes: 0 }

const MAX_ACCURACY_M = 50
const MIN_STEP_M = 15
const MAX_SPEED_MS = 70 // 252 km/h: oltre è un errore del GPS
const GAP_S = 60
const MAX_TRACK_POINTS = 1500

/**
 * Aggiunge una posizione al percorso. Scarta le posizioni imprecise, i salti impossibili e il
 * "tremolio" da fermi (spostamenti più piccoli della precisione).
 */
export function addFix(state: GpsState, fix: Fix): GpsState {
  if (!(fix.acc <= MAX_ACCURACY_M)) return state
  const seenGap = state.lastSeen != null ? (fix.t - state.lastSeen) / 1000 : 0
  const gapSeconds = state.gapSeconds + (seenGap > GAP_S ? seenGap : 0)
  if (!state.last) {
    return { ...state, last: fix, lastSeen: fix.t, gapSeconds, track: [[fix.lat, fix.lon]], fixes: state.fixes + 1 }
  }
  const meters = haversineKm(state.last, fix) * 1000
  const dt = Math.max(0.001, (fix.t - state.last.t) / 1000)
  if (meters / dt > MAX_SPEED_MS) return { ...state, lastSeen: fix.t, gapSeconds }
  if (meters < Math.max(MIN_STEP_M, fix.acc)) return { ...state, lastSeen: fix.t, gapSeconds, fixes: state.fixes + 1 }
  const track = state.track.length < MAX_TRACK_POINTS ? [...state.track, [fix.lat, fix.lon] as [number, number]] : state.track
  return { km: state.km + meters / 1000, last: fix, lastSeen: fix.t, gapSeconds, track, fixes: state.fixes + 1 }
}

// ---------- Costi ----------

export interface CostInput {
  km: number
  minutes: number
  pricePerLitre: number | null
  kmPerLitre: number
  hourlyWage: number
  countTime: boolean
}

const round2 = (v: number) => Math.round(v * 100) / 100

export function tripCosts(i: CostInput) {
  const litres = i.kmPerLitre > 0 ? i.km / i.kmPerLitre : 0
  const fuelCost = i.pricePerLitre ? round2(litres * i.pricePerLitre) : 0
  const timeCost = i.countTime ? round2((i.minutes / 60) * i.hourlyWage) : 0
  return { litres, fuelCost, timeCost, total: round2(fuelCost + timeCost) }
}

/**
 * Km proposti all'arrivo: quelli del GPS, salvo che il segnale sia mancato a lungo e il percorso
 * stradale tra partenza e arrivo sia chiaramente più lungo (il GPS ha perso dei tratti).
 */
export function suggestKmSource(gpsKm: number, roadKm: number | null, gapSeconds: number, durationSeconds: number): KmSource {
  if (roadKm == null) return 'gps'
  const manyGaps = gapSeconds > Math.max(120, durationSeconds * 0.2)
  return manyGaps && gpsKm < roadKm * 0.85 ? 'strada' : 'gps'
}

// ---------- Resoconto ----------

export type Period = 'settimana' | 'mese' | 'anno' | 'tutto'

export interface Bucket {
  key: string
  label: string
  fuelCost: number
  timeCost: number
  total: number
  km: number
  minutes: number
  trips: number
}

const pad = (n: number) => String(n).padStart(2, '0')
export const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const monthKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`

/** Intervallo [inizio, fine) del periodo che contiene `ref`, spostato di `offset` periodi. */
export function periodRange(period: Period, ref: Date, offset = 0): { from: Date; to: Date } | null {
  if (period === 'tutto') return null
  if (period === 'settimana') {
    const d = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate())
    const monday = new Date(d)
    monday.setDate(d.getDate() - ((d.getDay() + 6) % 7) + offset * 7)
    const to = new Date(monday)
    to.setDate(monday.getDate() + 7)
    return { from: monday, to }
  }
  if (period === 'mese') {
    return { from: new Date(ref.getFullYear(), ref.getMonth() + offset, 1), to: new Date(ref.getFullYear(), ref.getMonth() + offset + 1, 1) }
  }
  return { from: new Date(ref.getFullYear() + offset, 0, 1), to: new Date(ref.getFullYear() + offset + 1, 0, 1) }
}

const MONTHS = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic']
const WEEKDAYS = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab']

/**
 * Raggruppa i viaggi: per giorno (settimana e mese, con tutti i giorni dell'intervallo) oppure per
 * mese (anno e tutto).
 */
export function aggregate<T extends Pick<Trip, 'startedAt' | 'fuelCost' | 'timeCost' | 'total' | 'km' | 'minutes'>>(
  trips: T[],
  period: Period,
  range: { from: Date; to: Date } | null,
) {
  const inRange = trips.filter((t) => {
    const d = new Date(t.startedAt)
    return !range || (d >= range.from && d < range.to)
  })
  const byDay = period === 'settimana' || period === 'mese'
  const buckets = new Map<string, Bucket>()
  const empty = (key: string, label: string): Bucket => ({ key, label, fuelCost: 0, timeCost: 0, total: 0, km: 0, minutes: 0, trips: 0 })

  if (range && byDay) {
    for (const d = new Date(range.from); d < range.to; d.setDate(d.getDate() + 1)) {
      const label = period === 'settimana' ? `${WEEKDAYS[d.getDay()]} ${d.getDate()}` : String(d.getDate())
      buckets.set(dayKey(d), empty(dayKey(d), label))
    }
  } else if (range) {
    for (let m = 0; m < 12; m++) {
      const d = new Date(range.from.getFullYear(), m, 1)
      buckets.set(monthKey(d), empty(monthKey(d), MONTHS[m]))
    }
  }
  for (const t of inRange) {
    const d = new Date(t.startedAt)
    const key = byDay ? dayKey(d) : monthKey(d)
    if (!buckets.has(key)) buckets.set(key, empty(key, `${MONTHS[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`))
    const b = buckets.get(key)!
    b.fuelCost = round2(b.fuelCost + t.fuelCost)
    b.timeCost = round2(b.timeCost + t.timeCost)
    b.total = round2(b.total + t.total)
    b.km += t.km
    b.minutes += t.minutes
    b.trips++
  }
  const list = [...buckets.values()].sort((a, b) => (a.key < b.key ? -1 : 1))
  const totals = list.reduce(
    (s, b) => ({
      fuelCost: round2(s.fuelCost + b.fuelCost),
      timeCost: round2(s.timeCost + b.timeCost),
      total: round2(s.total + b.total),
      km: s.km + b.km,
      minutes: s.minutes + b.minutes,
      trips: s.trips + b.trips,
    }),
    { fuelCost: 0, timeCost: 0, total: 0, km: 0, minutes: 0, trips: 0 },
  )
  return { buckets: list, totals, trips: inRange }
}

// ---------- Formati ----------

export function fmtDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds))
  return `${Math.floor(s / 3600)}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`
}

export function fmtMinutes(minutes: number): string {
  const m = Math.round(minutes)
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${pad(m % 60)} min`
}

/** CSV con separatore ";" e virgola decimale, apribile direttamente in Excel in italiano. */
export function tripsToCsv(trips: Trip[]): string {
  const num = (v: number | null, d = 2) => (v == null ? '' : v.toFixed(d).replace('.', ','))
  const esc = (s: string) => `"${s.replace(/"/g, '""')}"`
  const head = ['Data', 'Partenza', 'Arrivo', 'Minuti', 'Km', 'Fonte km', 'Carburante', 'Prezzo €/l', 'Km/l', 'Costo carburante €', 'Paga €/h', 'Costo tempo €', 'Totale €', 'Note']
  const rows = trips.map((t) => {
    const s = new Date(t.startedAt)
    const e = new Date(t.endedAt)
    const hm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`
    return [
      dayKey(s),
      hm(s),
      hm(e),
      String(Math.round(t.minutes)),
      num(t.km, 1),
      t.kmSource,
      t.fuelType,
      num(t.pricePerLitre, 3),
      num(t.kmPerLitre, 1),
      num(t.fuelCost),
      num(t.hourlyWage),
      num(t.timeCost),
      num(t.total),
      esc(t.note),
    ].join(';')
  })
  return [head.join(';'), ...rows].join('\r\n')
}
