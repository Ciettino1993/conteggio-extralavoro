#!/usr/bin/env node
// Scarica gli open data MIMIT sui prezzi dei carburanti e genera i file in public/data/carburanti/.
// Uso: node scripts/update-fuel.mjs            -> aggiorna sempre (errore se il download fallisce)
//      node scripts/update-fuel.mjs --if-stale -> aggiorna solo se i dati hanno più di 12 ore
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { TILE_DEG, buildTiles } from './fuel-lib.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT = path.join(ROOT, 'public', 'data', 'carburanti')
const BASE = 'https://www.mimit.gov.it/images/exportCSV/'
const STALE_MS = 12 * 3600 * 1000
const ifStale = process.argv.includes('--if-stale')

async function readMeta() {
  try {
    return JSON.parse(await readFile(path.join(OUT, 'meta.json'), 'utf8'))
  } catch {
    return null
  }
}

async function download(name, attempts = 3) {
  for (let i = 1; ; i++) {
    try {
      const res = await fetch(BASE + name, {
        headers: { 'User-Agent': 'SpesaSmart/0.1 (aggiornamento open data carburanti)' },
        signal: AbortSignal.timeout(120_000),
      })
      if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`)
      return await res.text()
    } catch (err) {
      // "fetch failed" nasconde la causa vera (timeout, connessione rifiutata...): la mostriamo.
      const cause = err.cause ? ` [${err.cause.code ?? ''} ${err.cause.message ?? err.cause}]` : ''
      const msg = `${name}: ${err.message}${cause}`
      if (i >= attempts) throw new Error(msg)
      console.warn(`[carburanti] tentativo ${i} non riuscito (${msg}), riprovo...`)
      await new Promise((r) => setTimeout(r, 5000 * i))
    }
  }
}

async function main() {
  const meta = await readMeta()
  if (ifStale && meta && Date.now() - Date.parse(meta.generatedAt) < STALE_MS) {
    console.log(`[carburanti] dati aggiornati (estrazione del ${meta.extraction}), nessun download.`)
    return
  }
  console.log('[carburanti] download open data MIMIT...')
  const [stationsCsv, pricesCsv] = await Promise.all([
    download('anagrafica_impianti_attivi.csv'),
    download('prezzo_alle_8.csv'),
  ])
  const { extraction, tiles, count } = buildTiles(stationsCsv, pricesCsv)
  if (count < 1000) throw new Error(`solo ${count} impianti letti: il formato dei file potrebbe essere cambiato`)

  await mkdir(OUT, { recursive: true })
  for (const f of await readdir(OUT)) if (f.startsWith('t_')) await rm(path.join(OUT, f))
  for (const [key, list] of tiles) {
    await writeFile(path.join(OUT, `t_${key}.json`), JSON.stringify(list))
  }
  const newMeta = {
    extraction,
    generatedAt: new Date().toISOString(),
    tileDeg: TILE_DEG,
    tiles: [...tiles.keys()].sort(),
    stations: count,
    source: 'MIMIT - Osservatorio prezzi carburanti (open data)',
    sourceUrl:
      'https://www.mimit.gov.it/it/open-data/elenco-dataset/carburanti-prezzi-praticati-e-anagrafica-degli-impianti',
    license: 'IODL 2.0',
  }
  await writeFile(path.join(OUT, 'meta.json'), JSON.stringify(newMeta, null, 1))
  console.log(`[carburanti] ${count} impianti in ${tiles.size} zone, estrazione del ${extraction}.`)
}

main().catch(async (err) => {
  const meta = await readMeta()
  const fallback = meta
    ? `uso i dati del ${meta.extraction}`
    : 'i prezzi dei carburanti non saranno disponibili'
  console.warn(`[carburanti] aggiornamento non riuscito (${err.message}); ${fallback}.`)
  // In modalità --if-stale non blocca l'avvio dell'app; altrimenti segnala l'errore (utile in CI).
  if (!ifStale) process.exitCode = 1
})
