// Motore di confronto: costo della lista per negozio e piano multi-negozio con costi di spostamento.
// Funzioni pure, senza accesso a rete o database (testate in compare.test.ts).
import { combinations, haversineKm, shortestTour, type LatLon } from './geo'
import { daysBetween } from './units'

export type PriceStatus = 'verificato' | 'segnalato' | 'rifiutato'
export type PriceSource = 'openprices' | 'utente' | 'ufficiale'
export type MatchType = 'esatto' | 'equivalente'

export interface PriceObs {
  productCode: string
  storeId: string
  price: number
  observedAt: string // AAAA-MM-GG
  status: PriceStatus
  source: PriceSource
  isDiscounted?: boolean
  conditions?: string
}

export interface CompareCandidate {
  code: string
  match: MatchType
  /** Fattore per riportare il prezzo al formato del prodotto principale (null = non confrontabile). */
  scale?: number | null
}

export interface CompareItem {
  id: string
  name: string
  quantity: number
  candidates: CompareCandidate[]
}

export interface CompareStore extends LatLon {
  id: string
  name: string
  brand?: string
}

export interface CompareOptions {
  home: LatLon
  today: string
  maxStores: number
  /** € per km (carburante). */
  costPerKm: number
  /** € per minuto di viaggio (valore del tempo, facoltativo). */
  costPerMinute: number
  avgSpeedKmh: number
  /** Moltiplicatore linea d'aria -> strada. */
  roadFactor: number
  /** Penalità fissa per ogni negozio oltre il primo. */
  extraStopPenalty: number
  /** Risparmio minimo per giustificare una fermata in più. */
  minSavingForExtraStop: number
  maxPriceAgeDays: number
  maxCandidates?: number
}

export interface Line {
  itemId: string
  itemName: string
  storeId: string
  code: string
  match: MatchType
  /** Prezzo per confezione (riportato al formato principale se equivalente). */
  unitPrice: number
  cost: number
  observedAt: string
  status: PriceStatus
  source: PriceSource
  isDiscounted: boolean
  conditions?: string
  scaled: boolean
  formatUnknown: boolean
}

export interface StoreQuote {
  store: CompareStore
  lines: Line[]
  missing: { itemId: string; itemName: string }[]
  expired: number
  total: number
  coverage: number
  oneWayKm: number
}

export interface Plan {
  stores: CompareStore[]
  lines: Line[]
  missing: { itemId: string; itemName: string }[]
  coverage: number
  productCost: number
  travelKm: number
  travelMinutes: number
  travelCost: number
  penalty: number
  total: number
}

/** Ultimo prezzo valido (non rifiutato e non scaduto) per prodotto e negozio. */
export function latestPrices(prices: PriceObs[], opts: Pick<CompareOptions, 'today' | 'maxPriceAgeDays'>) {
  const valid = new Map<string, PriceObs>()
  const expired = new Map<string, PriceObs>()
  for (const p of prices) {
    if (p.status === 'rifiutato' || !(p.price >= 0)) continue
    const key = `${p.productCode}|${p.storeId}`
    const isExpired = daysBetween(p.observedAt, opts.today) > opts.maxPriceAgeDays
    const target = isExpired ? expired : valid
    const prev = target.get(key)
    if (!prev || prev.observedAt < p.observedAt) target.set(key, p)
  }
  return { valid, expired }
}

