import { useRef, useState } from 'react'
import { Link } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { AlertTriangle, Camera, Check, PackagePlus, ReceiptText, RotateCcw, Search, X } from 'lucide-react'
import { db, getApiKey, nowIso, type Product, type Store } from '../lib/db'
import { useSettings } from '../lib/settings'
import { prepareImage, readReceipt, type Receipt, type ReceiptLine } from '../lib/api/receipt'
import { fetchStoresAround } from '../lib/api/osm'
import { aliasKey, suggestProduct, suggestStore } from '../lib/receiptMatch'
import { reportPrice, saveProduct, userProduct } from '../lib/data'
import { haversineKm } from '../lib/geo'
import { fmtDate, fmtEur, fmtKm, todayIso } from '../lib/units'
import ApiKeySetup from '../components/ApiKeySetup'
import LocationPicker from '../components/LocationPicker'
import ProductPicker from '../components/ProductPicker'
import { PageHeader } from '../components/ui'
import { useToast } from '../components/Toast'

interface Row {
  line: ReceiptLine
  product: Product | null
  reason: 'appreso' | 'simile' | 'scelto' | null
  ignored: boolean
}

type Phase =
  | { kind: 'pick' }
  | { kind: 'reading'; previewUrl: string }
  | { kind: 'review'; previewUrl: string; receipt: Receipt; costEur: number; stores: (Store & { km: number })[] }
  | { kind: 'saved'; count: number; storeName: string; date: string }

const describe = (l: ReceiptLine) => [l.nome_probabile, l.marca, l.formato].filter(Boolean).join(' ')

/** Testo per la ricerca prodotto: nome letto più marca, senza ripeterla se è già nel nome. */
const searchText = (l: ReceiptLine) =>
  l.marca && !l.nome_probabile.toLowerCase().includes(l.marca.toLowerCase()) ? `${l.nome_probabile} ${l.marca}` : l.nome_probabile

