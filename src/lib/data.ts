// Operazioni applicative su liste, sessioni di spesa e prezzi (database locale).
import { db, nowIso, uid, type ListItem, type PriceObservation, type Product, type SessionItem } from './db'
import { formatScale, parseQuantity, todayIso } from './units'
import type { CompareItem, CompareStore, PriceObs } from './compare'
import { haversineKm, type LatLon } from './geo'
import type { Settings } from './settings'

// ---------- Liste ----------

export async function createList(name: string) {
  const id = uid()
  const now = nowIso()
  await db.lists.add({ id, name: name.trim() || 'Nuova lista', createdAt: now, updatedAt: now })
  return id
}

export async function renameList(id: string, name: string) {
  await db.lists.update(id, { name: name.trim() || 'Lista', updatedAt: nowIso() })
}

export async function deleteList(id: string) {
  await db.transaction('rw', db.lists, db.listItems, async () => {
    await db.listItems.where('listId').equals(id).delete()
    await db.lists.delete(id)
  })
}

async function touchList(listId: string) {
  await db.lists.update(listId, { updatedAt: nowIso() })
}

export async function saveProduct(p: Product) {
  const existing = await db.products.get(p.code)
  if (!existing || existing.source === p.source) await db.products.put({ ...p, updatedAt: nowIso() })
}

export async function addProductToList(listId: string, product: Product, quantity = 1) {
  await saveProduct(product)
  const existing = await db.listItems.where({ listId }).filter((i) => i.productCode === product.code).first()
  if (existing) {
    await db.listItems.update(existing.id, { quantity: existing.quantity + quantity, isPurchased: 0 })
  } else {
    await db.listItems.add({
      id: uid(),
      listId,
      productCode: product.code,
      description: [product.name, product.brand].filter(Boolean).join(' - '),
      quantity,
      isPurchased: 0,
      alternatives: [],
      createdAt: nowIso(),
    })
  }
  await touchList(listId)
}

export async function addTextToList(listId: string, text: string) {
  if (!text.trim()) return
  await db.listItems.add({
    id: uid(),
    listId,
    description: text.trim(),
    quantity: 1,
    isPurchased: 0,
    alternatives: [],
    createdAt: nowIso(),
  })
  await touchList(listId)
}

export async function updateListItem(id: string, patch: Partial<ListItem>) {
  await db.listItems.update(id, patch)
}

export async function linkProduct(itemId: string, product: Product) {
  await saveProduct(product)
  await db.listItems.update(itemId, {
    productCode: product.code,
    description: [product.name, product.brand].filter(Boolean).join(' - '),
  })
}

export async function addAlternative(itemId: string, product: Product) {
  await saveProduct(product)
  const item = await db.listItems.get(itemId)
  if (!item || item.productCode === product.code || item.alternatives.includes(product.code)) return
  await db.listItems.update(itemId, { alternatives: [...item.alternatives, product.code] })
}

export async function removeAlternative(itemId: string, code: string) {
  const item = await db.listItems.get(itemId)
  if (item) await db.listItems.update(itemId, { alternatives: item.alternatives.filter((c) => c !== code) })
}

/** Crea un prodotto inserito dall'utente (es. codice a barre sconosciuto): resta "da verificare". */
export function userProduct(name: string, code?: string, brand = '', quantity = ''): Product {
  return {
    code: code || `local:${uid()}`,
    name: name.trim(),
    brand: brand.trim(),
    quantity: quantity.trim(),
    source: 'utente',
    updatedAt: nowIso(),
  }
}

// ---------- Prezzi ----------

/** Prezzo rilevato dall'utente (a scaffale): resta "segnalato", separato dai prezzi verificati. */
export async function reportPrice(input: {
  id?: string
  productCode: string
  storeId: string
  price: number
  isDiscounted?: boolean
  conditions?: string
  observedAt?: string
  proofType?: 'SCAFFALE' | 'SCONTRINO'
}) {
  const obs: PriceObservation = {
    id: input.id ?? `user:${uid()}`,
    productCode: input.productCode,
    storeId: input.storeId,
    price: Math.round(input.price * 100) / 100,
    currency: 'EUR',
    observedAt: input.observedAt ?? todayIso(),
    status: 'segnalato',
    source: 'utente',
    isDiscounted: input.isDiscounted,
    conditions: input.conditions,
    proofType: input.proofType ?? 'SCAFFALE',
  }
  await db.prices.put(obs)
  return obs
}

export async function latestPriceAt(productCode: string, storeId: string, maxAgeDays: number) {
  const list = await db.prices.where('[productCode+storeId]').equals([productCode, storeId]).toArray()
  const today = todayIso()
  const valid = list
    .filter((p) => p.status !== 'rifiutato')
    .filter((p) => (Date.parse(today) - Date.parse(p.observedAt)) / 86400000 <= maxAgeDays)
    .sort((a, b) => (a.observedAt < b.observedAt ? 1 : -1))
  return valid[0] ?? null
}

// ---------- Confronto ----------

