// Servizi OpenStreetMap: negozi (Overpass), ricerca indirizzi (Nominatim), percorsi (OSRM).
// Dati © OpenStreetMap contributors, ODbL. Rispettare le policy d'uso: niente richieste ripetute.
import { z } from 'zod'
import { db, isFresh, markFetched, nowIso, type Store } from '../db'
import { haversineKm, tilesAround, type LatLon } from '../geo'

const OverpassElement = z.object({
  type: z.enum(['node', 'way', 'relation']),
  id: z.number(),
  lat: z.number().optional(),
  lon: z.number().optional(),
  center: z.object({ lat: z.number(), lon: z.number() }).optional(),
  tags: z.record(z.string(), z.string()).optional(),
})

export function osmStoreId(type: string, id: number | string) {
  return `osm:${type.toLowerCase()}/${id}`
}

export function addressFromTags(t: Record<string, string>) {
  const street = [t['addr:street'], t['addr:housenumber']].filter(Boolean).join(' ')
  return [street, t['addr:city']].filter(Boolean).join(', ')
}

/** Server Overpass pubblici: se il principale è sovraccarico si prova il successivo. */
const OVERPASS_SERVERS = [
  { url: 'https://overpass-api.de/api/interpreter', timeoutMs: 60_000 },
  { url: 'https://maps.mail.ru/osm/tools/overpass/api/interpreter', timeoutMs: 75_000 },
  { url: 'https://overpass.private.coffee/api/interpreter', timeoutMs: 40_000 },
]

async function overpass(query: string): Promise<{ elements?: unknown[] }> {
  let lastError = ''
  for (const server of OVERPASS_SERVERS) {
    try {
      const res = await fetch(server.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ data: query }),
        signal: AbortSignal.timeout(server.timeoutMs),
      })
      if (res.ok) return await res.json()
      lastError = `HTTP ${res.status}`
    } catch (e) {
      lastError = (e as Error).name === 'TimeoutError' ? 'tempo scaduto' : 'server non raggiungibile'
    }
  }
  throw new Error(`Elenco negozi non disponibile (${lastError}). Riprova più tardi.`)
}

interface StaticStore {
  i: string
  n: string
  b: string
  la: number
  lo: number
  a: string
}

/**
 * Supermercati dai dati preparati in pubblicazione (estratto OpenStreetMap settimanale, public/data/negozi).
 * Restituisce null se i dati non ci sono (es. in sviluppo): si usa allora Overpass.
 */
async function storesFromStaticData(center: LatLon, radiusKm: number): Promise<Store[] | null> {
  const base = `${import.meta.env.BASE_URL}data/negozi/`
  let meta: { tiles: string[]; tileDeg: number; generatedAt: string }
  try {
    const res = await fetch(`${base}meta.json`)
    if (!res.ok) return null
    meta = await res.json()
  } catch {
    return null
  }
  const available = new Set(meta.tiles)
  const keys = tilesAround(center, radiusKm, meta.tileDeg).filter((k) => available.has(k))
  const lists = await Promise.all(
    keys.map(async (k) => {
      const res = await fetch(`${base}t_${k}.json`)
      return res.ok ? ((await res.json()) as StaticStore[]) : []
    }),
  )
  return lists
    .flat()
    .filter((s) => haversineKm(center, { lat: s.la, lon: s.lo }) <= radiusKm)
    .map((s) => ({
      id: `osm:${s.i}`,
      name: s.n,
      brand: s.b,
      lat: s.la,
      lon: s.lo,
      address: s.a,
      fetchedAt: meta.generatedAt,
    }))
}

/** Supermercati entro il raggio, con cache locale di 7 giorni per zona. */
export async function fetchStoresAround(center: LatLon, radiusKm: number, force = false): Promise<number> {
  const key = `stores:${center.lat.toFixed(3)}:${center.lon.toFixed(3)}:${radiusKm}`
  if (!force && (await isFresh(key, 7 * 86400_000))) return 0
  const fromStatic = await storesFromStaticData(center, radiusKm)
  if (fromStatic) {
    await db.stores.bulkPut(fromStatic)
    await markFetched(key)
    return fromStatic.length
  }
  const r = Math.round(radiusKm * 1000)
  const around = `(around:${r},${center.lat},${center.lon})`
  const query = `[out:json][timeout:25];(nwr["shop"="supermarket"]${around};nwr["shop"="convenience"]["brand"]${around};);out center tags;`
  const json = await overpass(query)
  const elements = z.array(z.unknown()).parse(json.elements ?? [])
  const stores: Store[] = []
  for (const raw of elements) {
    const p = OverpassElement.safeParse(raw)
    if (!p.success) continue
    const el = p.data
    const lat = el.lat ?? el.center?.lat
    const lon = el.lon ?? el.center?.lon
    const tags = el.tags ?? {}
    if (lat == null || lon == null) continue
    const brand = tags.brand ?? ''
    stores.push({
      id: osmStoreId(el.type, el.id),
      name: tags.name ?? (brand || 'Supermercato'),
      brand,
      lat,
      lon,
      address: addressFromTags(tags),
      fetchedAt: nowIso(),
    })
  }
  await db.stores.bulkPut(stores)
  await markFetched(key)
  return stores.length
}

const NominatimResult = z.object({ lat: z.string(), lon: z.string(), display_name: z.string() })

/** Cerca comune, CAP o indirizzo in Italia (solo su richiesta esplicita, non durante la digitazione). */
export async function geocode(text: string): Promise<{ lat: number; lon: number; label: string }[]> {
  const params = new URLSearchParams({ q: text, format: 'jsonv2', countrycodes: 'it', limit: '5', 'accept-language': 'it' })
  const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`)
  if (!res.ok) throw new Error(`Ricerca indirizzo non disponibile (HTTP ${res.status})`)
  const parsed = z.array(NominatimResult).safeParse(await res.json())
  if (!parsed.success) return []
  return parsed.data.map((r) => ({ lat: Number(r.lat), lon: Number(r.lon), label: r.display_name }))
}

/** Percorso stradale indicativo (server dimostrativo OSRM: uso leggero, non garantito). */
export async function roadRoute(points: LatLon[]): Promise<{ km: number; minutes: number; line: [number, number][] }> {
  const coords = points.map((p) => `${p.lon.toFixed(6)},${p.lat.toFixed(6)}`).join(';')
  const res = await fetch(`https://router.project-osrm.org/route/v1/driving/${coords}?overview=simplified&geometries=geojson`)
  if (!res.ok) throw new Error(`Calcolo percorso non disponibile (HTTP ${res.status})`)
  const json = await res.json()
  const route = json.routes?.[0]
  if (json.code !== 'Ok' || !route) throw new Error('Percorso non trovato')
  return {
    km: route.distance / 1000,
    minutes: route.duration / 60,
    line: (route.geometry.coordinates as [number, number][]).map(([lon, lat]) => [lat, lon]),
  }
}
