import { describe, expect, it } from 'vitest'
import { buildStoreTiles, centerOf, parseFeature } from './stores-lib.mjs'

const RS = '\x1e'
const point = (props, lon = 11.34, lat = 44.49) =>
  RS + JSON.stringify({ type: 'Feature', geometry: { type: 'Point', coordinates: [lon, lat] }, properties: props })

describe('stores-lib', () => {
  it('legge supermercati e minimarket di catena, scarta il resto', () => {
    expect(parseFeature(point({ '@type': 'node', '@id': 1, shop: 'supermarket', name: 'Conad', brand: 'Conad' }))).toMatchObject({
      i: 'node/1',
      n: 'Conad',
      b: 'Conad',
      la: 44.49,
      lo: 11.34,
    })
    expect(parseFeature(point({ '@type': 'node', '@id': 2, shop: 'convenience', name: 'Bar' }))).toBeNull()
    expect(parseFeature(point({ '@type': 'node', '@id': 3, shop: 'convenience', brand: 'Carrefour Express' }))?.n).toBe(
      'Carrefour Express',
    )
    expect(parseFeature(point({ '@type': 'node', '@id': 4, shop: 'bakery' }))).toBeNull()
    expect(parseFeature('non json')).toBeNull()
  })

  it('usa il centro dei poligoni e compone l\'indirizzo', () => {
    const poly = {
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [[[11, 44], [11.002, 44], [11.002, 44.002], [11, 44.002]]] },
      properties: { '@type': 'way', '@id': 9, shop: 'supermarket', 'addr:street': 'Via Roma', 'addr:housenumber': '3', 'addr:city': 'Bologna' },
    }
    const [lon, lat] = centerOf(poly.geometry)
    expect(lon).toBeCloseTo(11.001, 6)
    expect(lat).toBeCloseTo(44.001, 6)
    expect(parseFeature(JSON.stringify(poly))).toMatchObject({ i: 'way/9', a: 'Via Roma 3, Bologna', n: 'Supermercato' })
  })

  it('raggruppa in mattonelle senza duplicati', () => {
    const line = point({ '@type': 'node', '@id': 1, shop: 'supermarket' })
    const { tiles, count } = buildStoreTiles([line, line, point({ '@type': 'node', '@id': 2, shop: 'supermarket' }, 9.19, 45.46)])
    expect(count).toBe(2)
    expect(tiles.size).toBe(2)
  })
})