/** Prepara le righe della lista per il motore di confronto (solo quelle con prodotto associato). */
export async function compareItemsForList(listId: string) {
  const items = await db.listItems.where({ listId }).filter((i) => !i.isPurchased).toArray()
  const codes = items.flatMap((i) => (i.productCode ? [i.productCode, ...i.alternatives] : []))
  const products = new Map((await db.products.bulkGet(codes)).filter(Boolean).map((p) => [p!.code, p!]))
  const compareItems: CompareItem[] = []
  const unlinked: ListItem[] = []
  for (const it of items) {
    if (!it.productCode) {
      unlinked.push(it)
      continue
    }
    const primaryQty = parseQuantity(products.get(it.productCode)?.quantity)
    compareItems.push({
      id: it.id,
      name: it.description,
      quantity: it.quantity,
      candidates: [
        { code: it.productCode, match: 'esatto' },
        ...it.alternatives.map((code) => ({
          code,
          match: 'equivalente' as const,
          scale: formatScale(primaryQty, parseQuantity(products.get(code)?.quantity)),
        })),
      ],
    })
  }
  return { compareItems, unlinked, codes }
}

export async function storesWithin(center: LatLon, radiusKm: number, settings: Settings): Promise<CompareStore[]> {
  const excluded = new Set(settings.excludedBrands.map((b) => b.toLowerCase()))
  const all = await db.stores.toArray()
  return all
    .filter((s) => haversineKm(center, s) <= radiusKm)
    .filter((s) => !excluded.has(s.brand.toLowerCase()))
    .map((s) => ({ id: s.id, name: s.name, brand: s.brand, lat: s.lat, lon: s.lon }))
}

export async function pricesFor(codes: string[]): Promise<PriceObs[]> {
  if (!codes.length) return []
  return db.prices.where('productCode').anyOf(codes).toArray()
}

// ---------- Sessione di spesa ----------

export async function startSession(input: { listId?: string; storeId?: string; storeName: string }) {
  const id = uid()
  await db.sessions.add({ id, ...input, startedAt: nowIso() })
  return id
}

export async function activeSession() {
  return db.sessions.orderBy('startedAt').filter((s) => !s.endedAt).last()
}

export async function endSession(id: string, paidTotal?: number) {
  await db.sessions.update(id, { endedAt: nowIso(), paidTotal })
}

/**
 * Registra un prodotto scansionato: aumenta la quantità se già presente,
 * altrimenti lo aggiunge con il prezzo atteso; se è in lista lo segna come preso.
 */
export async function addScanToSession(
  sessionId: string,
  product: Product,
  maxPriceAgeDays: number,
): Promise<{ item: SessionItem; inList: boolean; increased: boolean }> {
  await saveProduct(product)
  const session = await db.sessions.get(sessionId)
  if (!session) throw new Error('Sessione non trovata')
  const existing = await db.sessionItems
    .where({ sessionId })
    .filter((i) => i.productCode === product.code)
    .first()
  if (existing) {
    await db.sessionItems.update(existing.id, { quantity: existing.quantity + 1 })
    return { item: { ...existing, quantity: existing.quantity + 1 }, inList: !!existing.listItemId, increased: true }
  }
  let listItem: ListItem | undefined
  if (session.listId) {
    listItem = await db.listItems
      .where({ listId: session.listId })
      .filter((i) => i.productCode === product.code || i.alternatives.includes(product.code))
      .first()
    if (listItem) await db.listItems.update(listItem.id, { isPurchased: 1 })
  }
  const expected = session.storeId ? await latestPriceAt(product.code, session.storeId, maxPriceAgeDays) : null
  const item: SessionItem = {
    id: uid(),
    sessionId,
    productCode: product.code,
    name: [product.name, product.brand].filter(Boolean).join(' - '),
    quantity: listItem?.quantity ?? 1,
    expectedPrice: expected?.price,
    listItemId: listItem?.id,
    scannedAt: nowIso(),
  }
  await db.sessionItems.add(item)
  return { item, inList: !!listItem, increased: false }
}

export async function setShelfPrice(itemId: string, price: number | undefined) {
  const item = await db.sessionItems.get(itemId)
  if (!item) return
  await db.sessionItems.update(itemId, { shelfPrice: price })
  const session = await db.sessions.get(item.sessionId)
  if (price != null && item.productCode && session?.storeId) {
    // Un solo rilievo per articolo della sessione: id stabile, aggiornato se l'utente corregge.
    await reportPrice({ id: `user:${itemId}`, productCode: item.productCode, storeId: session.storeId, price })
  }
}

export async function removeSessionItem(itemId: string) {
  const item = await db.sessionItems.get(itemId)
  if (!item) return
  if (item.listItemId) await db.listItems.update(item.listItemId, { isPurchased: 0 })
  await db.sessionItems.delete(itemId)
}

export function sessionTotals(items: SessionItem[]) {
  let estimated = 0
  let expected = 0
  let withoutPrice = 0
  for (const it of items) {
    const p = it.shelfPrice ?? it.expectedPrice
    if (p == null) withoutPrice++
    else estimated += p * it.quantity
    if (it.expectedPrice != null) expected += it.expectedPrice * it.quantity
  }
  return { estimated: Math.round(estimated * 100) / 100, expected: Math.round(expected * 100) / 100, withoutPrice }
}
