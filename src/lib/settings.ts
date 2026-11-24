import { useLiveQuery } from 'dexie-react-hooks'
import { z } from 'zod'
import { db } from './db'

export const SettingsSchema = z.object({
  /** Paga oraria in euro, usata per il costo del tempo di viaggio. */
  hourlyWage: z.number().min(0).max(500).default(0),
  /** Conta il tempo di viaggio come costo. */
  countTime: z.boolean().default(true),
  fuelType: z.enum(['benzina', 'gasolio']).default('benzina'),
  useSelfService: z.boolean().default(true),
  /** Consumo dell'auto in km con un litro. */
  kmPerLitre: z.number().min(2).max(60).default(15),
  /** Prezzo carburante inserito a mano: se presente sostituisce la media dei distributori. */
  manualFuelPrice: z.number().min(0).max(5).nullable().default(null),
  fuelRadiusKm: z.number().min(1).max(50).default(10),
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

export function useSettings(): Settings {
  return useLiveQuery(async () => parse((await db.settings.get(KEY))?.value), [], DEFAULT_SETTINGS)
}
