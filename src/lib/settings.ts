import { useLiveQuery } from 'dexie-react-hooks'
import { z } from 'zod'
import { db } from './db'

export const SettingsSchema = z.object({
  location: z
    .object({
      lat: z.number(),
      lon: z.number(),
      label: z.string(),
      source: z.enum(['gps', 'manuale']),
    })
    .nullable()
    .default(null),
  /** Raggio di ricerca dei supermercati. */
  storeRadiusKm: z.number().min(1).max(30).default(5),
  /** Raggio per il prezzo medio dei carburanti. */
  fuelRadiusKm: z.number().min(1).max(50).default(10),
  fuelType: z.enum(['benzina', 'gasolio']).default('benzina'),
  /** Consumo dell'auto in km con un litro. */
  kmPerLitre: z.number().min(2).max(60).default(15),
  /** Prezzo carburante inserito a mano (usato se non ci sono dati MIMIT). */
  manualFuelPrice: z.number().min(0).max(5).nullable().default(null),
  useSelfService: z.boolean().default(true),
  /** Valore del tempo in € all'ora (0 = non considerato). */
  timeValuePerHour: z.number().min(0).max(100).default(0),
  avgSpeedKmh: z.number().min(5).max(90).default(30),
  roadFactor: z.number().min(1).max(2).default(1.3),
  maxStores: z.number().int().min(1).max(3).default(2),
  minSavingForExtraStop: z.number().min(0).max(50).default(2),
  extraStopPenalty: z.number().min(0).max(20).default(0),
  maxPriceAgeDays: z.number().int().min(7).max(365).default(60),
  excludedBrands: z.array(z.string()).default([]),
  /** Modello usato per leggere gli scontrini. */
  receiptModel: z.enum(['claude-opus-5-5', 'claude-haiku-5-5']).default('claude-opus-5-5'),
})

export type Settings = z.infer<typeof SettingsSchema>

export const DEFAULT_SETTINGS: Settings = SettingsSchema.parse({})

const KEY = 'prefs'

function parse(value: unknown): Settings {
  const r = SettingsSchema.safeParse(value ?? {})
  return r.success ? r.data : DEFAULT_SETTINGS
}

export async function getSettings(): Promise<Settings> {
  return parse((await db.settings.get(KEY))?.value)
}

export async function updateSettings(patch: Partial<Settings>) {
  const current = await getSettings()
  await db.settings.put({ key: KEY, value: { ...current, ...patch } })
}

/** Impostazioni sempre aggiornate (si ricarica quando cambiano). */
export function useSettings(): Settings {
  return useLiveQuery(async () => parse((await db.settings.get(KEY))?.value), [], DEFAULT_SETTINGS)
}
