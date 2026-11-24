// Viaggio in corso: posizione GPS continua, schermo acceso, salvataggio a ogni aggiornamento.
// Il viaggio attivo è salvato nel database: se l'app viene chiusa, timer e km riprendono alla riapertura.
import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, uid, type KmSource, type Trip } from './db'
import { EMPTY_GPS, addFix, tripCosts, type GpsState } from './trip'
import type { FuelPrice } from './fuelPrice'
import type { LatLon } from './geo'
import type { Settings } from './settings'

const KEY = 'activeTrip'

export interface ActiveTrip {
  startedAt: number
  start: LatLon | null
  gps: GpsState
  price: FuelPrice
  note: string
  /** Impostato con «Arrivo»: il viaggio attende la conferma. */
  endedAt?: number
  end?: LatLon | null
}

export function useActiveTrip(): ActiveTrip | null | undefined {
  return useLiveQuery(async () => ((await db.settings.get(KEY))?.value as ActiveTrip | undefined) ?? null, [])
}

async function saveActive(t: ActiveTrip) {
  await db.settings.put({ key: KEY, value: t })
}

export async function startTrip(start: LatLon | null, price: FuelPrice, note: string) {
  await saveActive({ startedAt: Date.now(), start, gps: EMPTY_GPS, price, note })
}

export async function cancelTrip() {
  await db.settings.delete(KEY)
}

export async function arrive(t: ActiveTrip) {
  const end = t.gps.last ? { lat: t.gps.last.lat, lon: t.gps.last.lon } : await currentPosition().catch(() => null)
  await saveActive({ ...t, endedAt: Date.now(), end })
}

/** Conferma il viaggio con i valori scelti all'arrivo e lo salva nello storico. */
export async function confirmTrip(
  t: ActiveTrip,
  input: { minutes: number; km: number; kmSource: KmSource; roadKm: number | null; note: string },
  s: Settings,
) {
  const costs = tripCosts({
    km: input.km,
    minutes: input.minutes,
    pricePerLitre: t.price.pricePerLitre,
    kmPerLitre: s.kmPerLitre,
    hourlyWage: s.hourlyWage,
    countTime: s.countTime,
  })
  const trip: Trip = {
    id: uid(),
    startedAt: new Date(t.startedAt).toISOString(),
    endedAt: new Date(t.endedAt ?? Date.now()).toISOString(),
    minutes: input.minutes,
    km: Math.round(input.km * 10) / 10,
    kmSource: input.kmSource,
    gpsKm: Math.round(t.gps.km * 100) / 100,
    roadKm: input.roadKm,
    start: t.start,
    end: t.end ?? null,
    track: t.gps.track,
    fuelType: s.fuelType,
    pricePerLitre: t.price.pricePerLitre,
    priceSource: t.price.source,
    kmPerLitre: s.kmPerLitre,
    hourlyWage: s.hourlyWage,
    countTime: s.countTime,
    fuelCost: costs.fuelCost,
    timeCost: costs.timeCost,
    total: costs.total,
    note: input.note.trim(),
  }
  await db.transaction('rw', db.trips, db.settings, async () => {
    await db.trips.add(trip)
    await db.settings.delete(KEY)
  })
  return trip
}

export function currentPosition(timeoutMs = 15_000): Promise<LatLon & { acc: number }> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) return reject(new Error('Geolocalizzazione non disponibile su questo dispositivo'))
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy }),
      (err) =>
        reject(
          new Error(
            err.code === err.PERMISSION_DENIED
              ? 'Permesso di posizione negato: abilitalo nelle impostazioni del browser per questo sito.'
              : 'Posizione non disponibile: controlla che il GPS sia attivo.',
          ),
        ),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 30_000 },
    )
  })
}

/**
 * Durante il viaggio: segue il GPS e tiene lo schermo acceso.
 * Restituisce lo stato del segnale per mostrarlo a schermo.
 */
export function useTracking(active: ActiveTrip | null | undefined) {
  const running = !!active && !active.endedAt
  const ref = useRef<ActiveTrip | null>(null)
  const [signal, setSignal] = useState<{ acc: number | null; error: string | null; wakeLock: boolean }>({
    acc: null,
    error: null,
    wakeLock: false,
  })

  useEffect(() => {
    if (active) ref.current = active
  }, [active])

  // GPS
  useEffect(() => {
    if (!running || !('geolocation' in navigator)) return
    const id = navigator.geolocation.watchPosition(
      (p) => {
        const cur = ref.current
        if (!cur || cur.endedAt) return
        const next: ActiveTrip = {
          ...cur,
          start: cur.start ?? { lat: p.coords.latitude, lon: p.coords.longitude },
          gps: addFix(cur.gps, { lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy, t: p.timestamp || Date.now() }),
        }
        ref.current = next
        void saveActive(next)
        setSignal((s) => ({ ...s, acc: p.coords.accuracy, error: null }))
      },
      (err) =>
        setSignal((s) => ({
          ...s,
          error: err.code === err.PERMISSION_DENIED ? 'Permesso di posizione negato' : 'Segnale GPS non disponibile',
        })),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 30_000 },
    )
    return () => navigator.geolocation.clearWatch(id)
  }, [running])

  // Schermo sempre acceso (se il browser lo consente), riattivato quando si torna all'app.
  useEffect(() => {
    if (!running || !('wakeLock' in navigator)) return
    let lock: WakeLockSentinel | null = null
    let cancelled = false
    const acquire = async () => {
      try {
        lock = await navigator.wakeLock.request('screen')
        if (cancelled) void lock.release()
        else {
          setSignal((s) => ({ ...s, wakeLock: true }))
          lock.addEventListener('release', () => setSignal((s) => ({ ...s, wakeLock: false })))
        }
      } catch {
        setSignal((s) => ({ ...s, wakeLock: false }))
      }
    }
    const onVisible = () => document.visibilityState === 'visible' && void acquire()
    void acquire()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
      void lock?.release()
    }
  }, [running])

  return signal
}

/** Secondi trascorsi, aggiornati ogni secondo. */
export function useElapsed(startedAt: number | undefined, endedAt?: number) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!startedAt || endedAt) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [startedAt, endedAt])
  if (!startedAt) return 0
  return ((endedAt ?? now) - startedAt) / 1000
}
