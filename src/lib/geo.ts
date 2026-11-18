export type LatLon = { lat: number; lon: number }

const R_KM = 6371.0088

/** Distanza in linea d'aria (km). */
export function haversineKm(a: LatLon, b: LatLon): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLon = toRad(b.lon - a.lon)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2
  return 2 * R_KM * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** Chiavi delle mattonelle (lato tileDeg gradi) che coprono un cerchio di raggio radiusKm. */
export function tilesAround(center: LatLon, radiusKm: number, tileDeg: number): string[] {
  const dLat = radiusKm / 111.32
  const dLon = radiusKm / (111.32 * Math.cos((center.lat * Math.PI) / 180))
  const keys: string[] = []
  for (let y = Math.floor((center.lat - dLat) / tileDeg); y <= Math.floor((center.lat + dLat) / tileDeg); y++) {
    for (let x = Math.floor((center.lon - dLon) / tileDeg); x <= Math.floor((center.lon + dLon) / tileDeg); x++) {
      keys.push(`${y}_${x}`)
    }
  }
  return keys
}

/** Permutazioni (per percorsi con pochi negozi, massimo 3-4). */
export function permutations<T>(arr: T[]): T[][] {
  if (arr.length <= 1) return [arr.slice()]
  const out: T[][] = []
  arr.forEach((x, i) => {
    for (const rest of permutations([...arr.slice(0, i), ...arr.slice(i + 1)])) out.push([x, ...rest])
  })
  return out
}

/** Combinazioni di k elementi. */
export function combinations<T>(arr: T[], k: number): T[][] {
  if (k === 0) return [[]]
  if (arr.length < k) return []
  const [head, ...tail] = arr
  return [...combinations(tail, k - 1).map((c) => [head, ...c]), ...combinations(tail, k)]
}

/** Giro più corto casa -> negozi -> casa, in linea d'aria moltiplicata per il fattore stradale. */
export function shortestTour<T extends LatLon>(home: LatLon, stops: T[], roadFactor: number) {
  let best = { order: stops, km: Infinity }
  for (const order of permutations(stops)) {
    let km = 0
    let prev: LatLon = home
    for (const s of order) {
      km += haversineKm(prev, s)
      prev = s
    }
    km += haversineKm(prev, home)
    if (km < best.km) best = { order, km }
  }
  return { order: best.order, km: stops.length ? best.km * roadFactor : 0 }
}
