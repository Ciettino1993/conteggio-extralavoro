// Prezzi medi dei carburanti vicino all'utente (open data MIMIT generati da scripts/update-fuel.mjs).
import { haversineKm, tilesAround, type LatLon } from './geo'
import { daysBetween } from './units'

export type FuelKind = 'benzina' | 'gasolio'
type PriceKey = 'B' | 'Bs' | 'G' | 'Gs'

export interface FuelStation {
  i: number
  la: number
  lo: number
  b: string
  n: string
  a: string
  c: string
  p: Partial<Record<PriceKey, [number, string]>>
}

export interface FuelMeta {
  extraction: string | null
  generatedAt: string
  tileDeg: number
  tiles: string[]
  stations: number
  source: string
  sourceUrl: string
  license: string
}

export interface StationNear extends FuelStation {
  distanceKm: number
}

export interface FuelStats {
  count: number
  avg: number | null
  min: number | null
  max: number | null
  /** Data più vecchia tra i prezzi usati. */
  oldest: string | null
}

export const FUEL_LABEL: Record<FuelKind, string> = { benzina: 'Benzina', gasolio: 'Diesel (gasolio)' }

/** Prezzi comunicati da più di questi giorni non entrano nella media. */
export const FUEL_MAX_AGE_DAYS = 30

const dataUrl = (file: string) => `${import.meta.env.BASE_URL}data/carburanti/${file}`

export async function loadFuelMeta(): Promise<FuelMeta | null> {
  const res = await fetch(dataUrl('meta.json'))
  if (!res.ok) return null
  try {
    return (await res.json()) as FuelMeta
  } catch {
    return null // es. server che restituisce index.html al posto del file mancante
  }
}

export async function loadStationsAround(meta: FuelMeta, center: LatLon, radiusKm: number): Promise<StationNear[]> {
  const available = new Set(meta.tiles)
  const keys = tilesAround(center, radiusKm, meta.tileDeg).filter((k) => available.has(k))
  const tiles = await Promise.all(
    keys.map(async (k) => {
      const res = await fetch(dataUrl(`t_${k}.json`))
      return res.ok ? ((await res.json()) as FuelStation[]) : []
    }),
  )
  return filterWithin(tiles.flat(), center, radiusKm)
}

export function filterWithin(stations: FuelStation[], center: LatLon, radiusKm: number): StationNear[] {
  return stations
    .map((s) => ({ ...s, distanceKm: haversineKm(center, { lat: s.la, lon: s.lo }) }))
    .filter((s) => s.distanceKm <= radiusKm)
    .sort((a, b) => a.distanceKm - b.distanceKm)
}

export function priceKey(kind: FuelKind, self: boolean): PriceKey {
  return ((kind === 'benzina' ? 'B' : 'G') + (self ? '' : 's')) as PriceKey
}

/** Statistiche dei prezzi recenti (rispetto alla data di estrazione) per un carburante. */
export function fuelStats(
  stations: FuelStation[],
  kind: FuelKind,
  opts: { refDate: string; self?: boolean; maxAgeDays?: number },
): FuelStats {
  const key = priceKey(kind, opts.self ?? true)
  const maxAge = opts.maxAgeDays ?? FUEL_MAX_AGE_DAYS
  const values: number[] = []
  let oldest: string | null = null
  for (const s of stations) {
    const p = s.p[key]
    if (!p || daysBetween(p[1], opts.refDate) > maxAge) continue
    values.push(p[0])
    if (!oldest || p[1] < oldest) oldest = p[1]
  }
  if (!values.length) return { count: 0, avg: null, min: null, max: null, oldest: null }
  const avg = values.reduce((a, b) => a + b, 0) / values.length
  return {
    count: values.length,
    avg: Math.round(avg * 1000) / 1000,
    min: Math.min(...values),
    max: Math.max(...values),
    oldest,
  }
}

/** Costo del carburante per km percorso. */
export function fuelCostPerKm(pricePerLitre: number, kmPerLitre: number): number {
  if (!(pricePerLitre > 0) || !(kmPerLitre > 0)) return 0
  return pricePerLitre / kmPerLitre
}
