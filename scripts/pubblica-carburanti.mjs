#!/usr/bin/env node
// Scarica dal PC (connessione italiana) i CSV MIMIT dei carburanti e li carica sul ramo "carburanti"
// del repository GitHub. Il caricamento avvia la ripubblicazione dell'app con i prezzi del giorno.
// Serve perché il sito MIMIT non risponde ai server di GitHub (esteri).
// Il ramo contiene un solo salvataggio, sostituito ogni giorno: il repository non cresce.
import { execFileSync } from 'node:child_process'
import { appendFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import os from 'node:os'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const BASE = 'https://www.mimit.gov.it/images/exportCSV/'
const FILES = ['anagrafica_impianti_attivi.csv', 'prezzo_alle_8.csv']
const WORK = path.join(process.env.LOCALAPPDATA ?? os.tmpdir(), 'SpesaSmart', 'carburanti-upload')
const IDENTITY = { name: 'Ciettino1993', email: '170741288+Ciettino1993@users.noreply.github.com' }

const LOG = path.join(process.env.LOCALAPPDATA ?? os.tmpdir(), 'SpesaSmart', 'carburanti.log')

const git = (...args) => execFileSync('git', args, { cwd: WORK, stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim()

/** Scrive a video e nel registro (utile quando lo script parte da solo ogni mattina). */
async function log(message, isError = false) {
  ;(isError ? console.error : console.log)(message)
  await mkdir(path.dirname(LOG), { recursive: true })
  await appendFile(LOG, `${new Date().toLocaleString('it-IT')}  ${message}\n`).catch(() => {})
}

async function main() {
  const pkg = JSON.parse(await readFile(path.join(ROOT, 'package.json'), 'utf8'))
  const repo = pkg.repository?.url ?? pkg.repository
  if (!repo) throw new Error('package.json senza "repository"')

  await rm(WORK, { recursive: true, force: true })
  await mkdir(WORK, { recursive: true })

  let extraction = null
  for (const f of FILES) {
    const res = await fetch(BASE + f, {
      headers: { 'User-Agent': 'SpesaSmart/0.1 (aggiornamento open data carburanti)' },
      signal: AbortSignal.timeout(180_000),
    })
    if (!res.ok) throw new Error(`${f}: HTTP ${res.status}`)
    const text = await res.text()
    if (text.split('\n').length < 1000) throw new Error(`${f}: file troppo corto, formato cambiato?`)
    extraction ??= /Estrazione del\s+(\d{4}-\d{2}-\d{2})/.exec(text)?.[1] ?? null
    await writeFile(path.join(WORK, f), text)
  }
  await writeFile(
    path.join(WORK, 'README.md'),
    `Open data MIMIT (licenza IODL 2.0), estrazione del ${extraction}.\n` +
      'Ramo aggiornato automaticamente ogni giorno da scripts/pubblica-carburanti.mjs.\n',
  )

  // GitHub avvia la pubblicazione solo se il ramo contiene il workflow: lo copiamo (compila sempre da main).
  const wf = path.join('.github', 'workflows', 'pubblica.yml')
  await mkdir(path.join(WORK, '.github', 'workflows'), { recursive: true })
  await writeFile(path.join(WORK, wf), await readFile(path.join(ROOT, wf)))

  git('init', '-q', '-b', 'carburanti')
  git('config', 'user.name', IDENTITY.name)
  git('config', 'user.email', IDENTITY.email)
  git('config', 'core.autocrlf', 'false') // evita avvisi sui fine riga (i file restano come scaricati)
  git('add', '-A')
  git('commit', '-q', '-m', `Prezzi carburanti MIMIT, estrazione del ${extraction}`)
  git('push', '-q', '--force', repo, 'carburanti:carburanti')
  await log(`[carburanti] caricati i dati del ${extraction}: l'app si aggiornerà in pochi minuti.`)
}

main().catch(async (err) => {
  const detail = err.stderr ? ` ${err.stderr.toString().trim()}` : ''
  await log(`[carburanti] errore: ${err.message}${detail}`, true)
  process.exitCode = 1
})
