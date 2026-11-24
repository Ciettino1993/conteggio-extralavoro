import type { LatLon } from './geo'

/** Km del percorso stradale più breve tra due punti (servizio dimostrativo OSRM, indicativo). */
export async function roadKm(from: LatLon, to: LatLon): Promise<number | null> {
  const coords = `${from.lon.toFixed(6)},${from.lat.toFixed(6)};${to.lon.toFixed(6)},${to.lat.toFixed(6)}`
  try {
    const res = await fetch(`https://router.project-osrm.org/route/v1/driving/${coords}?overview=false`, {
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) return null
    const json = await res.json()
    const meters = json.routes?.[0]?.distance
    return json.code === 'Ok' && typeof meters === 'number' ? meters / 1000 : null
  } catch {
    return null
  }
}