/** Costo della lista in ciascun negozio, con copertura, mancanti e prezzi scaduti. */
export function quoteStores(
  items: CompareItem[],
  stores: CompareStore[],
  prices: PriceObs[],
  opts: CompareOptions,
): StoreQuote[] {
  const { valid, expired } = latestPrices(prices, opts)
  return stores.map((store) => {
    const lines: Line[] = []
    const missing: StoreQuote['missing'] = []
    let expiredCount = 0
    for (const item of items) {
      let best: Line | null = null
      let hasExpired = false
      for (const cand of item.candidates) {
        if (cand.scale === null) continue // formati non confrontabili
        const key = `${cand.code}|${store.id}`
        const p = valid.get(key)
        if (!p) {
          if (expired.has(key)) hasExpired = true
          continue
        }
        const scale = cand.match === 'equivalente' && typeof cand.scale === 'number' ? cand.scale : 1
        const unitPrice = p.price * scale
        const line: Line = {
          itemId: item.id,
          itemName: item.name,
          storeId: store.id,
          code: cand.code,
          match: cand.match,
          unitPrice,
          cost: unitPrice * item.quantity,
          observedAt: p.observedAt,
          status: p.status,
          source: p.source,
          isDiscounted: !!p.isDiscounted,
          conditions: p.conditions,
          scaled: scale !== 1,
          formatUnknown: cand.match === 'equivalente' && cand.scale === undefined,
        }
        // A parità di prezzo preferisce la corrispondenza esatta.
        if (!best || line.cost < best.cost - 1e-9 || (Math.abs(line.cost - best.cost) < 1e-9 && line.match === 'esatto')) {
          best = line
        }
      }
      if (best) lines.push(best)
      else {
        missing.push({ itemId: item.id, itemName: item.name })
        if (hasExpired) expiredCount++
      }
    }
    return {
      store,
      lines,
      missing,
      expired: expiredCount,
      total: round2(lines.reduce((s, l) => s + l.cost, 0)),
      coverage: lines.length,
      oneWayKm: haversineKm(opts.home, store) * opts.roadFactor,
    }
  })
}

function buildPlan(combo: StoreQuote[], items: CompareItem[], opts: CompareOptions): Plan | null {
  const lines: Line[] = []
  const missing: Plan['missing'] = []
  const used = new Set<string>()
  for (const item of items) {
    let best: Line | null = null
    for (const q of combo) {
      const l = q.lines.find((x) => x.itemId === item.id)
      if (l && (!best || l.cost < best.cost - 1e-9)) best = l
    }
    if (best) {
      lines.push(best)
      used.add(best.storeId)
    } else missing.push({ itemId: item.id, itemName: item.name })
  }
  // Un negozio da cui non si compra nulla non ha senso nel piano.
  if (combo.some((q) => !used.has(q.store.id))) return null
  const tour = shortestTour(opts.home, combo.map((q) => q.store), opts.roadFactor)
  const travelMinutes = (tour.km / Math.max(5, opts.avgSpeedKmh)) * 60
  const travelCost = tour.km * opts.costPerKm + travelMinutes * opts.costPerMinute
  const productCost = lines.reduce((s, l) => s + l.cost, 0)
  const penalty = Math.max(0, combo.length - 1) * opts.extraStopPenalty
  return {
    stores: tour.order,
    lines,
    missing,
    coverage: lines.length,
    productCost: round2(productCost),
    travelKm: tour.km,
    travelMinutes,
    travelCost: round2(travelCost),
    penalty: round2(penalty),
    total: round2(productCost + travelCost + penalty),
  }
}

const better = (a: Plan, b: Plan) => a.coverage > b.coverage || (a.coverage === b.coverage && a.total < b.total)

/**
 * Valuta tutte le combinazioni fino a maxStores tra i negozi più promettenti.
 * Regola: prima si massimizza il numero di prodotti coperti, poi si minimizza il costo totale;
 * una fermata in più viene aggiunta solo se copre più prodotti o fa risparmiare almeno la soglia.
 */
export function planShopping(quotes: StoreQuote[], items: CompareItem[], opts: CompareOptions) {
  const candidates = quotes
    .filter((q) => q.coverage > 0)
    .sort((a, b) => b.coverage - a.coverage || a.total + a.oneWayKm * 2 * opts.costPerKm - (b.total + b.oneWayKm * 2 * opts.costPerKm))
    .slice(0, opts.maxCandidates ?? 10)

  const bestByK: (Plan | null)[] = []
  for (let k = 1; k <= Math.max(1, opts.maxStores); k++) {
    let best: Plan | null = null
    for (const combo of combinations(candidates, k)) {
      const plan = buildPlan(combo, items, opts)
      if (plan && (!best || better(plan, best))) best = plan
    }
    bestByK.push(best)
  }

  let chosen: Plan | null = bestByK[0] ?? null
  for (const p of bestByK.slice(1)) {
    if (!p) continue
    if (!chosen || p.coverage > chosen.coverage || chosen.total - p.total >= opts.minSavingForExtraStop) chosen = p
  }
  return { best: chosen, bestSingle: bestByK[0] ?? null, byStores: bestByK }
}

function round2(v: number) {
  return Math.round(v * 100) / 100
}
