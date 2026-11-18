// Database locale (IndexedDB tramite Dexie): funziona offline e senza account.
// Gli id sono UUID generati sul dispositivo, così in futuro la sincronizzazione con Supabase
// potrà avvenire senza duplicati (vedi docs/supabase.md).
import Dexie, { type EntityTable } from 'dexie'
import type { PriceSource, PriceStatus } from './compare'

export interface Product {
  /** Codice a barre EAN/UPC, oppure "local:<uuid>" per prodotti senza codice. */
  code: string
  name: string
  brand: string
  quantity: string
  imageUrl?: string
  source: 'openfoodfacts' | 'utente'
  updatedAt: string
}

export interface ShoppingList {
  id: string
  name: string
  createdAt: string
  updatedAt: string
}

export interface ListItem {
  id: string
  listId: string
  productCode?: string
  description: string
  quantity: number
  notes?: string
  isPurchased: 0 | 1
  /** Prodotti equivalenti accettati al posto di quello principale. */
  alternatives: string[]
  createdAt: string
}

export interface Store {
  /** "osm:node/123" per i negozi OpenStreetMap, "manual:<uuid>" per quelli inseriti a mano. */
  id: string
  name: string
  brand: string
  lat: number
  lon: number
  address: string
  fetchedAt: string
}

export interface PriceObservation {
  id: string
  productCode: string
  storeId: string
  price: number
  currency: 'EUR'
  observedAt: string
  status: PriceStatus
  source: PriceSource
  isDiscounted?: boolean
  conditions?: string
  proofType?: string
}

export interface ShoppingSession {
  id: string
  listId?: string
  storeId?: string
  storeName: string
  startedAt: string
  endedAt?: string
  paidTotal?: number
}

export interface SessionItem {
  id: string
  sessionId: string
  productCode?: string
  name: string
  quantity: number
  expectedPrice?: number
  shelfPrice?: number
  listItemId?: string
  scannedAt: string
}

export interface FetchLog {
  key: string
  fetchedAt: string
}

export interface SettingRow {
  key: string
  value: unknown
}

/** Abbinamento confermato "testo scontrino in una catena" -> prodotto: la volta dopo è automatico. */
export interface ReceiptAlias {
  key: string
  productCode: string
  updatedAt: string
}

export const db = new Dexie('spesasmart') as Dexie & {
  products: EntityTable<Product, 'code'>
  lists: EntityTable<ShoppingList, 'id'>
  listItems: EntityTable<ListItem, 'id'>
  stores: EntityTable<Store, 'id'>
  prices: EntityTable<PriceObservation, 'id'>
  sessions: EntityTable<ShoppingSession, 'id'>
  sessionItems: EntityTable<SessionItem, 'id'>
  fetchLog: EntityTable<FetchLog, 'key'>
  settings: EntityTable<SettingRow, 'key'>
  receiptAliases: EntityTable<ReceiptAlias, 'key'>
}

db.version(1).stores({
  products: 'code, name, updatedAt',
  lists: 'id, updatedAt',
  listItems: 'id, listId, productCode, *alternatives',
  stores: 'id, brand',
  prices: 'id, productCode, storeId, [productCode+storeId], observedAt',
  sessions: 'id, startedAt, endedAt',
  sessionItems: 'id, sessionId, productCode',
  fetchLog: 'key',
  settings: 'key',
})
db.version(2).stores({ receiptAliases: 'key' })

/** Riga delle impostazioni con la chiave API: mai esportata, mai inviata altrove che al servizio scelto. */
export const API_KEY_ROW = 'anthropicApiKey'

export async function getApiKey(): Promise<string | null> {
  const v = (await db.settings.get(API_KEY_ROW))?.value
  return typeof v === 'string' && v ? v : null
}

export async function setApiKey(key: string | null) {
  if (key) await db.settings.put({ key: API_KEY_ROW, value: key.trim() })
  else await db.settings.delete(API_KEY_ROW)
}

export const uid = () => crypto.randomUUID()
export const nowIso = () => new Date().toISOString()

export async function isFresh(key: string, maxAgeMs: number): Promise<boolean> {
  const row = await db.fetchLog.get(key)
  return !!row && Date.now() - Date.parse(row.fetchedAt) < maxAgeMs
}

export async function markFetched(key: string) {
  await db.fetchLog.put({ key, fetchedAt: nowIso() })
}

/** Esporta tutti i dati locali (diritto di portabilità). */
export async function exportAll() {
  const out: Record<string, unknown[]> = {}
  for (const table of db.tables) out[table.name] = await table.toArray()
  out.settings = (out.settings as SettingRow[]).filter((r) => r.key !== API_KEY_ROW)
  return { app: 'SpesaSmart', exportedAt: nowIso(), data: out }
}

export async function deleteAll() {
  await db.transaction('rw', db.tables, async () => {
    for (const table of db.tables) await table.clear()
  })
}
