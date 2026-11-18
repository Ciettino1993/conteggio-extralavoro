// Abbinamento delle righe di scontrino ai prodotti e del punto vendita ai negozi noti.
// Funzioni pure (testate in receiptMatch.test.ts).
import type { Product, Store } from './db'
import { haversineKm, type LatLon } from './geo'

export function normalize(text: string | null | undefined): string {
  return (text ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

const STOP = new Set(['di', 'da', 'del', 'della', 'con', 'e', 'al', 'alla', 'il', 'la', 'le', 'in', 'per', 'g', 'gr', 'kg', 'ml', 'l', 'lt', 'cl', 'pz'])

export function tokens(text: string): Set<string> {
  return new Set(normalize(text).split(' ').filter((t) => t.length > 1 && !STOP.has(t)))
}

const LEGAL_FORMS = new Set(['spa', 'srl', 'snc', 'scarl', 'soc', 'supermercati', 'supermercato', 'gruppo', 'societa'])

/** Insegna ridotta alla parola principale: "ESSELUNGA S.P.A." e "Esselunga" diventano "esselunga". */
export function chainKey(chain: string | null | undefined): string {
  return normalize(chain).split(' ').find((t) => t.length > 1 && !LEGAL_FORMS.has(t)) ?? ''
}

/** Chiave per ricordare l'abbinamento "testo scontrino in quella catena" -> prodotto. */
export function aliasKey(chain: string | null | undefined, receiptText: string): string {
  return `${chainKey(chain)}|${normalize(receiptText)}`
}

/**
 * Somiglianza tra la descrizione letta e un prodotto (0-1).
 * Conta le parole in comune, con un prefisso di 4 lettere per le abbreviazioni ("spagh" ~ "spaghetti").
 */
export function similarity(description: string, product: Pick<Product, 'name' | 'brand' | 'quantity'>): number {
  const a = tokens(description)
  const b = tokens(`${product.name} ${product.brand} ${product.quantity}`)
  if (!a.size || !b.size) return 0
  let hits = 0
  for (const t of a) {
    if (b.has(t)) hits++
    else if (t.length >= 4 && [...b].some((u) => u.length >= 4 && (u.startsWith(t.slice(0, 4)) || t.startsWith(u.slice(0, 4))))) hits += 0.7
  }
  // Le parole extra del prodotto (es. il formato) penalizzano poco; quelle della descrizione contano tutte.
  return Math.min(1, hits / Math.max(a.size, Math.ceil(b.size * 0.6)))
}

export interface MatchSuggestion {
  product: Product
  reason: 'appreso' | 'simile'
  score: number
}

export function suggestProduct(
  description: string,
  learnedCode: string | undefined,
  candidates: Product[],
  minScore = 0.55,
): MatchSuggestion | null {
  if (learnedCode) {
    const p = candidates.find((c) => c.code === learnedCode)
    if (p) return { product: p, reason: 'appreso', score: 1 }
  }
  let best: MatchSuggestion | null = null
  for (const p of candidates) {
    const score = similarity(description, p)
    if (score >= minScore && (!best || score > best.score)) best = { product: p, reason: 'simile', score }
  }
  return best
}

/** Punto vendita più probabile: insegna compatibile, indirizzo simile, poi il più vicino a casa. */
export function suggestStore(
  receiptStore: { catena: string | null; indirizzo: string | null; citta: string | null },
  stores: Store[],
  home: LatLon | null,
): Store | null {
  const chain = tokens(receiptStore.catena ?? '')
  const street = tokens(`${receiptStore.indirizzo ?? ''} ${receiptStore.citta ?? ''}`)
  let best: { store: Store; score: number } | null = null
  for (const s of stores) {
    const name = tokens(`${s.brand} ${s.name}`)
    const chainHit = chain.size > 0 && [...chain].some((t) => name.has(t))
    if (chain.size > 0 && !chainHit) continue
    const addr = tokens(s.address)
    const streetHits = [...street].filter((t) => addr.has(t)).length
    const distancePenalty = home ? haversineKm(home, s) / 100 : 0
    const score = (chainHit ? 1 : 0) + streetHits - distancePenalty
    if (!best || score > best.score) best = { store: s, score }
  }
  return best?.store ?? null
}
