import { Link } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronRight, Fuel as FuelIcon, ListChecks, MapPin, ReceiptText, Scale, ScanBarcode, Store } from 'lucide-react'
import { db } from '../lib/db'
import { useSettings } from '../lib/settings'
import { useFuelData } from '../lib/hooks'
import { fuelStats } from '../lib/fuel'
import { fmtDate, fmtEur, fmtLitre, todayIso } from '../lib/units'
import { sessionTotals } from '../lib/data'
import LocationPicker from '../components/LocationPicker'

export default function Home() {
  const settings = useSettings()
  const lists = useLiveQuery(() => db.lists.orderBy('updatedAt').reverse().limit(3).toArray(), [])
  const counts = useLiveQuery(async () => {
    const all = await db.listItems.toArray()
    const map = new Map<string, { total: number; done: number }>()
    for (const i of all) {
      const c = map.get(i.listId) ?? { total: 0, done: 0 }
      c.total++
      if (i.isPurchased) c.done++
      map.set(i.listId, c)
    }
    return map
  }, [])
  const session = useLiveQuery(async () => {
    const s = await db.sessions.orderBy('startedAt').filter((x) => !x.endedAt).last()
    if (!s) return null
    const items = await db.sessionItems.where({ sessionId: s.id }).toArray()
    return { ...s, totals: sessionTotals(items), count: items.length }
  }, [])

  return (
    <div className="space-y-4">
      <header className="flex items-center gap-3 pt-2">
        <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" className="h-10 w-10" />
        <div>
          <h1 className="h1">SpesaSmart</h1>
          <p className="muted">Lista, confronto prezzi e costo degli spostamenti</p>
        </div>
      </header>

      {!settings.location ? (
        <section className="card space-y-3">
          <h2 className="h2 flex items-center gap-2">
            <MapPin size={20} className="text-brand-700" /> Da dove parti?
          </h2>
          <p className="muted">
            Serve per trovare i supermercati vicini e il prezzo medio di benzina e diesel nei distributori entro{' '}
            {settings.fuelRadiusKm} km.
          </p>
          <LocationPicker />
        </section>
      ) : (
        <Link to="/profilo" className="flex items-center gap-2 text-sm text-stone-600">
          <MapPin size={16} className="text-brand-700" />
          <span className="truncate">{settings.location.label}</span>
          <span className="text-brand-700">· cambia</span>
        </Link>
      )}

      {session && (
        <Link to="/spesa" className="card flex items-center gap-3 border-brand-200 bg-brand-50">
          <ScanBarcode className="text-brand-700" />
          <div className="flex-1">
            <p className="font-semibold">Spesa in corso · {session.storeName}</p>
            <p className="muted">
              {session.count} articoli · totale stimato {fmtEur(session.totals.estimated)}
            </p>
          </div>
          <ChevronRight className="text-stone-400" />
        </Link>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Link to="/spesa" className="btn-primary h-14">
          <ScanBarcode size={20} /> {session ? 'Continua spesa' : 'Inizia spesa'}
        </Link>
        <Link to="/confronta" className="btn-secondary h-14">
          <Scale size={20} /> Confronta
        </Link>
        <Link to="/scontrino" className="btn-secondary col-span-2 h-12">
          <ReceiptText size={20} /> Leggi uno scontrino (salva tutti i prezzi in un colpo)
        </Link>
      </div>

      {settings.location && <FuelCard />}

      <section className="card space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="h2 flex items-center gap-2">
            <ListChecks size={20} className="text-brand-700" /> Le tue liste
          </h2>
          <Link to="/liste" className="text-sm font-medium text-brand-700">
            Tutte
          </Link>
        </div>
        {lists?.length ? (
          <ul className="divide-y divide-black/5">
            {lists.map((l) => {
              const c = counts?.get(l.id)
              return (
                <li key={l.id}>
                  <Link to={`/liste/${l.id}`} className="flex items-center justify-between py-2">
                    <span className="font-medium">{l.name}</span>
                    <span className="muted">
                      {c ? `${c.done}/${c.total}` : '0'} <ChevronRight size={16} className="inline" />
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="muted">
            Nessuna lista. <Link to="/liste" className="font-medium text-brand-700">Creane una</Link>.
          </p>
        )}
      </section>

      {settings.location && (
        <Link to="/negozi" className="card flex items-center gap-3">
          <Store className="text-brand-700" />
          <span className="flex-1 font-medium">Supermercati vicini (entro {settings.storeRadiusKm} km)</span>
          <ChevronRight className="text-stone-400" />
        </Link>
      )}
    </div>
  )
}

function FuelCard() {
  const settings = useSettings()
  const { data, isLoading, isError } = useFuelData(settings)
  const ref = data?.meta?.extraction ?? todayIso()
  const benzina = data ? fuelStats(data.stations, 'benzina', { refDate: ref, self: settings.useSelfService }) : null
  const gasolio = data ? fuelStats(data.stations, 'gasolio', { refDate: ref, self: settings.useSelfService }) : null
  return (
    <Link to="/carburante" className="card block space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="h2 flex items-center gap-2">
          <FuelIcon size={20} className="text-brand-700" /> Carburante entro {settings.fuelRadiusKm} km
        </h2>
        <ChevronRight className="text-stone-400" />
      </div>
      {isLoading ? (
        <p className="muted">Caricamento prezzi…</p>
      ) : isError || !data?.meta ? (
        <p className="muted">Prezzi carburante non disponibili al momento.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-stone-500">Benzina {settings.useSelfService ? 'self' : 'servito'} (media)</p>
              <p className="text-xl font-bold tabular-nums">{fmtLitre(benzina?.avg)}</p>
            </div>
            <div>
              <p className="text-xs text-stone-500">Diesel {settings.useSelfService ? 'self' : 'servito'} (media)</p>
              <p className="text-xl font-bold tabular-nums">{fmtLitre(gasolio?.avg)}</p>
            </div>
          </div>
          <p className="text-xs text-stone-500">
            {data.stations.length} distributori · dati MIMIT del {fmtDate(data.meta.extraction)}
          </p>
        </>
      )}
    </Link>
  )
}
