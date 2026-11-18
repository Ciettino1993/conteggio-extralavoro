import { describe, expect, it } from 'vitest'
import { planShopping, quoteStores, type CompareItem, type CompareOptions, type PriceObs } from './compare'

const home = { lat: 45.0, lon: 9.0 }
// ~1,1 km e ~2,2 km a nord di casa
const A = { id: 'A', name: 'Market A', lat: 45.01, lon: 9.0 }
const B = { id: 'B', name: 'Market B', lat: 45.02, lon: 9.0 }
const FAR = { id: 'F', name: 'Lontano', lat: 45.3, lon: 9.0 }

const opts: CompareOptions = {
  home,
  today: '2026-11-17',
  maxStores: 2,
  costPerKm: 0.13,
  costPerMinute: 0,
  avgSpeedKmh: 30,
  roadFactor: 1.3,
  extraStopPenalty: 0,
  minSavingForExtraStop: 2,
  maxPriceAgeDays: 60,
}

const price = (productCode: string, storeId: string, p: number, observedAt = '2026-11-10', extra: Partial<PriceObs> = {}): PriceObs => ({
  productCode,
  storeId,
  price: p,
  observedAt,
  status: 'segnalato',
  source: 'openprices',
  ...extra,
})

const item = (id: string, codes: string[], quantity = 1, scale?: number | null): CompareItem => ({
  id,
  name: id,
  quantity,
  candidates: codes.map((code, i) => ({ code, match: i === 0 ? 'esatto' : 'equivalente', scale: i === 0 ? undefined : scale })),
})

describe('quoteStores', () => {
  it('somma quantità × prezzo e indica i mancanti', () => {
    const items = [item('pasta', ['1'], 2), item('latte', ['2'])]
    const [q] = quoteStores(items, [A], [price('1', 'A', 1.2)], opts)
    expect(q.total).toBe(2.4)
    expect(q.coverage).toBe(1)
    expect(q.missing.map((m) => m.itemId)).toEqual(['latte'])
  })

  it('usa il prezzo più recente e ignora quelli scaduti o rifiutati', () => {
    const items = [item('pasta', ['1'])]
    const prices = [
      price('1', 'A', 1.0, '2026-11-01'),
      price('1', 'A', 1.5, '2026-11-15'),
      price('1', 'B', 0.5, '2026-01-01'), // scaduto
      price('1', 'A', 0.1, '2026-11-16', { status: 'rifiutato' }),
    ]
    const [qa, qb] = quoteStores(items, [A, B], prices, opts)
    expect(qa.total).toBe(1.5)
    expect(qb.coverage).toBe(0)
    expect(qb.expired).toBe(1)
  })

  it('etichetta gli equivalenti e li riporta al formato del prodotto principale', () => {
    // alternativa da 1 kg al posto di 500 g: scala 0,5
    const items = [item('pasta', ['1', '2'], 1, 0.5)]
    const [q] = quoteStores(items, [A], [price('2', 'A', 2.0)], opts)
    expect(q.lines[0]).toMatchObject({ match: 'equivalente', unitPrice: 1.0, scaled: true })
  })

  it('non usa equivalenti con formati non confrontabili', () => {
    const items = [item('pasta', ['1', '2'], 1, null)]
    const [q] = quoteStores(items, [A], [price('2', 'A', 2.0)], opts)
    expect(q.coverage).toBe(0)
  })

  it('a parità di prezzo preferisce il prodotto esatto', () => {
    const items = [item('pasta', ['1', '2'], 1, 1)]
    const [q] = quoteStores(items, [A], [price('1', 'A', 1), price('2', 'A', 1)], opts)
    expect(q.lines[0].match).toBe('esatto')
  })
})

describe('planShopping', () => {
  const items = [item('pasta', ['1']), item('latte', ['2']), item('olio', ['3'])]

  it('preferisce il piano che copre più prodotti', () => {
    const prices = [price('1', 'A', 1), price('2', 'A', 1), price('3', 'B', 5)]
    const quotes = quoteStores(items, [A, B], prices, opts)
    const { best, bestSingle } = planShopping(quotes, items, opts)
    expect(bestSingle?.coverage).toBe(2)
    expect(best?.coverage).toBe(3)
    expect(best?.stores.map((s) => s.id).sort()).toEqual(['A', 'B'])
  })

  it('aggiunge una fermata solo se il risparmio supera la soglia', () => {
    // B costa 1 € in meno in totale: sotto la soglia di 2 € -> un solo negozio
    const small = [price('1', 'A', 3), price('2', 'A', 3), price('3', 'A', 3), price('1', 'B', 4), price('2', 'B', 4), price('3', 'B', 1)]
    const quotes = quoteStores(items, [A, B], small, opts)
    expect(planShopping(quotes, items, opts).best?.stores).toHaveLength(1)

    // Con 4 € di risparmio sui prodotti conviene passare da entrambi
    const big = [price('1', 'A', 3), price('2', 'A', 3), price('3', 'A', 6), price('1', 'B', 4), price('2', 'B', 4), price('3', 'B', 2)]
    const q2 = quoteStores(items, [A, B], big, opts)
    expect(planShopping(q2, items, opts).best?.stores).toHaveLength(2)
  })

  it('include i costi di spostamento: il negozio lontano conviene solo se il risparmio li copre', () => {
    const prices = [price('1', 'A', 2), price('1', 'F', 1.5)]
    const one = [item('pasta', ['1'])]
    const { best } = planShopping(quoteStores(one, [A, FAR], prices, opts), one, opts)
    expect(best?.stores[0].id).toBe('A')
    expect(best?.travelCost).toBeGreaterThan(0)
    // ~33 km × 2 × 1,3 × 0,13 €/km ≈ 8,7 € di carburante per andare al negozio lontano
  })

  it('senza prezzi non propone piani', () => {
    const { best } = planShopping(quoteStores(items, [A], [], opts), items, opts)
    expect(best).toBeNull()
  })
})
