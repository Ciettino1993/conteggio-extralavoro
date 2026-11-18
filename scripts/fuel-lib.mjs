// Parsing degli open data MIMIT "Osservaprezzi carburanti" (licenza IODL 2.0).
// Formato: prima riga "Estrazione del AAAA-MM-GG", poi intestazione, poi righe separate da "|".

/** Dimensione delle "mattonelle" geografiche in gradi (circa 28 x 20 km in Italia). */
export const TILE_DEG = 0.25

/** Carburanti considerati: solo i prodotti base, confrontabili tra distributori. */
const FUEL_CODES = { Benzina: 'B', Gasolio: 'G' }

export function tileKey(lat, lon) {
  return `${Math.floor(lat / TILE_DEG)}_${Math.floor(lon / TILE_DEG)}`
}

/** "11/11/2026 14:00:12" -> "2026-11-11" */
export function parseItDate(s) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(String(s).trim())
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null
}

function extractionDate(line) {
  const m = /Estrazione del\s+(\d{4}-\d{2}-\d{2})/.exec(line)
  return m ? m[1] : null
}

const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim()

/** Anagrafica impianti. Alcuni nomi contengono "|": id e campi finali restano affidabili. */
export function parseStations(csv) {
  const stations = new Map()
  let extraction = null
  for (const line of csv.split(/\r?\n/)) {
    if (!line.trim()) continue
    if (line.startsWith('Estrazione')) { extraction = extractionDate(line); continue }
    if (line.startsWith('idImpianto')) continue
    const f = line.split('|')
    const n = f.length
    if (n < 10) continue
    const id = Number(f[0])
    const lat = Number(f[n - 2])
    const lon = Number(f[n - 1])
    if (!Number.isInteger(id) || !Number.isFinite(lat) || !Number.isFinite(lon)) continue
    // Scarta coordinate mancanti o palesemente fuori dall'Italia.
    if (lat < 35 || lat > 47.5 || lon < 6 || lon > 19) continue
    stations.set(id, {
      i: id,
      la: Math.round(lat * 1e5) / 1e5,
      lo: Math.round(lon * 1e5) / 1e5,
      b: n === 10 ? clean(f[2]) : '',
      n: n === 10 ? clean(f[4]) : clean(f.slice(1, n - 5).join(' ')),
      a: clean(f[n - 5]),
      c: clean(f[n - 4]),
      p: {},
    })
  }
  return { extraction, stations }
}

/**
 * Prezzi: per ogni impianto e carburante tiene il prezzo comunicato più di recente.
 * Chiavi: B = benzina self, Bs = benzina servito, G = gasolio self, Gs = gasolio servito.
 */
export function parsePrices(csv) {
  const prices = new Map()
  let extraction = null
  for (const line of csv.split(/\r?\n/)) {
    if (!line.trim()) continue
    if (line.startsWith('Estrazione')) { extraction = extractionDate(line); continue }
    if (line.startsWith('idImpianto')) continue
    const f = line.split('|')
    if (f.length !== 5) continue
    const code = FUEL_CODES[f[1].trim()]
    if (!code) continue
    const id = Number(f[0])
    const price = Number(f[2])
    const date = parseItDate(f[4])
    // Scarta valori anomali (errori di inserimento).
    if (!Number.isInteger(id) || !(price > 0.5 && price < 4) || !date) continue
    const key = code + (f[3].trim() === '1' ? '' : 's')
    const entry = prices.get(id) ?? {}
    const prev = entry[key]
    if (!prev || prev[1] < date) entry[key] = [price, date]
    prices.set(id, entry)
  }
  return { extraction, prices }
}

/** Unisce anagrafica e prezzi e divide gli impianti in mattonelle geografiche. */
export function buildTiles(stationsCsv, pricesCsv) {
  const { stations, extraction: e1 } = parseStations(stationsCsv)
  const { prices, extraction: e2 } = parsePrices(pricesCsv)
  const tiles = new Map()
  let count = 0
  for (const [id, st] of stations) {
    const p = prices.get(id)
    if (!p) continue
    st.p = p
    const key = tileKey(st.la, st.lo)
    if (!tiles.has(key)) tiles.set(key, [])
    tiles.get(key).push(st)
    count++
  }
  return { extraction: e2 ?? e1, tiles, count }
}
