import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { AlertTriangle, ChevronRight, Crosshair, Flag, Fuel, MapPin, Play, Smartphone, X } from 'lucide-react'
import { db, type KmSource } from '../lib/db'
import { useSettings } from '../lib/settings'
import { useFuelPrice, fuelPriceAt } from '../lib/fuelPrice'
import { arrive, cancelTrip, confirmTrip, currentPosition, startTrip, useActiveTrip, useElapsed, useTracking, type ActiveTrip } from '../lib/tracker'
import { dayKey, fmtDuration, fmtMinutes, suggestKmSource, tripCosts } from '../lib/trip'
import { roadKm } from '../lib/route'
import { haversineKm, type LatLon } from '../lib/geo'
import { fmtDate, fmtEur, fmtKm, fmtLitre } from '../lib/units'
import { NumberField, Stat } from '../components/ui'
import MapView from '../components/MapView'
import { useToast } from '../components/Toast'

export default function TripPage() {
  const active = useActiveTrip()
  if (active === undefined) return null
  return (
    <div className="space-y-4">
      <header className="flex items-center gap-3 pt-2">
        <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" className="h-10 w-10" />
        <div>
          <h1 className="h1">Conteggio Extralavoro</h1>
          <p className="muted">Costo dei viaggi di lavoro: carburante e tempo</p>
        </div>
      </header>
      {!active ? <Idle /> : active.endedAt ? <Arrival trip={active} /> : <Running trip={active} />}
      <Today />
    </div>
  )
}

// ---------- Prima della partenza ----------

