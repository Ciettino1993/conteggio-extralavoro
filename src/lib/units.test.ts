import { describe, expect, it } from 'vitest'
import { daysBetween } from './units'
import { fuelCostPerKm, fuelStats, type FuelStation } from './fuel'
import { tilesAround } from './geo'

describe('date', () => {
  it('conta i giorni tra date', () => {
    expect(daysBetween('2026-11-01', '2026-11-17')).toBe(16)
    expect(daysBetween('2026-11-17T10:00:00Z', '2026-11-17')).toBe(0)
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
})
