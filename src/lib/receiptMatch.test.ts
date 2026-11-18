import { describe, expect, it } from 'vitest'
import { aliasKey, normalize, similarity, suggestProduct, suggestStore } from './receiptMatch'
import type { Product, Store } from './db'

const prod = (code: string, name: string, brand = '', quantity = ''): Product => ({
  code,
  name,
  brand,
  quantity,
  source: 'openfoodfacts',
  updatedAt: '',
})
const store = (id: string, brand: string, address: string, lat = 45.46, lon = 9.19): Store => ({
  id,
  name: brand,
  brand,
  address,
  lat,
  lon,
  fetchedAt: '',
})

describe('abbinamento righe scontrino', () => {
  it('normalizza accenti e simboli', () => {
    expect(normalize('Caffè  "Crema" 250g!')).toBe('caffe crema 250g')
    expect(aliasKey('Esselunga', 'SPAGH. BARILLA N5')).toBe('esselunga|spagh barilla n5')
    expect(aliasKey('ESSELUNGA S.P.A.', 'SPAGH. BARILLA N5')).toBe(aliasKey('Esselunga', 'spagh barilla n5'))
    expect(aliasKey('Coop Lombardia', 'x')).toBe('coop|x')
    expect(aliasKey('Supermercati Tosano', 'x')).toBe('tosano|x')
  })

  it('riconosce le abbreviazioni', () => {
    const spaghetti = prod('1', 'Spaghetti n.5', 'Barilla', '500 g')
    expect(similarity('Spaghetti n.5 Barilla', spaghetti)).toBeGreaterThan(0.8)
    expect(similarity('spagh barilla', spaghetti)).toBeGreaterThan(0.6)
    expect(similarity('Latte parzialmente scremato Granarolo', spaghetti)).toBe(0)
  })

  it('preferisce un abbinamento già confermato, altrimenti il più simile', () => {
    const list = [prod('1', 'Spaghetti n.5', 'Barilla'), prod('2', 'Penne rigate', 'Barilla')]
    expect(suggestProduct('qualcosa', '2', list)).toMatchObject({ reason: 'appreso', product: { code: '2' } })
    expect(suggestProduct('Penne rigate Barilla', undefined, list)?.product.code).toBe('2')
    expect(suggestProduct('Detersivo piatti', undefined, list)).toBeNull()
  })
})

describe('punto vendita dallo scontrino', () => {
  const stores = [
    store('a', 'Esselunga', 'Viale Papiniano 27, Milano'),
    store('b', 'Esselunga', 'Via Spadari 6, Milano'),
    store('c', 'Conad', 'Via Spadari 2, Milano'),
  ]

  it('usa insegna e indirizzo', () => {
    expect(suggestStore({ catena: 'ESSELUNGA SPA', indirizzo: 'VIA SPADARI 6', citta: 'MILANO' }, stores, null)?.id).toBe('b')
    expect(suggestStore({ catena: 'Conad', indirizzo: null, citta: null }, stores, null)?.id).toBe('c')
  })

  it('non propone negozi di altre catene', () => {
    expect(suggestStore({ catena: 'Lidl', indirizzo: 'Via Spadari 6', citta: null }, stores, null)).toBeNull()
  })
})