function Idle() {
  const settings = useSettings()
  const toast = useToast()
  const [pos, setPos] = useState<(LatLon & { acc: number }) | null>(null)
  const [locating, setLocating] = useState(false)
  const [note, setNote] = useState('')
  const [starting, setStarting] = useState(false)
  const price = useFuelPrice(pos, settings)

  const locate = async () => {
    setLocating(true)
    try {
      setPos(await currentPosition())
    } catch (e) {
      toast((e as Error).message, { tone: 'error' })
    } finally {
      setLocating(false)
    }
  }

  // Se il permesso è già stato dato, la posizione viene rilevata subito.
  useEffect(() => {
    navigator.permissions
      ?.query({ name: 'geolocation' })
      .then((p) => p.state === 'granted' && void locate())
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const start = async () => {
    setStarting(true)
    try {
      let p = pos
      if (!p) p = await currentPosition(10_000).catch(() => null)
      const fp = await fuelPriceAt(p, settings)
      await startTrip(p, fp, note)
      if (!p) toast('Posizione non ancora disponibile: verrà rilevata durante il viaggio', { tone: 'info' })
    } finally {
      setStarting(false)
    }
  }

  return (
    <>
      <section className="card space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="h2 flex items-center gap-2">
            <MapPin size={20} className="text-brand-700" /> Posizione
          </h2>
          <button className="btn-ghost text-sm" onClick={locate} disabled={locating}>
            <Crosshair size={16} /> {locating ? 'Rilevo…' : pos ? 'Aggiorna' : 'Rileva'}
          </button>
        </div>
        {pos ? (
          <p className="text-sm text-stone-600">
            Rilevata (precisione {Math.round(pos.acc)} m)
          </p>
        ) : (
          <p className="text-sm text-stone-600">Tocca «Rileva» per trovare la posizione e i prezzi dei distributori vicini.</p>
        )}
        <div className="flex items-start gap-3 rounded-xl bg-stone-50 p-3">
          <Fuel size={20} className="mt-0.5 shrink-0 text-brand-700" />
          <div className="text-sm">
            {price.isLoading ? (
              <p className="muted">Calcolo prezzo medio…</p>
            ) : price.data?.pricePerLitre ? (
              <>
                <p>
                  <strong className="text-lg tabular-nums">{fmtLitre(price.data.pricePerLitre)}</strong> ·{' '}
                  <strong>{fmtEur(price.data.costPerKm)}/km</strong> con {settings.kmPerLitre} km/l
                </p>
                <p className="text-xs text-stone-500">
                  {price.data.description}
                  {price.data.extraction && ` · dati MIMIT del ${fmtDate(price.data.extraction)}`}
                </p>
              </>
            ) : (
              <p className="text-stone-600">Prezzo carburante: {price.data?.description ?? '—'}</p>
            )}
          </div>
        </div>
      </section>

      {settings.hourlyWage === 0 && settings.countTime && (
        <Link to="/impostazioni" className="card flex items-center gap-2 border-amber-300 bg-amber-50 text-sm text-amber-900">
          <AlertTriangle size={18} /> <span className="flex-1">Imposta la tua paga oraria per calcolare il costo del tempo.</span>
          <ChevronRight size={18} />
        </Link>
      )}

      <input className="input" placeholder="Descrizione (facoltativa), es. Cliente Rossi" value={note} onChange={(e) => setNote(e.target.value)} />
      <button className="btn-primary h-20 w-full text-xl" onClick={start} disabled={starting}>
        <Play size={28} /> {starting ? 'Avvio…' : 'Partenza'}
      </button>
      <p className="flex gap-2 text-xs text-stone-500">
        <Smartphone size={16} className="shrink-0" />
        Durante il viaggio tieni l'app aperta (lo schermo resta acceso): con il telefono bloccato o un'altra app in primo
        piano il GPS si ferma. Se succede, all'arrivo potrai usare i km del percorso stradale.
      </p>
    </>
  )
}

// ---------- Durante il viaggio ----------

function Running({ trip }: { trip: ActiveTrip }) {
  const settings = useSettings()
  const signal = useTracking(trip)
  const seconds = useElapsed(trip.startedAt)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const costs = tripCosts({
    km: trip.gps.km,
    minutes: seconds / 60,
    pricePerLitre: trip.price.pricePerLitre,
    kmPerLitre: settings.kmPerLitre,
    hourlyWage: settings.hourlyWage,
    countTime: settings.countTime,
  })
  const lastAge = trip.gps.lastSeen ? (Date.now() - trip.gps.lastSeen) / 1000 : null

  return (
    <section className="card space-y-4 border-brand-200">
      <div className="text-center">
        <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">Viaggio in corso</p>
        <p className="font-mono text-5xl font-bold tabular-nums">{fmtDuration(seconds)}</p>
        <p className="text-2xl font-semibold tabular-nums">{fmtKm(trip.gps.km)}</p>
        {trip.note && <p className="muted">{trip.note}</p>}
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Carburante" value={fmtEur(costs.fuelCost)} />
        <Stat label="Tempo" value={fmtEur(costs.timeCost)} />
        <Stat label="Totale" value={fmtEur(costs.total)} />
      </div>
      <p className="text-center text-xs text-stone-500">
        {signal.error ? (
          <span className="text-amber-800">{signal.error}</span>
        ) : lastAge != null && lastAge > 30 ? (
          <span className="text-amber-800">Nessun segnale GPS da {Math.round(lastAge)} s</span>
        ) : signal.acc != null ? (
          `GPS attivo · precisione ${Math.round(signal.acc)} m`
        ) : (
          'In attesa del segnale GPS…'
        )}
        {' · '}
        {signal.wakeLock ? 'schermo sempre acceso' : 'tieni lo schermo acceso'}
      </p>
      <button className="btn-primary h-20 w-full bg-red-700 text-xl hover:bg-red-800" onClick={() => void arrive(trip)}>
        <Flag size={28} /> Arrivo
      </button>
      {confirmCancel ? (
        <div className="flex gap-2">
          <button className="btn-secondary flex-1 text-red-700" onClick={() => void cancelTrip()}>
            Sì, annulla il viaggio
          </button>
          <button className="btn-secondary" onClick={() => setConfirmCancel(false)}>
            No
          </button>
        </div>
      ) : (
        <button className="btn-ghost w-full text-sm" onClick={() => setConfirmCancel(true)}>
          <X size={16} /> Annulla viaggio
        </button>
      )}
    </section>
  )
}

// ---------- All'arrivo ----------

function Arrival({ trip }: { trip: ActiveTrip }) {
  const settings = useSettings()
  const toast = useToast()
  const durationS = ((trip.endedAt ?? Date.now()) - trip.startedAt) / 1000
  const [minutes, setMinutes] = useState(Math.max(1, Math.round(durationS / 60)))
  const [road, setRoad] = useState<number | null | 'loading'>('loading')
  const [source, setSource] = useState<KmSource>('gps')
  const [manualKm, setManualKm] = useState<number | null>(null)
  const [note, setNote] = useState(trip.note)

  // Percorso stradale tra partenza e arrivo, utile se il GPS ha perso dei tratti.
  useEffect(() => {
    let off = false
    if (trip.start && trip.end && haversineKm(trip.start, trip.end) > 0.3) {
      void roadKm(trip.start, trip.end).then((km) => {
        if (off) return
        setRoad(km)
        setSource(suggestKmSource(trip.gps.km, km, trip.gps.gapSeconds, durationS))
      })
    } else setRoad(null)
    return () => {
      off = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const km = source === 'gps' ? trip.gps.km : source === 'strada' ? (typeof road === 'number' ? road : 0) : (manualKm ?? 0)
  const costs = tripCosts({
    km,
    minutes,
    pricePerLitre: trip.price.pricePerLitre,
    kmPerLitre: settings.kmPerLitre,
    hourlyWage: settings.hourlyWage,
    countTime: settings.countTime,
  })

  const save = async () => {
    await confirmTrip(trip, { minutes, km, kmSource: source, roadKm: typeof road === 'number' ? Math.round(road * 10) / 10 : null, note }, settings)
    toast(`Viaggio salvato: ${fmtEur(costs.total)}`, { tone: 'ok' })
  }

  const option = (value: KmSource, label: string, detail: string, disabled = false) => (
    <label className={`flex items-center gap-3 rounded-xl border p-3 ${source === value ? 'border-brand-600 bg-brand-50' : 'border-black/10'} ${disabled ? 'opacity-50' : ''}`}>
      <input type="radio" name="km" className="h-5 w-5 accent-brand-700" checked={source === value} disabled={disabled} onChange={() => setSource(value)} />
      <span className="flex-1 text-sm font-medium">{label}</span>
      <span className="text-sm tabular-nums text-stone-600">{detail}</span>
    </label>
  )

  return (
    <section className="card space-y-4 border-brand-200">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">Arrivato</p>
        <h2 className="h2">Controlla e salva il viaggio</h2>
      </div>
      <NumberField label="Durata" value={minutes} suffix="minuti" onChange={(v) => v != null && v > 0 && setMinutes(Math.round(v))} />
      <div className="space-y-2">
        <span className="label">Chilometri</span>
        {option('gps', 'Misurati dal GPS', fmtKm(trip.gps.km))}
        {option(
          'strada',
          'Percorso stradale stimato',
          road === 'loading' ? 'calcolo…' : typeof road === 'number' ? fmtKm(road) : 'non disponibile',
          typeof road !== 'number',
        )}
        {option('manuale', 'Inseriti a mano', manualKm != null ? fmtKm(manualKm) : '—')}
        {source === 'manuale' && <NumberField label="Km percorsi" value={manualKm} step={0.1} suffix="km" onChange={(v) => setManualKm(v != null && v >= 0 ? v : null)} />}
        {trip.gps.gapSeconds > 60 && (
          <p className="text-xs text-amber-800">
            Il GPS è rimasto senza segnale per {fmtMinutes(trip.gps.gapSeconds / 60)}: i km misurati potrebbero essere meno di quelli reali.
          </p>
        )}
      </div>
      <input className="input" placeholder="Descrizione (facoltativa)" value={note} onChange={(e) => setNote(e.target.value)} />
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Carburante" value={fmtEur(costs.fuelCost)} hint={trip.price.pricePerLitre ? fmtLitre(trip.price.pricePerLitre) : 'prezzo n.d.'} />
        <Stat label="Tempo" value={fmtEur(costs.timeCost)} hint={settings.countTime ? `${fmtEur(settings.hourlyWage)}/h` : 'escluso'} />
        <Stat label="Totale" value={fmtEur(costs.total)} />
      </div>
      {trip.start && trip.gps.track.length > 1 && (
        <MapView home={trip.start} points={trip.end ? [{ id: 'fine', lat: trip.end.lat, lon: trip.end.lon, label: 'Arrivo', color: '#b91c1c' }] : []} route={trip.gps.track} height={200} />
      )}
      <div className="flex gap-2">
        <button className="btn-primary h-12 flex-1" onClick={save} disabled={source === 'manuale' && manualKm == null}>
          Salva viaggio
        </button>
        <button className="btn-secondary h-12" onClick={() => void cancelTrip()}>
          Scarta
        </button>
      </div>
    </section>
  )
}

// ---------- Riepilogo di oggi ----------

function Today() {
  const today = dayKey(new Date())
  const trips = useLiveQuery(
    async () => (await db.trips.orderBy('startedAt').reverse().limit(50).toArray()).filter((t) => dayKey(new Date(t.startedAt)) === today),
    [today],
  )
  if (!trips) return null
  const sum = trips.reduce((s, t) => ({ fuel: s.fuel + t.fuelCost, time: s.time + t.timeCost, km: s.km + t.km, min: s.min + t.minutes }), { fuel: 0, time: 0, km: 0, min: 0 })
  return (
    <section className="card space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="h2">Oggi</h2>
        <Link to="/resoconto" className="text-sm font-medium text-brand-700">
          Resoconto
        </Link>
      </div>
      {trips.length === 0 ? (
        <p className="muted">Nessun viaggio registrato oggi.</p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2">
            <Stat label="Carburante" value={fmtEur(sum.fuel)} hint={fmtKm(sum.km)} />
            <Stat label="Tempo" value={fmtEur(sum.time)} hint={fmtMinutes(sum.min)} />
            <Stat label="Totale" value={fmtEur(sum.fuel + sum.time)} hint={trips.length === 1 ? '1 viaggio' : `${trips.length} viaggi`} />
          </div>
          <ul className="divide-y divide-black/5">
            {trips.map((t) => (
              <li key={t.id}>
                <Link to={`/viaggio/${t.id}`} className="flex items-center gap-2 py-2 text-sm">
                  <span className="tabular-nums text-stone-500">
                    {new Date(t.startedAt).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{t.note || `${fmtKm(t.km)} · ${fmtMinutes(t.minutes)}`}</span>
                  <span className="font-semibold tabular-nums">{fmtEur(t.total)}</span>
                  <ChevronRight size={16} className="text-stone-400" />
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}
