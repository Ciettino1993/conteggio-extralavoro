// Database locale (IndexedDB tramite Dexie): i viaggi restano sul telefono, funziona anche offline.
import Dexie, { type EntityTable } from 'dexie'
import type { LatLon } from './geo'
import type { FuelKind } from './fuel'

export type KmSource = 'gps' | 'strada' | 'manuale'

/** Viaggio concluso. Prezzo, consumo e paga sono "fotografati" al momento del viaggio. */
export interface Trip {
  id: string
  startedAt: string
  endedAt: string
  /** Durata in minuti (modificabile). */
  minutes: number
  km: number
  kmSource: KmSource
  gpsKm: number | null
  roadKm: number | null
  start: LatLon | null
  end: LatLon | null
  track: [number, number][]
  fuelType: FuelKind
  pricePerLitre: number | null
  priceSource: 'mimit' | 'manuale' | null
  kmPerLitre: number
  hourlyWage: number
  countTime: boolean
  fuelCost: number
  timeCost: number
  total: number
  note: string
}

export interface SettingRow {
  key: string
  value: unknown
}

export const db = new Dexie('extralavoro') as Dexie & {
  trips: EntityTable<Trip, 'id'>
  settings: EntityTable<SettingRow, 'key'>
}

db.version(1).stores({
  trips: 'id, startedAt',
  settings: 'key',
})

export const uid = () => crypto.randomUUID()
export const nowIso = () => new Date().toISOString()

export async function exportJson() {
  return {
    app: 'Conteggio Extralavoro',
    exportedAt: nowIso(),
    trips: await db.trips.orderBy('startedAt').toArray(),
    settings: await db.settings.toArray(),
  }
}

export async function deleteAll() {
  await db.transaction('rw', db.trips, db.settings, async () => {
    await db.trips.clear()
    await db.settings.clear()
  })
}
