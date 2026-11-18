import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, Car, ChevronDown, Fuel as FuelIcon, RefreshCw, Route, Scale } from 'lucide-react'
import { db } from '../lib/db'
import { useSettings } from '../lib/settings'
import { useTravelCost } from '../lib/hooks'
import { compareItemsForList, pricesFor, storesWithin } from '../lib/data'
import { fetchStoresAround, roadRoute } from '../lib/api/osm'
import { refreshOpenPrices } from '../lib/api/openprices'
import { planShopping, quoteStores, type CompareOptions, type Line, type Plan, type StoreQuote } from '../lib/compare'
import { fmtDate, fmtEur, fmtKm, fmtLitre, todayIso } from '../lib/units'
import { Empty, PageHeader, PriceStatusChip, Stat } from '../components/ui'
import LocationPicker from '../components/LocationPicker'
import StoreMap from '../components/StoreMap'

export default function Compare() {
  const settings = useSettings()
  const travel = useTravelCost(settings)
  const [params, setParams] = useSearchParams()
  const lists = useLiveQuery(() => db.lists.orderBy('updatedAt').reverse().toArray(), [])
  const listId = params.get('lista') ?? lists?.[0]?.id ?? ''
  const loc = settings.location

  // Dati della lista, negozi e prezzi dal database locale (si aggiornano da soli).
  const data = useLiveQuery(async () => {
    if (!listId || !loc) return null
    const { compareItems, unlinked, codes } = await compareItemsForList(listId)
    const stores = await storesWithin(loc, settings.storeRadiusKm, settings)
    const prices = await pricesFor(codes)
    return { compareItems, unlinked, codes, stores, prices }
  }, [listId, loc?.lat, loc?.lon, settings.storeRadiusKm, settings.excludedBrands.join('|')])

  // Aggiornamento da rete: negozi OpenStreetMap e prezzi Open Prices.
  const codesKey = data?.codes.join(',') ?? ''
  const refresh = useQuery({
    queryKey: ['refresh', loc?.lat, loc?.lon, settings.storeRadiusKm, codesKey],
    enabled: !!loc && !!data,
    queryFn: async () => {
      const errors: string[] = []
      await fetchStoresAround(loc!, settings.storeRadiusKm).catch((e: Error) => errors.push(e.message))
      await refreshOpenPrices(data!.codes, loc!, settings.storeRadiusKm).catch((e: Error) => errors.push(e.message))
      return { errors, at: new Date() }
    },
  })

  const opts: CompareOptions | null = loc
    ? {
        home: loc,
        today: todayIso(),
        maxStores: settings.maxStores,
        costPerKm: travel.costPerKm,
        costPerMinute: travel.costPerMinute,
        avgSpeedKmh: settings.avgSpeedKmh,
        roadFactor: settings.roadFactor,
        extraStopPenalty: settings.extraStopPenalty,
        minSavingForExtraStop: settings.minSavingForExtraStop,
        maxPriceAgeDays: settings.maxPriceAgeDays,
      }
    : null

  const result = useMemo(() => {
    if (!data || !opts) return null
    const quotes = quoteStores(data.compareItems, data.stores, data.prices, opts)
    const plans = planShopping(quotes, data.compareItems, opts)
    return { quotes, ...plans }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, JSON.stringify(opts)])

  if (!loc) {
    return (
      <div className="space-y-4">
        <PageHeader title="Confronta prezzi" />
        <section className="card space-y-3">
          <p className="muted">Indica da dove parti per trovare i supermercati vicini e calcolare i costi di spostamento.</p>
          <LocationPicker />
        </section>
      </div>
    )
  }

  if (lists && lists.length === 0) {
    return (
      <div className="space-y-4">
        <PageHeader title="Confronta prezzi" />
        <Empty icon={<Scale size={40} />} title="Prima crea una lista">
          <Link to="/liste" className="font-medium text-brand-700">
            Vai alle liste
          </Link>
        </Empty>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Confronta prezzi"
        action={
          <button className="btn-ghost" onClick={() => refresh.refetch()} disabled={refresh.isFetching} aria-label="Aggiorna prezzi">
            <RefreshCw size={20} className={refresh.isFetching ? 'animate-spin' : ''} />
          </button>
        }
      />

      <select className="input" value={listId} onChange={(e) => setParams({ lista: e.target.value })} aria-label="Lista">
        {lists?.map((l) => (
          <option key={l.id} value={l.id}>
            {l.name}
          </option>
        ))}
      </select>

      <TravelCard travel={travel} />

      {refresh.isFetching && (
        <p className="muted">Cerco supermercati e prezzi aggiornati… la prima volta può richiedere fino a un minuto.</p>
      )}
      {refresh.data?.errors.map((e) => (
        <p key={e} className="text-sm text-amber-800">
          <AlertTriangle size={14} className="inline" /> {e}
        </p>
      ))}

      {data && data.compareItems.length === 0 && (
        <Empty icon={<Scale size={40} />} title="Nessun prodotto da confrontare">
          Il confronto usa i prodotti con codice a barre ancora da prendere. Le voci libere vanno collegate a un prodotto
          dalla lista.
        </Empty>
      )}

      {data && result && data.compareItems.length > 0 && (
        <>
          {result.best ? (
            <PlanCard plan={result.best} single={result.bestSingle} items={data.compareItems.length} home={loc} travel={travel} opts={opts!} />
          ) : (
            !refresh.isFetching && (
              <Empty icon={<AlertTriangle size={36} />} title="Nessun prezzo disponibile">
                Per questi prodotti non ci sono prezzi recenti nei {data.stores.length} negozi entro {settings.storeRadiusKm} km.
                I prezzi arrivano da Open Prices (community) e dai prezzi che registri durante la spesa: non vengono mai
                inventati.
              </Empty>
            )
          )}
          <StoreTable quotes={result.quotes} items={data.compareItems.length} costPerKm={travel.costPerKm} />
        </>
      )}

      {data && data.unlinked.length > 0 && (
        <p className="text-xs text-stone-500">
          Esclusi dal confronto ({data.unlinked.length} voci libere senza prodotto): {data.unlinked.map((u) => u.description).join(', ')}.
        </p>
      )}
      <p className="text-xs text-stone-500">
        Stima indicativa. Prezzi: Open Prices (Open Food Facts, ODbL) e tuoi rilievi; possono cambiare per offerte con
        tessera, peso effettivo e arrotondamenti. Distanze stimate in linea d'aria × {settings.roadFactor.toLocaleString('it-IT')}.
        Prezzi più vecchi di {settings.maxPriceAgeDays} giorni sono considerati scaduti.
      </p>
    </div>
  )
}

function TravelCard({ travel }: { travel: ReturnType<typeof useTravelCost> }) {
  const settings = useSettings()
  return (
    <Link to="/carburante" className="card flex items-start gap-3 py-3">
      <FuelIcon size={20} className="mt-0.5 shrink-0 text-brand-700" />
      <div className="flex-1 text-sm">
        {travel.isLoading ? (
          <p className="muted">Calcolo costo carburante…</p>
        ) : travel.pricePerLitre ? (
          <>
            <p>
              Spostamenti: <strong>{fmtEur(travel.costPerKm)}/km</strong> ({fmtLitre(travel.pricePerLitre)} ÷ {settings.kmPerLitre} km/l)
            </p>
            <p className="text-xs text-stone-500">{travel.description}</p>
          </>
        ) : (
          <p className="text-amber-800">{travel.description}</p>
        )}
      </div>
    </Link>
  )
}

function PlanCard({
  plan,
  single,
  items,
  home,
  travel,
  opts,
}: {
  plan: Plan
  single: Plan | null
  items: number
  home: { lat: number; lon: number }
  travel: ReturnType<typeof useTravelCost>
  opts: CompareOptions
}) {
  const [road, setRoad] = useState<{ km: number; minutes: number; line: [number, number][] } | null>(null)
  const [roadError, setRoadError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const planKey = plan.stores.map((s) => s.id).join('|')
  useEffect(() => {
    setRoad(null)
    setRoadError(null)
  }, [planKey])

  const travelKm = road?.km ?? plan.travelKm
  const travelMinutes = road?.minutes ?? plan.travelMinutes
  const travelCost = road ? road.km * opts.costPerKm + road.minutes * opts.costPerMinute : plan.travelCost
  const total = plan.productCost + travelCost + plan.penalty
  const saving = single && plan.stores.length > 1 && single.coverage === plan.coverage ? single.total - plan.total : null

  const computeRoad = async () => {
    setBusy(true)
    setRoadError(null)
    try {
      setRoad(await roadRoute([home, ...plan.stores, home]))
    } catch (e) {
      setRoadError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card space-y-3 border-brand-200">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">Piano consigliato</p>
        <h2 className="h2">
          {plan.stores.length === 1 ? `Tutto da ${plan.stores[0].name}` : `${plan.stores.length} negozi`}
        </h2>
        <p className="muted">
          {plan.coverage} di {items} prodotti con prezzo
          {plan.missing.length > 0 && ` · mancano: ${plan.missing.map((m) => m.itemName).join(', ')}`}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Stat label="Prodotti" value={fmtEur(plan.productCost)} />
        <Stat label="Spostamento" value={fmtEur(travelCost)} hint={`${fmtKm(travelKm)} · ${Math.round(travelMinutes)} min`} />
        <Stat label="Totale" value={fmtEur(total)} />
      </div>
      {saving != null && saving > 0 && (
        <p className="rounded-xl bg-brand-50 p-2 text-sm text-brand-800">
          Risparmi circa <strong>{fmtEur(saving)}</strong> rispetto a fare tutto da {single!.stores[0].name}, spostamenti inclusi.
        </p>
      )}

      <ol className="space-y-3">
        {plan.stores.map((s, idx) => {
          const lines = plan.lines.filter((l) => l.storeId === s.id)
          return (
            <li key={s.id}>
              <p className="font-semibold">
                {idx + 1}. {s.name}
                <span className="ml-2 text-sm font-normal text-stone-500">{fmtEur(lines.reduce((a, l) => a + l.cost, 0))}</span>
              </p>
              <LineList lines={lines} />
            </li>
          )
        })}
      </ol>

      <StoreMap
        home={home}
        points={plan.stores.map((s, i) => ({ id: s.id, lat: s.lat, lon: s.lon, label: `${i + 1}. ${s.name}` }))}
        route={road?.line ?? [[home.lat, home.lon], ...plan.stores.map((s) => [s.lat, s.lon] as [number, number]), [home.lat, home.lon]]}
        height={240}
      />
      <button className="btn-secondary w-full" onClick={computeRoad} disabled={busy || !!road}>
        <Route size={18} /> {road ? 'Percorso stradale calcolato (indicativo)' : busy ? 'Calcolo…' : 'Calcola percorso stradale'}
      </button>
      {roadError && <p className="text-sm text-amber-800">{roadError}. Resta valida la stima in linea d'aria.</p>}
      {!travel.pricePerLitre && (
        <p className="text-xs text-amber-800">
          <Car size={14} className="inline" /> Costo carburante non disponibile: imposta il prezzo nel profilo.
        </p>
      )}
    </section>
  )
}

function LineList({ lines }: { lines: Line[] }) {
  return (
    <ul className="mt-1 space-y-1">
      {lines.map((l) => (
        <li key={l.itemId} className="text-sm">
          <div className="flex gap-2">
            <span className="flex-1 truncate">{l.itemName}</span>
            <span className="tabular-nums">{fmtEur(l.cost)}</span>
          </div>
          <div className="flex flex-wrap items-center gap-1 text-xs text-stone-500">
            <PriceStatusChip status={l.status} source={l.source} />
            {l.match === 'equivalente' && <span className="chip bg-sky-100 text-sky-800">equivalente</span>}
            {l.scaled && <span className="chip bg-sky-50 text-sky-700">riportato al formato</span>}
            {l.formatUnknown && <span className="chip bg-stone-100">formato da verificare</span>}
            {l.isDiscounted && <span className="chip bg-rose-100 text-rose-800">{l.conditions ?? 'promozione'}</span>}
            <span>del {fmtDate(l.observedAt)}</span>
          </div>
        </li>
      ))}
    </ul>
  )
}

function StoreTable({ quotes, items, costPerKm }: { quotes: StoreQuote[]; items: number; costPerKm: number }) {
  const [open, setOpen] = useState<string | null>(null)
  const withPrices = quotes
    .filter((q) => q.coverage > 0 || q.expired > 0)
    .sort((a, b) => b.coverage - a.coverage || a.total + a.oneWayKm * 2 * costPerKm - (b.total + b.oneWayKm * 2 * costPerKm))
  const without = quotes.length - withPrices.length
  if (!withPrices.length) return null
  return (
    <section className="space-y-2">
      <h2 className="h2">Per negozio</h2>
      {withPrices.map((q) => (
        <div key={q.store.id} className="card p-3">
          <button className="flex w-full items-center gap-2 text-left" onClick={() => setOpen(open === q.store.id ? null : q.store.id)}>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{q.store.name}</p>
              <p className="text-xs text-stone-500">
                {fmtKm(q.oneWayKm)} · {q.coverage}/{items} prodotti
                {q.expired > 0 && ` · ${q.expired} prezzi scaduti`}
              </p>
            </div>
            <div className="text-right">
              <p className="font-semibold tabular-nums">{fmtEur(q.total)}</p>
              <p className="text-xs text-stone-500">+ {fmtEur(q.oneWayKm * 2 * costPerKm)} viaggio</p>
            </div>
            <ChevronDown size={18} className={`text-stone-400 transition ${open === q.store.id ? 'rotate-180' : ''}`} />
          </button>
          {open === q.store.id && (
            <div className="mt-2 border-t border-black/5 pt-2">
              <LineList lines={q.lines} />
              {q.missing.length > 0 && (
                <p className="mt-2 text-xs text-stone-500">Prezzo non disponibile: {q.missing.map((m) => m.itemName).join(', ')}</p>
              )}
            </div>
          )}
        </div>
      ))}
      {without > 0 && (
        <p className="text-xs text-stone-500">
          Altri {without} negozi nel raggio non hanno ancora prezzi per questi prodotti. Puoi aggiungerli tu durante la spesa.
        </p>
      )}
    </section>
  )
}
