// Open Prices (Open Food Facts): prezzi rilevati dalla community con foto di scontrini o cartellini.
// Licenza ODbL. Sono dati "segnalati", non prezzi ufficiali delle catene.
import { z } from 'zod'
import { db, isFresh, markFetched, nowIso, type PriceObservation, type Store } from '../db'
import { haversineKm, type LatLon } from '../geo'
import { osmStoreId } from './osm'

const Location = z.object({
  type: z.string().optional().nullable(),
  osm_id: z.number().optional().nullable(),
  osm_type: z.string().optional().nullable(),
  osm_name: z.string().optional().nullable(),
  osm_brand: z.string().optional().nullable(),
  osm_lat: z.number().optional().nullable(),
  osm_lon: z.number().optional().nullable(),
  osm_display_name: z.string().optional().nullable(),
  osm_address_city: z.string().optional().nullable(),
})

const PriceItem = z.object({
  id: z.number(),
  product_code: z.string().optional().nullable(),
  price: z.number(),
  currency: z.string(),
  date: z.string(),
  price_per: z.string().optional().nullable(),
  price_is_discounted: z.boolean().optional().nullable(),
  discount_type: z.string().optional().nullable(),
  location: Location.optional().nullable(),
  proof: z.object({ type: z.string().optional().nullable() }).optional().nullable(),
})

const DISCOUNT_LABEL: Record<string, string> = {
  QUANTITY: 'offerta a quantità (es. 3x2)',
  SALE: 'promozione',
  SEASONAL: 'offerta stagionale',
  LOYALTY_PROGRAM: 'con tessera fedeltà',
  EXPIRES_SOON: 'prodotto in scadenza',
  PICK_IT_YOURSELF: 'ritiro in negozio',
  SECOND_HAND: 'usato',
  OTHER: 'promozione',
}

/**
 * Scarica i prezzi Open Prices per i prodotti indicati nei negozi entro il raggio.
 * Cache 12 ore per prodotto. Restituisce il numero di prezzi salvati.
 */
export async function refreshOpenPrices(codes: string[], home: LatLon, radiusKm: number): Promise<number> {
  let saved = 0
  const todo: string[] = []
  for (const code of new Set(codes)) {
    if (!/^\d{8,14}$/.test(code)) continue // solo veri codici a barre
    if (!(await isFresh(`op:${code}`, 12 * 3600_000))) todo.push(code)
  }
  // Poche richieste alla volta per rispettare il servizio.
  for (let i = 0; i < todo.length; i += 3) {
    const results = await Promise.all(todo.slice(i, i + 3).map((c) => fetchForProduct(c, home, radiusKm)))
    saved += results.reduce((a, b) => a + b, 0)
  }
  return saved
}

async function fetchForProduct(code: string, home: LatLon, radiusKm: number): Promise<number> {
  const params = new URLSearchParams({ product_code: code, currency: 'EUR', size: '100', order_by: '-date' })
  const res = await fetch(`https://prices.openfoodfacts.org/api/v1/prices?${params}`)
  if (!res.ok) throw new Error(`Open Prices non disponibile (HTTP ${res.status})`)
  const json = await res.json()
  const items = z.array(z.unknown()).safeParse(json.items)
  if (!items.success) return 0
  const prices: PriceObservation[] = []
  const stores = new Map<string, Store>()
  for (const raw of items.data) {
    const p = PriceItem.safeParse(raw)
    if (!p.success) continue
    const it = p.data
    const loc = it.location
    if (it.currency !== 'EUR' || !loc?.osm_id || !loc.osm_type || loc.osm_lat == null || loc.osm_lon == null) continue
    if (it.price_per && it.price_per !== 'UNIT') continue // prezzi al kg non confrontabili con una confezione
    // Margine extra sul raggio: i negozi al limite restano utili per il confronto.
    if (haversineKm(home, { lat: loc.osm_lat, lon: loc.osm_lon }) > radiusKm * 1.5) continue
    const storeId = osmStoreId(loc.osm_type, loc.osm_id)
    stores.set(storeId, {
      id: storeId,
      name: loc.osm_name || loc.osm_brand || 'Negozio',
      brand: loc.osm_brand ?? '',
      lat: loc.osm_lat,
      lon: loc.osm_lon,
      address: loc.osm_address_city ?? '',
      fetchedAt: nowIso(),
    })
    prices.push({
      id: `op:${it.id}`,
      productCode: code,
      storeId,
      price: it.price,
      currency: 'EUR',
      observedAt: it.date.slice(0, 10),
      status: 'segnalato',
      source: 'openprices',
      isDiscounted: !!it.price_is_discounted,
      conditions: it.price_is_discounted ? (DISCOUNT_LABEL[it.discount_type ?? 'OTHER'] ?? 'promozione') : undefined,
      proofType: it.proof?.type ?? undefined,
    })
  }
  await db.transaction('rw', db.stores, db.prices, db.fetchLog, async () => {
    // Non sovrascrive i negozi già noti (es. da Overpass, con indirizzo più completo).
    for (const s of stores.values()) if (!(await db.stores.get(s.id))) await db.stores.put(s)
    await db.prices.bulkPut(prices)
    await markFetched(`op:${code}`)
  })
  return prices.length
}
