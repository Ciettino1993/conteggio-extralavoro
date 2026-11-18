import { describe, expect, it } from 'vitest'
import { daysBetween, formatScale, parseQuantity, unitPrice } from './units'
import { fuelCostPerKm, fuelStats, type FuelStation } from './fuel'
import { isValidBarcode } from './api/openfoodfacts'
import { shortestTour, tilesAround } from './geo'

describe('quantità e formati', () => {
  it('riconosce i formati comuni', () => {
    expect(parseQuantity('500 g')).toEqual({ value: 0.5, unit: 'kg' })
    expect(parseQuantity('1 L')).toEqual({ value: 1, unit: 'l' })
    expect(parseQuantity('6 x 1,5 l')).toEqual({ value: 9, unit: 'l' })
    expect(parseQuantity('75cl')).toEqual({ value: 0.75, unit: 'l' })
    expect(parseQuantity('1000')).toBeNull()
  })

  it('calcola prezzi unitari e fattori di formato', () => {
    expect(unitPrice(1.2, { value: 0.5, unit: 'kg' })).toEqual({ value: 2.4, unit: 'kg' })
    expect(formatScale({ value: 0.5, unit: 'kg' }, { value: 1, unit: 'kg' })).toBe(0.5)
    expect(formatScale({ value: 0.5, unit: 'kg' }, { value: 1, unit: 'l' })).toBeNull()
    expect(formatScale(null, { value: 1, unit: 'l' })).toBeUndefined()
  })

  it('conta i giorni tra date', () => {
    expect(daysBetween('2026-11-01', '2026-11-17')).toBe(16)
    expect(daysBetween('2026-11-17T10:00:00Z', '2026-11-17')).toBe(0)
  })
})

describe('codici a barre', () => {
  it('verifica la cifra di controllo', () => {
    expect(isValidBarcode('8076800195057')).toBe(true)
    expect(isValidBarcode('8076800195058')).toBe(false)
    expect(isValidBarcode('96385074')).toBe(true) // EAN-8
    expect(isValidBarcode('abc')).toBe(false)
  })
})

describe('carburanti', () => {
  const st = (p: FuelStation['p']): FuelStation => ({ i: 1, la: 45, lo: 9, b: '', n: '', a: '', c: '', p })

  it('fa la media dei prezzi self recenti, escludendo quelli vecchi', () => {
    const stations = [
      st({ B: [1.8, '2026-11-15'], G: [1.7, '2026-11-15'] }),
      st({ B: [2.0, '2026-11-14'] }),
      st({ B: [1.0, '2026-08-01'] }), // troppo vecchio
    ]
    const s = fuelStats(stations, 'benzina', { refDate: '2026-11-16' })
    expect(s).toMatchObject({ count: 2, avg: 1.9, min: 1.8, max: 2.0, oldest: '2026-11-14' })
    expect(fuelStats(stations, 'gasolio', { refDate: '2026-11-16' }).count).toBe(1)
    expect(fuelStats([], 'gasolio', { refDate: '2026-11-16' }).avg).toBeNull()
  })

  it('calcola il costo al km', () => {
    expect(fuelCostPerKm(1.95, 15)).toBeCloseTo(0.13)
    expect(fuelCostPerKm(1.95, 0)).toBe(0)
  })
})

describe('geografia', () => {
  it('copre il raggio con le mattonelle', () => {
    const keys = tilesAround({ lat: 45.49, lon: 9.24 }, 10, 0.25)
    expect(keys).toContain('181_36')
    expect(keys.length).toBeGreaterThanOrEqual(4)
  })

  it('trova il giro più corto', () => {
    // Quadrato: casa e tre vertici. Il giro migliore percorre il perimetro, con B (opposto a casa) nel mezzo.
    const home = { lat: 45, lon: 9 }
    const a = { lat: 45.01, lon: 9 }
    const b = { lat: 45.01, lon: 9.01 }
    const c = { lat: 45, lon: 9.01 }
    const t = shortestTour(home, [b, a, c], 1)
    expect(t.order[1]).toEqual(b)
    expect(t.km).toBeCloseTo(2 * 1.112 + 2 * 0.786, 1)
    expect(shortestTour(home, [a], 1.3).km).toBeCloseTo(2 * 1.112 * 1.3, 2)
  })
})