export default function ReceiptPage() {
  const settings = useSettings()
  const toast = useToast()
  const hasKey = useLiveQuery(async () => !!(await getApiKey()), [], false)
  const fileRef = useRef<HTMLInputElement>(null)
  const [phase, setPhase] = useState<Phase>({ kind: 'pick' })
  const [rows, setRows] = useState<Row[]>([])
  const [storeId, setStoreId] = useState('')
  const [date, setDate] = useState(todayIso())
  const [picker, setPicker] = useState<number | null>(null)
  const loc = settings.location

  const onFile = async (file: File | undefined) => {
    if (!file || !loc) return
    const apiKey = await getApiKey()
    if (!apiKey) return toast('Configura prima la chiave API', { tone: 'error' })
    try {
      const { base64, previewUrl } = await prepareImage(file)
      setPhase({ kind: 'reading', previewUrl })
      // Negozi vicini (dati settimanali OpenStreetMap) per riconoscere il punto vendita.
      const radius = Math.max(settings.storeRadiusKm, 15)
      const [result] = await Promise.all([
        readReceipt(base64, apiKey, settings.receiptModel),
        fetchStoresAround(loc, radius).catch(() => 0),
      ])
      const { receipt, costEur } = result
      const stores = (await db.stores.toArray())
        .map((s) => ({ ...s, km: haversineKm(loc, s) }))
        .filter((s) => s.km <= radius)
        .sort((a, b) => a.km - b.km)
      const candidates = await db.products.toArray()
      const chain = receipt.negozio.catena
      const newRows: Row[] = []
      for (const line of receipt.righe) {
        const alias = await db.receiptAliases.get(aliasKey(chain, line.testo))
        const s = suggestProduct(describe(line), alias?.productCode, candidates)
        newRows.push({ line, product: s?.product ?? null, reason: s?.reason ?? null, ignored: line.peso_variabile })
      }
      setRows(newRows)
      setStoreId(suggestStore(receipt.negozio, stores, loc)?.id ?? '')
      setDate(receipt.data && /^\d{4}-\d{2}-\d{2}$/.test(receipt.data) ? receipt.data : todayIso())
      setPhase({ kind: 'review', previewUrl, receipt, costEur, stores: stores.slice(0, 80) })
    } catch (err) {
      toast((err as Error).message, { tone: 'error' })
      setPhase({ kind: 'pick' })
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const setRow = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)))

  const save = async () => {
    if (phase.kind !== 'review' || !storeId) return
    const store = phase.stores.find((s) => s.id === storeId)
    const chain = phase.receipt.negozio.catena
    let count = 0
    for (const r of rows) {
      if (r.ignored || !r.product || r.line.peso_variabile || !(r.line.prezzo_unitario > 0)) continue
      await saveProduct(r.product)
      await reportPrice({
        productCode: r.product.code,
        storeId,
        price: r.line.prezzo_unitario,
        observedAt: date,
        proofType: 'SCONTRINO',
        isDiscounted: r.line.sconto,
        conditions: r.line.sconto ? 'in promozione' : undefined,
      })
      await db.receiptAliases.put({ key: aliasKey(chain, r.line.testo), productCode: r.product.code, updatedAt: nowIso() })
      count++
    }
    setPhase({ kind: 'saved', count, storeName: store?.name ?? 'negozio', date })
  }

  if (!loc) {
    return (
      <div className="space-y-4">
        <PageHeader title="Leggi scontrino" back="/" />
        <section className="card space-y-3">
          <p className="muted">Indica la tua zona: serve per riconoscere il supermercato dello scontrino.</p>
          <LocationPicker />
        </section>
      </div>
    )
  }

  if (!hasKey) {
    return (
      <div className="space-y-4">
        <PageHeader title="Leggi scontrino" back="/" />
        <section className="card space-y-3">
          <h2 className="h2">Una configurazione, una volta sola</h2>
          <p className="muted">
            Lo scontrino viene letto da Claude (intelligenza artificiale di Anthropic) con una tua chiave API: paghi solo quello
            che usi, direttamente ad Anthropic.
          </p>
          <ApiKeySetup />
        </section>
      </div>
    )
  }

  if (phase.kind === 'saved') {
    return (
      <div className="space-y-4">
        <PageHeader title="Scontrino salvato" back="/" />
        <section className="card space-y-3 text-center">
          <Check size={40} className="mx-auto text-brand-700" />
          <p className="text-lg font-semibold">
            {phase.count} prezzi salvati per {phase.storeName}
          </p>
          <p className="muted">Scontrino del {fmtDate(phase.date)}. Le righe confermate verranno riconosciute da sole la prossima volta.</p>
          <div className="grid grid-cols-2 gap-2">
            <button className="btn-secondary" onClick={() => setPhase({ kind: 'pick' })}>
              <ReceiptText size={18} /> Un altro
            </button>
            <Link to="/confronta" className="btn-primary">
              Confronta
            </Link>
          </div>
        </section>
      </div>
    )
  }

  if (phase.kind === 'pick' || phase.kind === 'reading') {
    return (
      <div className="space-y-4">
        <PageHeader title="Leggi scontrino" back="/" />
        <section className="card space-y-3">
          <p className="muted">
            Fotografa lo scontrino intero, dritto e ben illuminato: l'app legge tutte le righe e salva i prezzi per quel negozio.
            Per scontrini molto lunghi, fai due foto.
          </p>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => void onFile(e.target.files?.[0])}
          />
          {phase.kind === 'reading' ? (
            <div className="flex items-center gap-3">
              <img src={phase.previewUrl} alt="" className="h-24 w-16 rounded-lg object-cover" />
              <p className="muted">Lettura in corso… può richiedere fino a un minuto.</p>
            </div>
          ) : (
            <button className="btn-primary h-14 w-full" onClick={() => fileRef.current?.click()}>
              <Camera size={20} /> Fotografa o scegli lo scontrino
            </button>
          )}
          <p className="text-xs text-stone-500">
            La foto viene inviata ad Anthropic solo per la lettura e non viene salvata nell'app. Prima di salvare puoi correggere
            ogni riga.
          </p>
        </section>
        <details className="card">
          <summary className="cursor-pointer font-semibold">Chiave API e modello</summary>
          <div className="mt-3">
            <ApiKeySetup compact />
          </div>
        </details>
      </div>
    )
  }

  // ---- Revisione ----
  const { receipt, stores, costEur } = phase
  const sum = receipt.righe.reduce((a, l) => a + l.prezzo_totale, 0)
  const mismatch = receipt.totale != null && Math.abs(sum - receipt.totale) > 0.05
  const toSave = rows.filter((r) => !r.ignored && r.product && !r.line.peso_variabile).length
  const store = stores.find((s) => s.id === storeId)

  return (
    <div className="space-y-4">
      <PageHeader title="Controlla lo scontrino" back="/" />

      <section className="card space-y-3">
        <p className="text-sm text-stone-600">
          Letto: <strong>{receipt.negozio.catena ?? 'insegna non leggibile'}</strong>
          {receipt.negozio.indirizzo && `, ${receipt.negozio.indirizzo}`}
          {receipt.negozio.citta && ` (${receipt.negozio.citta})`}
        </p>
        <label className="block">
          <span className="label">Supermercato</span>
          <select className="input" value={storeId} onChange={(e) => setStoreId(e.target.value)}>
            <option value="">Scegli il punto vendita</option>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} · {fmtKm(s.km)} {s.address && `· ${s.address}`}
              </option>
            ))}
          </select>
        </label>
        {!store && <p className="text-xs text-amber-800">Scegli il negozio: i prezzi vengono salvati per quel punto vendita.</p>}
        <label className="block">
          <span className="label">Data</span>
          <input className="input" type="date" value={date} max={todayIso()} onChange={(e) => setDate(e.target.value)} />
        </label>
        <p className="text-xs text-stone-500">
          {receipt.righe.length} righe · somma {fmtEur(sum)}
          {receipt.totale != null && ` · totale scontrino ${fmtEur(receipt.totale)}`} · costo lettura circa{' '}
          {costEur.toLocaleString('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 3 })}
        </p>
        {mismatch && (
          <p className="flex gap-1 text-xs text-amber-800">
            <AlertTriangle size={14} className="shrink-0" /> La somma delle righe non coincide con il totale: controlla prezzi e
            sconti qui sotto.
          </p>
        )}
      </section>

      <ul className="space-y-2">
        {rows.map((r, i) => (
          <li key={i} className={`card p-3 ${r.ignored ? 'opacity-50' : ''}`}>
            <div className="flex gap-2">
              <div className="min-w-0 flex-1">
                <p className="font-medium">{r.line.nome_probabile}</p>
                <p className="truncate font-mono text-xs text-stone-500">{r.line.testo}</p>
              </div>
              <div className="text-right">
                <p className="font-semibold tabular-nums">{fmtEur(r.line.prezzo_totale)}</p>
                <p className="text-xs text-stone-500">
                  {r.line.peso_variabile
                    ? `${r.line.quantita.toLocaleString('it-IT')} kg × ${fmtEur(r.line.prezzo_unitario)}/kg`
                    : r.line.quantita !== 1
                      ? `${r.line.quantita} × ${fmtEur(r.line.prezzo_unitario)}`
                      : ''}
                  {r.line.sconto && <span className="ml-1 text-rose-700">promo</span>}
                </p>
              </div>
            </div>
            {r.line.peso_variabile ? (
              <p className="mt-2 text-xs text-stone-500">Prodotto a peso: non entra nel confronto per confezione.</p>
            ) : (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {r.product ? (
                  <span className={`chip ${r.reason === 'simile' ? 'bg-amber-100 text-amber-900' : 'bg-brand-100 text-brand-800'}`}>
                    <Check size={12} /> {r.product.name}
                    {r.product.brand && ` · ${r.product.brand}`}
                    {r.reason === 'appreso' && ' (già confermato)'}
                    {r.reason === 'simile' && ' (da verificare)'}
                  </span>
                ) : (
                  <span className="chip bg-stone-100 text-stone-600">nessun prodotto collegato</span>
                )}
                <button className="btn-ghost py-1 text-sm" onClick={() => setPicker(i)}>
                  <Search size={14} /> {r.product ? 'Cambia' : 'Cerca'}
                </button>
                {!r.product && (
                  <button
                    className="btn-ghost py-1 text-sm"
                    onClick={() =>
                      setRow(i, {
                        product: userProduct(r.line.nome_probabile, undefined, r.line.marca ?? '', r.line.formato ?? ''),
                        reason: 'scelto',
                      })
                    }
                  >
                    <PackagePlus size={14} /> Nuovo
                  </button>
                )}
                <button className="btn-ghost py-1 text-sm" onClick={() => setRow(i, { ignored: !r.ignored })}>
                  {r.ignored ? <RotateCcw size={14} /> : <X size={14} />} {r.ignored ? 'Ripristina' : 'Ignora'}
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>

      <div className="sticky bottom-20 z-10">
        <button className="btn-primary h-12 w-full shadow-lg" disabled={!storeId || toSave === 0} onClick={save}>
          <Check size={20} /> Salva {toSave} prezzi
        </button>
      </div>
      <p className="text-xs text-stone-500">
        «Da verificare» = abbinamento automatico per somiglianza: controllalo. Le righe senza prodotto non vengono salvate; «Nuovo»
        crea un prodotto con il nome letto, utile per le tue liste.
      </p>

      {picker != null && (
        <ProductPicker
          title="Collega il prodotto"
          initialQuery={searchText(rows[picker].line)}
          onClose={() => setPicker(null)}
          onPick={(p) => {
            setRow(picker, { product: p, reason: 'scelto', ignored: false })
            setPicker(null)
          }}
        />
      )}
    </div>
  )
}
