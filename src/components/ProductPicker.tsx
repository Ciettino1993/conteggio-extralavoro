import { useEffect, useState } from 'react'
import { PackagePlus, ScanBarcode, Search, X } from 'lucide-react'
import { lookupBarcode, searchLocalProducts, searchProducts } from '../lib/api/openfoodfacts'
import type { Product } from '../lib/db'
import { userProduct } from '../lib/data'
import BarcodeScanner from './BarcodeScanner'
import ProductRow from './ProductRow'
import { useToast } from './Toast'

interface Props {
  title: string
  onPick: (p: Product) => void | Promise<void>
  onClose: () => void
  /** Se presente, consente di aggiungere una voce di testo libero (senza prodotto). */
  onFreeText?: (text: string) => void | Promise<void>
  startWithScanner?: boolean
  /** Ricerca da avviare subito (es. il nome letto sullo scontrino). */
  initialQuery?: string
}

/** Finestra per scegliere un prodotto: ricerca per nome/codice, scanner o nuovo prodotto. */
export default function ProductPicker({ title, onPick, onClose, onFreeText, startWithScanner, initialQuery }: Props) {
  const toast = useToast()
  const [mode, setMode] = useState<'search' | 'scan'>(startWithScanner ? 'scan' : 'search')
  const [query, setQuery] = useState(initialQuery ?? '')
  const [results, setResults] = useState<Product[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [unknownCode, setUnknownCode] = useState<string | null>(null)
  const [newName, setNewName] = useState('')

  const byBarcode = async (code: string) => {
    setBusy(true)
    try {
      const p = await lookupBarcode(code)
      if (p) await onPick(p)
      else {
        setUnknownCode(code)
        setMode('search')
      }
    } catch (err) {
      toast((err as Error).message, { tone: 'error' })
      setUnknownCode(code)
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    if (initialQuery?.trim()) void runSearch(initialQuery)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const search = async (e: React.FormEvent) => {
    e.preventDefault()
    await runSearch(query)
  }

  const runSearch = async (text: string) => {
    const q = text.trim()
    if (!q) return
    if (/^\d{8,14}$/.test(q)) return byBarcode(q)
    setBusy(true)
    setUnknownCode(null)
    try {
      const local = await searchLocalProducts(q)
      setResults(local)
      let remote = await searchProducts(q)
      // Nessun risultato con molte parole: riprova con le prime tre (es. "latte parzialmente scremato").
      const words = q.split(/\s+/)
      if (!remote.length && words.length > 3) remote = await searchProducts(words.slice(0, 3).join(' '))
      const seen = new Set(local.map((p) => p.code))
      setResults([...local, ...remote.filter((p) => !seen.has(p.code))])
    } catch (err) {
      toast((err as Error).message, { tone: 'error' })
    } finally {
      setBusy(false)
    }
  }

  const createNew = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newName.trim()) return
    await onPick(userProduct(newName, unknownCode ?? undefined))
    setUnknownCode(null)
    setNewName('')
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 sm:items-center" role="dialog" aria-modal aria-label={title}>
      <div className="flex max-h-[92dvh] w-full max-w-xl flex-col rounded-t-3xl bg-paper p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:rounded-3xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="h2">{title}</h2>
          <button className="btn-ghost" onClick={onClose} aria-label="Chiudi">
            <X size={22} />
          </button>
        </div>
        <div className="mb-3 grid grid-cols-2 gap-2">
          <button className={mode === 'search' ? 'btn-primary' : 'btn-secondary'} onClick={() => setMode('search')}>
            <Search size={18} /> Cerca
          </button>
          <button className={mode === 'scan' ? 'btn-primary' : 'btn-secondary'} onClick={() => setMode('scan')}>
            <ScanBarcode size={18} /> Scansiona
          </button>
        </div>

        <div className="-mx-1 flex-1 overflow-y-auto px-1">
          {mode === 'scan' ? (
            <BarcodeScanner onCode={byBarcode} paused={busy} />
          ) : (
            <div className="space-y-3">
              <form onSubmit={search} className="flex gap-2">
                <input
                  className="input"
                  placeholder="Nome, marca o codice a barre"
                  value={query}
                  autoFocus
                  onChange={(e) => setQuery(e.target.value)}
                  aria-label="Cerca prodotto"
                />
                <button className="btn-primary" disabled={busy} aria-label="Cerca">
                  <Search size={18} />
                </button>
              </form>
              {onFreeText && query.trim() && !/^\d+$/.test(query.trim()) && (
                <button className="btn-secondary w-full" onClick={() => onFreeText(query.trim())}>
                  Aggiungi «{query.trim()}» come voce libera
                </button>
              )}
              {unknownCode && (
                <form onSubmit={createNew} className="card space-y-2 border-amber-300 bg-amber-50">
                  <p className="text-sm">
                    Il codice <strong>{unknownCode}</strong> non è nel catalogo. Inserisci il nome: il prodotto resterà{' '}
                    <em>da verificare</em>.
                  </p>
                  <input className="input" placeholder="Es. Passata di pomodoro 700 g" value={newName} onChange={(e) => setNewName(e.target.value)} />
                  <button className="btn-primary w-full">
                    <PackagePlus size={18} /> Crea prodotto
                  </button>
                </form>
              )}
              {busy && <p className="muted">Ricerca in corso…</p>}
              {results && !busy && results.length === 0 && <p className="muted">Nessun prodotto trovato.</p>}
              <ul className="space-y-2">
                {results?.map((p) => (
                  <li key={p.code}>
                    <button className="w-full text-left" onClick={() => onPick(p)}>
                      <ProductRow product={p} />
                    </button>
                  </li>
                ))}
              </ul>
              {results && results.length > 0 && (
                <p className="text-xs text-stone-500">Dati prodotto: Open Food Facts (ODbL).</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
