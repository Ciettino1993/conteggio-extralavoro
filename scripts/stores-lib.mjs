// Supermercati italiani da OpenStreetMap (© OpenStreetMap contributors, ODbL).
// Input: GeoJSON Sequence prodotto da `osmium export -f geojsonseq -a type,id` sull'estratto Geofabrik.
import { TILE_DEG, tileKey } from './fuel-lib.mjs'

export { TILE_DEG }

/** Negozi considerati: tutti i supermercati e i minimarket di catena (con marchio). */
export function isGroceryStore(tags) {
  if (tags.shop === 'supermarket') return true
  return tags.shop === 'convenience' && !!tags.brand
}

/** Centro approssimato di un punto o poligono GeoJSON. */
export function centerOf(geometry) {
  if (!geometry) return null
  if (geometry.type === 'Point') return geometry.coordinates
  const ring =
    geometry.type === 'Polygon' ? geometry.coordinates[0] : geometry.type === 'MultiPolygon' ? geometry.coordinates[0]?.[0] : null
  if (!ring?.length) return null
  let x = 0
  let y = 0
  for (const [lon, lat] of ring) {
    x += lon
    y += lat
  }
  return [x / ring.length, y / ring.length]
}

export function addressOf(t) {
  const street = [t['addr:street'], t['addr:housenumber']].filter(Boolean).join(' ')
  return [street, t['addr:city']].filter(Boolean).join(', ')
}

/** Converte una riga GeoJSON (con eventuale separatore RS) in un negozio compatto, o null. */
export function parseFeature(line) {
  const text = line.replace(/^\x1e/, '').trim()
  if (!text) return null
  let f
  try {
    f = JSON.parse(text)
  } catch {
    return null
  }
  const p = f.properties ?? {}
  if (!isGroceryStore(p)) return null
  const c = centerOf(f.geometry)
  if (!c) return null
  const [lon, lat] = c
  if (lat < 35 || lat > 47.5 || lon < 6 || lon > 19) return null
  const type = p['@type']
  const id = p['@id']
  if (!type || id == null) return null
  const brand = p.brand ?? ''
  return {
    i: `${type}/${id}`,
    n: p.name ?? (brand || 'Supermercato'),
    b: brand,
    la: Math.round(lat * 1e5) / 1e5,
    lo: Math.round(lon * 1e5) / 1e5,
    a: addressOf(p),
  }
}

/** Raggruppa i negozi in mattonelle (stesse dimensioni dei distributori). */
export function buildStoreTiles(lines) {
  const tiles = new Map()
  const seen = new Set()
  let count = 0
  for (const line of lines) {
    const s = parseFeature(line)
    if (!s || seen.has(s.i)) continue
    seen.add(s.i)
    const key = tileKey(s.la, s.lo)
    if (!tiles.has(key)) tiles.set(key, [])
    tiles.get(key).push(s)
    count++
  }
  return { tiles, count }
}
