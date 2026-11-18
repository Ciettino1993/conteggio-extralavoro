import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { useQuery } from '@tanstack/react-query'
import { CheckCircle2, Flag, ListPlus, Minus, Plus, ReceiptText, ScanBarcode, Search, Store as StoreIcon, Trash2 } from 'lucide-react'
import { db, type Product, type SessionItem, type ShoppingSession } from '../lib/db'
import { useSettings } from '../lib/settings'
import {
  addProductToList,
  addScanToSession,
  endSession,
  removeSessionItem,
  sessionTotals,
  setShelfPrice,
  startSession,
  userProduct,
} from '../lib/data'
import { lookupBarcode } from '../lib/api/openfoodfacts'
import { fetchStoresAround } from '../lib/api/osm'
import { haversineKm } from '../lib/geo'
import { fmtDate, fmtEur, fmtKm } from '../lib/units'
import BarcodeScanner from '../components/BarcodeScanner'
import ProductPicker from '../components/ProductPicker'
import { PageHeader } from '../components/ui'
import { useToast } from '../components/Toast'

export default function SessionPage() {
  const session = useLiveQuery(
    async () => (await db.sessions.orderBy('startedAt').filter((s) => !s.endedAt).last()) ?? null,
    [],
  )
  if (session === undefined) return null
  return session ? <ActiveSession session={session} /> : <StartSession />
}

function StartSession() {
  const settings = useSettings()
  const [params] = useSearchParams()
  const lists = useLiveQuery(() => db.lists.orderBy('updatedAt').reverse().toArray(), [])
  const [listId, setListId] = useState(params.get('lista') ?? '')
  const [storeId, setStoreId] = useState('')
  const [manualName, setManualName] = useState('')
  const loc = settings.location

  useEffect(() => {
    if (!listId && lists?.length && !params.get('lista')) setListId(lists[0].id)
  }, [lists, listId, params])

  const storesQuery = useQuery({
    queryKey: ['stores', loc?.lat, loc?.lon, settings.storeRadiusKm],
    enabled: !!loc,
    queryFn: () => fetchStoresAround(loc!, settings.storeRadiusKm),
  })
  const stores = useLiveQuery(async () => {
    if (!loc) return []
    const all = await db.stores.toArray()
    return all
      .map((s) => ({ ...s, km: haversineKm(loc, s) }))
      .filter((s) => s.km <= settings.storeRadiusKm)
      .sort((a, b) => a.km - b.km)
      .slice(0, 40)
  }, [loc?.lat, loc?.lon, settings.storeRadiusKm, storesQuery.dataUpdatedAt])

  const start = async () => {
    const store = stores?.find((s) => s.id === storeId)
    await startSession({
      listId: listId || undefined,
      storeId: store?.id,
      storeName: store?.name ?? (manualName.trim() || 'Negozio'),
    })
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Fare la spesa" />
      <section className="card space-y-3">
        <label className="block">
          <span className="label">Lista da seguire</span>
          <select className="input" value={listId} onChange={(e) => setListId(e.target.value)}>
            <option value="">Nessuna lista</option>
            {lists?.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="label">Supermercato</span>
          <select className="input" value={storeId} onChange={(e) => setStoreId(e.target.value)}>
            <option value="">{loc ? (storesQuery.isFetching ? 'Cerco negozi vicini…' : 'Scegli un negozio') : 'Imposta prima la posizione'}</option>
            {stores?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} · {fmtKm(s.km)} {s.address && `· ${s.address}`}
              </option>
            ))}
            <option value="__altro">Altro (scrivo il nome)</option>
          </select>
        </label>
        {storeId === '__altro' && (
          <input className="input" placeholder="Nome del negozio" value={manualName} onChange={(e) => setManualName(e.target.value)} />
        )}
        {storeId === '__altro' && (
          <p className="text-xs text-stone-500">
            Con un negozio scritto a mano i prezzi rilevati non vengono usati nel confronto (manca la posizione).
          </p>
        )}
        <button className="btn-primary w-full" onClick={start} disabled={!storeId || (storeId === '__altro' && !manualName.trim())}>
          <ScanBarcode size={20} /> Inizia la spesa
        </button>
        {!loc && (
          <p className="text-sm">
            <Link to="/profilo" className="font-medium text-brand-700">
              Imposta la posizione
            </Link>{' '}
            per vedere i negozi vicini.
          </p>
        )}
      </section>
      <Link to="/scontrino" className="card flex items-center gap-3">
        <ReceiptText className="text-brand-700" />
        <span className="flex-1">
          <span className="block font-medium">Hai già fatto la spesa?</span>
          <span className="muted">Fotografa lo scontrino: salva tutti i prezzi in un colpo.</span>
        </span>
      </Link>
      <PastSessions />
    </div>
  )
}

