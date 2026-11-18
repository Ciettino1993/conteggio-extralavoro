import { describe, expect, it } from 'vitest'
import { buildTiles, parseItDate, parsePrices, parseStations, tileKey } from './fuel-lib.mjs'

const ANAG = `Estrazione del 2026-11-16
idImpianto|Gestore|Bandiera|Tipo Impianto|Nome Impianto|Indirizzo|Comune|Provincia|Latitudine|Longitudine
1|ROSSI SRL|Agip Eni|Stradale|ENI MILANO|VIA ROMA 1|MILANO|MI|45.4642|9.19
2|STOIL | gestori.it|Pompe Bianche|Stradale|STOIL | gestori.it|SP 82|ALESSANDRIA|AL|44.9164|8.7012
3|X|Y|Stradale|SENZA COORDINATE|VIA|COMUNE|XX|0|0
`
const PREZZI = `Estrazione del 2026-11-16
idImpianto|descCarburante|prezzo|isSelf|dtComu
1|Benzina|1.899|1|10/11/2026 08:00:00
1|Benzina|1.879|1|15/11/2026 08:00:00
1|Benzina|2.099|0|15/11/2026 08:00:00
1|Gasolio|1.799|1|15/11/2026 08:00:00
1|GPL|0.699|0|15/11/2026 08:00:00
2|Gasolio|9.999|1|15/11/2026 08:00:00
2|Gasolio|1.759|1|14/11/2026 08:00:00
`

describe('fuel-lib', () => {
  it('converte le date italiane', () => {
    expect(parseItDate('11/11/2026 14:00:12')).toBe('2026-11-11')
    expect(parseItDate('boh')).toBeNull()
  })

  it('legge l\'anagrafica anche con "|" nei nomi e scarta coordinate nulle', () => {
    const { extraction, stations } = parseStations(ANAG)
    expect(extraction).toBe('2026-11-16')
    expect(stations.size).toBe(2)
    expect(stations.get(1)).toMatchObject({ b: 'Agip Eni', c: 'MILANO', la: 45.4642, lo: 9.19 })
    expect(stations.get(2)).toMatchObject({ b: '', c: 'ALESSANDRIA', a: 'SP 82' })
  })

  it('tiene il prezzo più recente, separa self/servito e scarta anomalie', () => {
    const { prices } = parsePrices(PREZZI)
    expect(prices.get(1)).toEqual({
      B: [1.879, '2026-11-15'],
      Bs: [2.099, '2026-11-15'],
      G: [1.799, '2026-11-15'],
    })
    expect(prices.get(2)).toEqual({ G: [1.759, '2026-11-14'] })
  })

  it('raggruppa gli impianti in mattonelle', () => {
    const { tiles, count, extraction } = buildTiles(ANAG, PREZZI)
    expect(count).toBe(2)
    expect(extraction).toBe('2026-11-16')
    expect(tiles.get(tileKey(45.4642, 9.19))?.[0].i).toBe(1)
  })
})
