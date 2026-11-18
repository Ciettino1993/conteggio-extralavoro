import { useState } from 'react'
import { Link } from 'react-router'
import { useSettings } from '../lib/settings'
import { useFuelData, useTravelCost } from '../lib/hooks'
import { FUEL_LABEL, FUEL_MAX_AGE_DAYS, fuelStats, priceKey, type FuelKind } from '../lib/fuel'
import { daysBetween, fmtDate, fmtEur, fmtKm, fmtLitre, todayIso } from '../lib/units'
import { PageHeader, Stat } from '../components/ui'
import LocationPicker from '../components/LocationPicker'
import StoreMap from '../components/StoreMap'

export default function Fuel() {
  const settings = useSettings()
  const { data, isLoading, isError } = useFuelData(settings)
  const travel = useTravelCost(settings)
  const [kind, setKind] = useState<FuelKind>(settings.fuelType)
  const [sort, setSort] = useState<'prezzo' | 'distanza'>('prezzo')
  const loc = settings.location

  if (!loc) {
    return (
      <div className="space-y-4">
        <PageHeader title="Carburante" back="/" />
        <section className="card">
          <LocationPicker />
        </section>
      </div>
    )
  }

  const ref = data?.meta?.extraction ?? todayIso()
  const self = settings.useSelfService
  const stats = { benzina: null, gasolio: null } as Record<FuelKind, ReturnType<typeof fuelStats> | null>
  if (data) for (const k of ['benzina', 'gasolio'] as FuelKind[]) stats[k] = fuelStats(data.stations, k, { refDate: ref, self })
  const key = priceKey(kind, self)
  const rows = (data?.stations ?? [])
    .filter((s) => s.p[key] && daysBetween(s.p[key]![1], ref) <= FUEL_MAX_AGE_DAYS)
    .sort((a, b) => (sort === 'prezzo' ? a.p[key]![0] - b.p[key]![0] : a.distanceKm - b.distanceKm))

  return (
    <div className="space-y-4">
      <PageHeader title="Carburante" back="/" />
      <p className="muted">
        Prezzi medi nei distributori entro <strong>{settings.fuelRadiusKm} km</strong> da {loc.label}, modalità{' '}
        {self ? 'self service' : 'servito'}.
      </p>

      {isLoading && <p className="muted">Caricamento…</p>}
      {(isError || (data && !data.meta)) && (
        <p className="card text-sm text-amber-800">
          Dati carburante non disponibili. Puoi inserire un prezzo a mano nel <Link to="/profilo" className="underline">profilo</Link>.
        </p>
      )}

      {data?.meta && (
        <>
          <div className="grid grid-cols-2 gap-3">
            {(['benzina', 'gasolio'] as FuelKind[]).map((k) => (
              <button
                key={k}
                onClick={() => setKind(k)}
                className={`card text-left ${kind === k ? 'ring-2 ring-brand-600' : ''}`}
                aria-pressed={kind === k}
              >
                <p className="text-sm font-semibold">{k === 'benzina' ? 'Benzina' : 'Diesel'}</p>
                <p className="text-2xl font-bold tabular-nums">{fmtLitre(stats[k]?.avg)}</p>
                <p className="text-xs text-stone-500">
                  {stats[k]?.count ? `min ${fmtLitre(stats[k]!.min)} · max ${fmtLitre(stats[k]!.max)}` : 'nessun dato recente'}
                </p>
                <p className="text-xs text-stone-500">{stats[k]?.count ?? 0} distributori</p>
              </button>
            ))}
          </div>

          <section className="card space-y-2">
            <h2 className="h2">Costo degli spostamenti</h2>
            {travel.pricePerLitre ? (
              <>
                <div className="grid grid-cols-3 gap-2">
                  <Stat label="Prezzo usato" value={fmtLitre(travel.pricePerLitre)} />
                  <Stat label="Consumo" value={`${settings.kmPerLitre} km/l`} />
                  <Stat label="Costo" value={`${fmtEur(travel.costPerKm)}/km`} />
                </div>
                <p className="text-xs text-stone-500">
                  {travel.description}. Andata e ritorno per un negozio a 3 km: circa {fmtEur(6 * settings.roadFactor * travel.costPerKm)}.
                </p>
              </>
            ) : (
              <p className="text-sm text-amber-800">{travel.description}</p>
            )}
            <Link to="/profilo" className="text-sm font-medium text-brand-700">
              Cambia carburante, consumo o raggio
            </Link>
          </section>

          <StoreMap
            home={loc}
            radiusKm={settings.fuelRadiusKm}
            points={rows.slice(0, 60).map((s) => ({
              id: String(s.i),
              lat: s.la,
              lon: s.lo,
              label: `${s.b || s.n} · ${fmtLitre(s.p[key]![0])}`,
              detail: `${s.a}, ${s.c}`,
              color: '#ea580c',
              radius: 6,
            }))}
            height={260}
          />

          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="h2">{FUEL_LABEL[kind]}</h2>
              <select className="input w-auto py-1.5 text-sm" value={sort} onChange={(e) => setSort(e.target.value as 'prezzo' | 'distanza')}>
                <option value="prezzo">Più economici</option>
                <option value="distanza">Più vicini</option>
              </select>
            </div>
            <ul className="space-y-2">
              {rows.slice(0, 30).map((s) => (
                <li key={s.i} className="card flex items-center gap-3 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{s.b || s.n}</p>
                    <p className="truncate text-xs text-stone-500">
                      {s.a}, {s.c} · {fmtKm(s.distanceKm)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold tabular-nums">{fmtLitre(s.p[key]![0])}</p>
                    <p className="text-xs text-stone-500">del {fmtDate(s.p[key]![1])}</p>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <p className="text-xs text-stone-500">
            Fonte: {data.meta.source}, estrazione del {fmtDate(data.meta.extraction)}, licenza {data.meta.license}. Nella media entrano
            solo i prezzi comunicati negli ultimi {FUEL_MAX_AGE_DAYS} giorni. I prezzi possono essere cambiati nel frattempo.
          </p>
        </>
      )}
    </div>
  )
}