function PastSessions() {
  const past = useLiveQuery(
    () => db.sessions.orderBy('startedAt').reverse().filter((s) => !!s.endedAt).limit(5).toArray(),
    [],
  )
  if (!past?.length) return null
  return (
    <section className="card">
      <h2 className="h2 mb-2">Spese recenti</h2>
      <ul className="divide-y divide-black/5 text-sm">
        {past.map((s) => (
          <li key={s.id} className="flex justify-between py-2">
            <span>
              {fmtDate(s.startedAt)} · {s.storeName}
            </span>
            <span className="tabular-nums">{s.paidTotal != null ? fmtEur(s.paidTotal) : ''}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

function ActiveSession({ session }: { session: ShoppingSession }) {
  const settings = useSettings()
  const toast = useToast()
  const [scanning, setScanning] = useState(true)
  const [busy, setBusy] = useState(false)
  const [picker, setPicker] = useState(false)
  const [unknown, setUnknown] = useState<string | null>(null)
  const [unknownName, setUnknownName] = useState('')
  const [closing, setClosing] = useState(false)
  const [paid, setPaid] = useState('')

  const items = useLiveQuery(() => db.sessionItems.where({ sessionId: session.id }).reverse().sortBy('scannedAt'), [session.id])
  const remaining = useLiveQuery(
    async () => (session.listId ? db.listItems.where({ listId: session.listId }).filter((i) => !i.isPurchased).toArray() : []),
    [session.listId],
  )
  const list = useLiveQuery(async () => (session.listId ? db.lists.get(session.listId) : undefined), [session.listId])
  const totals = sessionTotals(items ?? [])

  const addProduct = async (p: Product) => {
    const r = await addScanToSession(session.id, p, settings.maxPriceAgeDays)
    if (r.increased) toast(`${p.name}: quantità ${r.item.quantity}`, { tone: 'ok' })
    else if (r.inList) toast(`✓ ${p.name} (dalla lista)`, { tone: 'ok' })
    else if (session.listId) {
      toast(`${p.name} non era in lista`, {
        action: { label: 'Aggiungi alla lista', run: () => void addProductToList(session.listId!, p).then(() => db.listItems.where({ listId: session.listId! }).filter((i) => i.productCode === p.code).modify({ isPurchased: 1 })) },
      })
    } else toast(`Aggiunto: ${p.name}`, { tone: 'ok' })
  }

  const onCode = async (code: string) => {
    if (busy) return
    setBusy(true)
    try {
      const p = await lookupBarcode(code)
      if (p) await addProduct(p)
      else {
        setUnknown(code)
        setScanning(false)
      }
    } catch (e) {
      toast(`${(e as Error).message}. Puoi inserire il prodotto a mano.`, { tone: 'error' })
      setUnknown(code)
      setScanning(false)
    } finally {
      setBusy(false)
    }
  }

  const close = async () => {
    const v = paid.trim() ? Number(paid.replace(',', '.')) : undefined
    await endSession(session.id, v != null && Number.isFinite(v) ? v : undefined)
    toast('Spesa conclusa', { tone: 'ok' })
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Spesa in corso" />
      <div className="flex items-center gap-2 text-sm text-stone-600">
        <StoreIcon size={16} className="text-brand-700" /> {session.storeName}
        {list && <span>· lista «{list.name}»</span>}
      </div>

      <section className="sticky top-0 z-10 -mx-4 bg-paper/95 px-4 py-2 backdrop-blur">
        <div className="card flex items-center justify-between py-3">
          <div>
            <p className="text-xs text-stone-500">Totale stimato</p>
            <p className="text-2xl font-bold tabular-nums">{fmtEur(totals.estimated)}</p>
          </div>
          <div className="text-right text-xs text-stone-500">
            <p>{items?.length ?? 0} articoli</p>
            {totals.withoutPrice > 0 && <p className="text-amber-700">{totals.withoutPrice} senza prezzo</p>}
            {totals.expected > 0 && <p>prezzi attesi: {fmtEur(totals.expected)}</p>}
          </div>
        </div>
      </section>

      {scanning ? (
        <BarcodeScanner onCode={onCode} paused={busy || !!unknown} />
      ) : (
        <button className="btn-primary w-full" onClick={() => setScanning(true)}>
          <ScanBarcode size={20} /> Riprendi scansione
        </button>
      )}
      <button className="btn-secondary w-full" onClick={() => setPicker(true)}>
        <Search size={18} /> Cerca prodotto senza codice
      </button>

      {unknown && (
        <form
          className="card space-y-2 border-amber-300 bg-amber-50"
          onSubmit={async (e) => {
            e.preventDefault()
            if (!unknownName.trim()) return
            await addProduct(userProduct(unknownName, unknown))
            setUnknown(null)
            setUnknownName('')
            setScanning(true)
          }}
        >
          <p className="text-sm">
            Codice <strong>{unknown}</strong> sconosciuto. Scrivi il nome del prodotto (resterà «da verificare»).
          </p>
          <input className="input" autoFocus value={unknownName} onChange={(e) => setUnknownName(e.target.value)} placeholder="Nome prodotto" />
          <div className="flex gap-2">
            <button className="btn-primary flex-1">Aggiungi</button>
            <button type="button" className="btn-secondary" onClick={() => { setUnknown(null); setScanning(true) }}>
              Annulla
            </button>
          </div>
        </form>
      )}

      <section className="space-y-2">
        <h2 className="h2">Nel carrello</h2>
        {items?.length === 0 && <p className="muted">Inquadra il codice a barre del primo prodotto.</p>}
        <ul className="space-y-2">
          {items?.map((it) => <CartRow key={it.id} item={it} storeKnown={!!session.storeId} />)}
        </ul>
      </section>

      {remaining && remaining.length > 0 && (
        <section className="card">
          <h2 className="h2 mb-2 flex items-center gap-2">
            <ListPlus size={18} /> Ancora da prendere ({remaining.length})
          </h2>
          <ul className="space-y-1 text-sm">
            {remaining.map((r) => (
              <li key={r.id} className="flex items-center gap-2">
                <button
                  className="h-5 w-5 rounded-full border-2 border-stone-300"
                  aria-label={`Segna come preso: ${r.description}`}
                  onClick={() => db.listItems.update(r.id, { isPurchased: 1 })}
                />
                {r.quantity > 1 && `${r.quantity}× `}
                {r.description}
              </li>
            ))}
          </ul>
        </section>
      )}

      <Link to="/scontrino" className="btn-ghost w-full text-sm">
        <ReceiptText size={16} /> Alla cassa: leggi lo scontrino per salvare i prezzi pagati
      </Link>

      {closing ? (
        <section className="card space-y-2">
          <label className="block">
            <span className="label">Totale pagato allo scontrino (facoltativo)</span>
            <input className="input" inputMode="decimal" placeholder="Es. 54,30" value={paid} onChange={(e) => setPaid(e.target.value)} />
          </label>
          {paid && Number.isFinite(Number(paid.replace(',', '.'))) && (
            <p className="text-sm text-stone-600">
              Differenza rispetto alla stima: {fmtEur(Number(paid.replace(',', '.')) - totals.estimated)}
            </p>
          )}
          <div className="flex gap-2">
            <button className="btn-primary flex-1" onClick={close}>
              <CheckCircle2 size={18} /> Concludi
            </button>
            <button className="btn-secondary" onClick={() => setClosing(false)}>
              Indietro
            </button>
          </div>
        </section>
      ) : (
        <button className="btn-secondary w-full" onClick={() => setClosing(true)}>
          <Flag size={18} /> Termina la spesa
        </button>
      )}
      <p className="text-xs text-stone-500">
        Il totale è una stima: può cambiare per peso effettivo, offerte con tessera, coupon e arrotondamenti. I prezzi a
        scaffale che inserisci restano «segnalati» e aiutano i confronti futuri.
      </p>

      {picker && (
        <ProductPicker
          title="Aggiungi al carrello"
          onClose={() => setPicker(false)}
          onPick={async (p) => {
            await addProduct(p)
            setPicker(false)
          }}
        />
      )}
    </div>
  )
}

function CartRow({ item, storeKnown }: { item: SessionItem; storeKnown: boolean }) {
  const [price, setPrice] = useState(item.shelfPrice != null ? String(item.shelfPrice).replace('.', ',') : '')
  const savePrice = async () => {
    const v = price.trim() ? Number(price.replace(',', '.')) : undefined
    if (v !== undefined && (!Number.isFinite(v) || v < 0 || v > 1000)) return
    if (v !== item.shelfPrice) await setShelfPrice(item.id, v)
  }
  const diff = item.shelfPrice != null && item.expectedPrice != null ? item.shelfPrice - item.expectedPrice : null
  return (
    <li className="card p-3">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{item.name}</p>
          <p className="text-xs text-stone-500">
            {item.listItemId ? 'dalla lista' : 'fuori lista'} · atteso {fmtEur(item.expectedPrice)}
            {diff != null && Math.abs(diff) >= 0.01 && (
              <span className={diff > 0 ? 'text-red-700' : 'text-brand-700'}> ({diff > 0 ? '+' : ''}{fmtEur(diff)})</span>
            )}
          </p>
        </div>
        <button className="btn-ghost h-8 w-8 p-0 text-stone-400" onClick={() => removeSessionItem(item.id)} aria-label="Rimuovi">
          <Trash2 size={16} />
        </button>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <div className="flex items-center gap-1">
          <button
            className="btn-secondary h-9 w-9 p-0"
            onClick={() => item.quantity > 1 && db.sessionItems.update(item.id, { quantity: item.quantity - 1 })}
            aria-label="Diminuisci"
          >
            <Minus size={16} />
          </button>
          <span className="w-7 text-center font-semibold tabular-nums">{item.quantity}</span>
          <button className="btn-secondary h-9 w-9 p-0" onClick={() => db.sessionItems.update(item.id, { quantity: item.quantity + 1 })} aria-label="Aumenta">
            <Plus size={16} />
          </button>
        </div>
        <label className="flex flex-1 items-center gap-1">
          <span className="whitespace-nowrap text-xs text-stone-500">Prezzo €</span>
          <input
            className="input py-1.5"
            inputMode="decimal"
            placeholder={item.expectedPrice != null ? String(item.expectedPrice).replace('.', ',') : '0,00'}
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            onBlur={savePrice}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            aria-label={`Prezzo a scaffale di ${item.name}`}
          />
        </label>
      </div>
      {!storeKnown && item.shelfPrice != null && (
        <p className="mt-1 text-xs text-stone-500">Negozio senza posizione: il prezzo vale solo per questa spesa.</p>
      )}
    </li>
  )
}
