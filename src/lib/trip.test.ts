import { describe, expect, it } from 'vitest'
import { EMPTY_GPS, addFix, aggregate, fmtDuration, fmtMinutes, periodRange, suggestKmSource, tripCosts, tripsToCsv, type Fix } from './trip'
import type { Trip } from './db'

// ~0,0009° di latitudine = 100 m
const fix = (metersNorth: number, seconds: number, acc = 10): Fix => ({ lat: 45 + metersNorth / 111_195, lon: 9, acc, t: seconds * 1000 })

describe('distanza dal GPS', () => {
  it('somma gli spostamenti reali', () => {
    let s = EMPTY_GPS
    for (let i = 0; i <= 10; i++) s = addFix(s, fix(i * 100, i * 10)) // 100 m ogni 10 s = 36 km/h
    expect(s.km).toBeCloseTo(1.0, 2)
    expect(s.track).toHaveLength(11)
  })

  it('ignora il tremolio da fermi e le posizioni imprecise', () => {
    let s = addFix(EMPTY_GPS, fix(0, 0))
    for (let i = 1; i <= 20; i++) s = addFix(s, fix(i % 2 ? 8 : -6, i * 5)) // oscillazioni di pochi metri
    s = addFix(s, fix(500, 200, 120)) // precisione 120 m: scartata
    expect(s.km).toBe(0)
  })

  it('scarta i salti impossibili ma accumula i movimenti lenti', () => {
    let s = addFix(EMPTY_GPS, fix(0, 0))
    s = addFix(s, fix(5000, 2)) // 5 km in 2 s
    expect(s.km).toBe(0)
    for (let i = 1; i <= 10; i++) s = addFix(s, fix(i * 10, i * 5)) // 10 m ogni 5 s: a piedi
    expect(s.km).toBeCloseTo(0.1, 2) // i passi da 10 m si sommano a coppie oltre la soglia di 15 m
  })

  it('misura i buchi di segnale', () => {
    let s = addFix(EMPTY_GPS, fix(0, 0))
    s = addFix(s, fix(3000, 300)) // 5 minuti senza posizioni
    expect(s.gapSeconds).toBe(300)
    expect(s.km).toBeCloseTo(3, 2)
  })
})

describe('costi', () => {
  it('calcola carburante e tempo', () => {
    // 30 km, 15 km/l -> 2 l x 1,95 = 3,90 €; 45 min a 12 €/h = 9 €
    expect(tripCosts({ km: 30, minutes: 45, pricePerLitre: 1.95, kmPerLitre: 15, hourlyWage: 12, countTime: true })).toMatchObject({
      litres: 2,
      fuelCost: 3.9,
      timeCost: 9,
      total: 12.9,
    })
  })

  it('senza prezzo o con il tempo escluso', () => {
    expect(tripCosts({ km: 30, minutes: 45, pricePerLitre: null, kmPerLitre: 15, hourlyWage: 12, countTime: false })).toMatchObject({
      fuelCost: 0,
      timeCost: 0,
      total: 0,
    })
  })

  it('propone i km stradali solo se il GPS ha perso molto', () => {
    expect(suggestKmSource(10, 10.5, 0, 1200)).toBe('gps')
    expect(suggestKmSource(4, 10.5, 600, 1200)).toBe('strada')
    expect(suggestKmSource(4, null, 600, 1200)).toBe('gps')
  })
})

describe('resoconto', () => {
  const t = (startedAt: string, fuelCost: number, timeCost: number) => ({ startedAt, fuelCost, timeCost, total: fuelCost + timeCost, km: 10, minutes: 20 })

  it('trova settimana (da lunedì), mese e anno', () => {
    const ref = new Date(2026, 10, 18) // mercoledì 18 novembre 2026
    expect(periodRange('settimana', ref)!.from).toEqual(new Date(2026, 10, 16))
    expect(periodRange('settimana', ref, -1)!.from).toEqual(new Date(2026, 10, 9))
    expect(periodRange('mese', ref, 1)).toEqual({ from: new Date(2026, 11, 1), to: new Date(2027, 0, 1) })
    expect(periodRange('anno', ref)!.to).toEqual(new Date(2027, 0, 1))
    expect(periodRange('tutto', ref)).toBeNull()
  })

  it('somma per giorno con tutti i giorni della settimana', () => {
    const range = periodRange('settimana', new Date(2026, 10, 18))
    const trips = [t('2026-11-16T08:00:00', 2, 5), t('2026-11-16T18:00:00', 2, 5), t('2026-11-18T08:00:00', 1, 3), t('2026-11-25T08:00:00', 9, 9)]
    const { buckets, totals } = aggregate(trips, 'settimana', range)
    expect(buckets).toHaveLength(7)
    expect(buckets[0]).toMatchObject({ label: 'lun 16', fuelCost: 4, timeCost: 10, total: 14, trips: 2 })
    expect(totals).toMatchObject({ fuelCost: 5, timeCost: 13, total: 18, trips: 3, km: 30 })
  })

  it('somma per mese nell\'anno', () => {
    const { buckets } = aggregate([t('2026-03-02T08:00:00', 1, 1), t('2026-03-20T08:00:00', 1, 1)], 'anno', periodRange('anno', new Date(2026, 5, 1)))
    expect(buckets).toHaveLength(12)
    expect(buckets[2]).toMatchObject({ label: 'mar', total: 4, trips: 2 })
  })
})

describe('formati', () => {
  it('durate', () => {
    expect(fmtDuration(3725)).toBe('1:02:05')
    expect(fmtMinutes(45)).toBe('45 min')
    expect(fmtMinutes(135)).toBe('2 h 15 min')
  })

  it('CSV per Excel', () => {
    const trip = {
      startedAt: new Date(2026, 10, 18, 8, 5).toISOString(),
      endedAt: new Date(2026, 10, 18, 8, 50).toISOString(),
      minutes: 45,
      km: 30.04,
      kmSource: 'gps',
      fuelType: 'benzina',
      pricePerLitre: 1.951,
      kmPerLitre: 15,
      fuelCost: 3.91,
      hourlyWage: 12,
      timeCost: 9,
      total: 12.91,
      note: 'Cliente "Rossi"',
    } as Trip
    const [head, row] = tripsToCsv([trip]).split('\r\n')
    expect(head.split(';')).toHaveLength(14)
    expect(row).toBe('2026-11-18;08:05;08:50;45;30,0;gps;benzina;1,951;15,0;3,91;12,00;9,00;12,91;"Cliente ""Rossi"""')
  })
})
