import { useLiveQuery } from 'dexie-react-hooks'
import { useQuery } from '@tanstack/react-query'
import { RefreshCw } from 'lucide-react'
import { db } from '../lib/db'
import { useSettings } from '../lib/settings'
import { fetchStoresAround } from '../lib/api/osm'
import { haversineKm } from '../lib/geo'
import { fmtKm } from '../lib/units'
import { PageHeader } from '../components/ui'
import LocationPicker from '../components/LocationPicker'
import StoreMap from '../components/StoreMap'

export default function Stores() {
  const settings = useSettings()
  const loc = settings.location
  const q = useQuery({
    queryKey: ['stores', loc?.lat, loc?.lon, settings.storeRadiusKm],
    enabled: !!loc,
    queryFn: () => fetchStoresAround(loc!, settings.storeRadiusKm),
  })
  const stores = useLiveQuery(async () => {
    if (!loc) return []
    const all = await db.stores.toArray()
    const priceCounts = new Map<string, number>()
    await db.prices.each((p) => priceCounts.set(p.storeId, (priceCounts.get(p.storeId) ?? 0) + 1))
    return all
      .map((s) => ({ ...s, km: haversineKm(loc, s), prices: priceCounts.get(s.id) ?? 0 }))
      .filter((s) => s.km <= settings.storeRadiusKm)
      .sort((a, b) => a.km - b.km)
  }, [loc?.lat, loc?.lon, settings.storeRadiusKm, q.dataUpdatedAt])

  if (!loc) {
    return (
      <div className="space-y-4">
        <PageHeader title="Supermercati vicini" back="/" />
        <section className="card">
          <LocationPicker />
        </section>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Supermercati vicini"
        back="/"
        action={
          <button
            className="btn-ghost"
            aria-label="Aggiorna"
            disabled={q.isFetching}
            onClick={() => fetchStoresAround(loc, settings.storeRadiusKm, true).then(() => q.refetch())}
          >
            <RefreshCw size={20} className={q.isFetching ? 'animate-spin' : ''} />
          </button>
        }
      />
      {q.isFetching && !stores?.length && (
        <p className="muted">Cerco i supermercati vicini su OpenStreetMap… può richiedere fino a un minuto la prima volta.</p>
      )}
      {q.isError && <p className="text-sm text-amber-800">{(q.error as Error).message}</p>}
      <StoreMap
        home={loc}
        radiusKm={settings.storeRadiusKm}
        points={(stores ?? []).map((s) => ({ id: s.id, lat: s.lat, lon: s.lon, label: s.name, detail: s.address }))}
      />
      <p className="muted">
        {stores?.length ?? 0} negozi entro {settings.storeRadiusKm} km (dati OpenStreetMap, possono mancare dei punti vendita).
      </p>
      <ul className="space-y-2">
        {stores?.map((s) => (
          <li key={s.id} className="card flex items-center gap-3 p-3">
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{s.name}</p>
              <p className="truncate text-xs text-stone-500">{[s.brand !== s.name && s.brand, s.address].filter(Boolean).join(' · ')}</p>
            </div>
            <div className="text-right text-xs text-stone-500">
              <p className="font-semibold text-stone-800">{fmtKm(s.km)}</p>
              <p>{s.prices} prezzi noti</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
