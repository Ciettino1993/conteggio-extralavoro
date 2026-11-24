import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { Trash2 } from 'lucide-react'
import { db, uid, type Trip } from '../lib/db'
import { getSettings, useSettings } from '../lib/settings'
import { dayKey, tripCosts } from '../lib/trip'
import { fmtEur, fmtKm } from '../lib/units'
import { NumberField, PageHeader, Stat } from '../components/ui'
import MapView from '../components/MapView'
import { useToast } from '../components/Toast'

const pad = (n: number) => String(n).padStart(2, '0')
const timeOf = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`

/** Modifica di un viaggio salvato, o inserimento a mano (/viaggio/nuovo). */
export default function TripEdit() {
  const { id = '' } = useParams()
  const isNew = id === 'nuovo'
  const navigate = useNavigate()
  const toast = useToast()
  const settings = useSettings()
  const [trip, setTrip] = useState<Trip | null | undefined>(undefined)
  const [date, setDate] = useState(dayKey(new Date()))
  const [time, setTime] = useState(timeOf(new Date()))
  const [minutes, setMinutes] = useState<number | null>(30)
  const [km, setKm] = useState<number | null>(null)
  const [price, setPrice] = useState<number | null>(null)
  const [kmPerLitre, setKmPerLitre] = useState<number | null>(15)
  const [wage, setWage] = useState<number | null>(0)
  const [countTime, setCountTime] = useState(true)
  const [note, setNote] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    void (async () => {
      if (isNew) {
        const s = await getSettings()
        // Prezzo: quello inserito a mano, altrimenti quello dell'ultimo viaggio registrato.
        const last = await db.trips.orderBy('startedAt').last()
        setPrice(s.manualFuelPrice ?? last?.pricePerLitre ?? null)
        setKmPerLitre(s.kmPerLitre)
        setWage(s.hourlyWage)
        setCountTime(s.countTime)
        setTrip(null)
        return
      }
      const t = await db.trips.get(id)
      if (!t) return setTrip(null)
      const d = new Date(t.startedAt)
      setDate(dayKey(d))
      setTime(timeOf(d))
      setMinutes(Math.round(t.minutes))
      setKm(t.km)
      setPrice(t.pricePerLitre)
      setKmPerLitre(t.kmPerLitre)
      setWage(t.hourlyWage)
      setCountTime(t.countTime)
      setNote(t.note)
      setTrip(t)
    })()
  }, [id, isNew])

  if (trip === undefined) return null
  if (!isNew && trip === null) {
    return <PageHeader title="Viaggio non trovato" back="/resoconto" />
  }

  const costs = tripCosts({
    km: km ?? 0,
    minutes: minutes ?? 0,
    pricePerLitre: price,
    kmPerLitre: kmPerLitre ?? settings.kmPerLitre,
    hourlyWage: wage ?? 0,
    countTime,
  })

  const save = async () => {
    if (km == null || minutes == null || !(minutes > 0)) return toast('Inserisci km e minuti', { tone: 'error' })
    const start = new Date(`${date}T${time}:00`)
    const end = new Date(start.getTime() + minutes * 60_000)
    const base: Trip = trip ?? {
      id: uid(),
      startedAt: '',
      endedAt: '',
      minutes: 0,
      km: 0,
      kmSource: 'manuale',
      gpsKm: null,
      roadKm: null,
      start: null,
      end: null,
      track: [],
      fuelType: settings.fuelType,
      pricePerLitre: null,
      priceSource: null,
      kmPerLitre: 15,
      hourlyWage: 0,
      countTime: true,
      fuelCost: 0,
      timeCost: 0,
      total: 0,
      note: '',
    }
    const kmChanged = trip ? Math.abs(trip.km - km) > 0.05 : true
    await db.trips.put({
      ...base,
      startedAt: start.toISOString(),
      endedAt: end.toISOString(),
      minutes,
      km,
      kmSource: kmChanged ? 'manuale' : base.kmSource,
      pricePerLitre: price,
      priceSource: price == null ? null : trip && price === trip.pricePerLitre ? trip.priceSource : 'manuale',
      kmPerLitre: kmPerLitre ?? settings.kmPerLitre,
      hourlyWage: wage ?? 0,
      countTime,
      fuelCost: costs.fuelCost,
      timeCost: costs.timeCost,
      total: costs.total,
      note: note.trim(),
    })
    toast('Viaggio salvato', { tone: 'ok' })
    navigate('/resoconto')
  }

  const remove = async () => {
    if (trip) await db.trips.delete(trip.id)
    toast('Viaggio eliminato', { tone: 'ok' })
    navigate('/resoconto')
  }

  return (
    <div className="space-y-4">
      <PageHeader title={isNew ? 'Aggiungi viaggio' : 'Modifica viaggio'} back="/resoconto" />
      <section className="card space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="label">Data</span>
            <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label className="block">
            <span className="label">Partenza</span>
            <input className="input" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </label>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <NumberField label="Durata" value={minutes} suffix="min" onChange={(v) => setMinutes(v != null ? Math.round(v) : null)} />
          <NumberField label="Distanza" value={km} step={0.1} suffix="km" onChange={setKm} />
        </div>
        {trip && trip.kmSource !== 'manuale' && (
          <p className="text-xs text-stone-500">
            Km {trip.kmSource === 'gps' ? 'misurati dal GPS' : 'del percorso stradale stimato'}
            {trip.gpsKm != null && ` · GPS ${fmtKm(trip.gpsKm)}`}
            {trip.roadKm != null && ` · strada ${fmtKm(trip.roadKm)}`}
          </p>
        )}
        <input className="input" placeholder="Descrizione (facoltativa)" value={note} onChange={(e) => setNote(e.target.value)} />
      </section>

      <section className="card space-y-3">
        <h2 className="h2">Valori usati per il calcolo</h2>
        <div className="grid grid-cols-2 gap-2">
          <NumberField label="Prezzo carburante" value={price} step={0.001} suffix="€/l" onChange={setPrice} />
          <NumberField label="Consumo" value={kmPerLitre} step={0.5} suffix="km/l" onChange={setKmPerLitre} />
        </div>
        <NumberField label="Paga oraria" value={wage} step={0.5} suffix="€/h" onChange={setWage} />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="h-5 w-5 accent-brand-700" checked={countTime} onChange={(e) => setCountTime(e.target.checked)} />
          Conta il tempo di viaggio
        </label>
        <div className="grid grid-cols-3 gap-2">
          <Stat label="Carburante" value={fmtEur(costs.fuelCost)} />
          <Stat label="Tempo" value={fmtEur(costs.timeCost)} />
          <Stat label="Totale" value={fmtEur(costs.total)} />
        </div>
      </section>

      {trip?.start && trip.track.length > 1 && (
        <MapView
          home={trip.start}
          points={trip.end ? [{ id: 'fine', lat: trip.end.lat, lon: trip.end.lon, label: 'Arrivo', color: '#b91c1c' }] : []}
          route={trip.track}
          height={220}
        />
      )}

      <button className="btn-primary h-12 w-full" onClick={save}>
        Salva
      </button>
      {trip &&
        (confirmDelete ? (
          <div className="flex gap-2">
            <button className="btn-secondary flex-1 text-red-700" onClick={remove}>
              Sì, elimina
            </button>
            <button className="btn-secondary" onClick={() => setConfirmDelete(false)}>
              No
            </button>
          </div>
        ) : (
          <button className="btn-ghost w-full text-red-700" onClick={() => setConfirmDelete(true)}>
            <Trash2 size={18} /> Elimina viaggio
          </button>
        ))}
    </div>
  )
}
