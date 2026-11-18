#!/usr/bin/env node
// Genera public/data/negozi/ (mattonelle con i supermercati) da un file GeoJSON Sequence.
// Uso: node scripts/update-stores.mjs <negozi.geojsonseq>
// In pubblicazione il file arriva dall'estratto Italia di Geofabrik filtrato con osmium
// (vedi .github/workflows/pubblica.yml): aggiornamento settimanale, nessuna chiamata a Overpass.
import { createReadStream } from 'node:fs'
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { TILE_DEG, buildStoreTiles } from './stores-lib.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT = path.join(ROOT, 'public', 'data', 'negozi')

async function* readLines(file) {
  const rl = createInterface({ input: createReadStream(file, 'utf8'), crlfDelay: Infinity })
  for await (const line of rl) yield line
}

async function main() {
  const input = process.argv[2]
  if (!input) throw new Error('indica il file .geojsonseq da leggere')
  const lines = []
  for await (const l of readLines(input)) lines.push(l)
  const { tiles, count } = buildStoreTiles(lines)
  if (count < 5000) throw new Error(`solo ${count} negozi letti: estratto incompleto?`)

  await mkdir(OUT, { recursive: true })
  for (const f of await readdir(OUT)) if (f.startsWith('t_')) await rm(path.join(OUT, f))
  for (const [key, list] of tiles) await writeFile(path.join(OUT, `t_${key}.json`), JSON.stringify(list))
  await writeFile(
    path.join(OUT, 'meta.json'),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        tileDeg: TILE_DEG,
        tiles: [...tiles.keys()].sort(),
        stores: count,
        source: 'OpenStreetMap (estratto Geofabrik)',
        license: 'ODbL - © OpenStreetMap contributors',
      },
      null,
      1,
    ),
  )
  console.log(`[negozi] ${count} supermercati in ${tiles.size} zone.`)
}

main().catch((err) => {
  console.error(`[negozi] errore: ${err.message}`)
  process.exitCode = 1
})
