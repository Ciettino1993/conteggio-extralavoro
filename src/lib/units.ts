/** Unità base usate per normalizzare i formati: kg, l oppure pezzi. */
export type BaseUnit = 'kg' | 'l' | 'pz'
export type Amount = { value: number; unit: BaseUnit }

const FACTORS: Record<string, [BaseUnit, number]> = {
  mg: ['kg', 1e-6],
  g: ['kg', 1e-3],
  gr: ['kg', 1e-3],
  kg: ['kg', 1],
  ml: ['l', 1e-3],
  cl: ['l', 1e-2],
  dl: ['l', 1e-1],
  l: ['l', 1],
  lt: ['l', 1],
  pz: ['pz', 1],
  pezzi: ['pz', 1],
}

/** Converte valore + unità nella forma base (es. 500 g -> 0,5 kg). */
export function toBase(value: number, unit: string): Amount | null {
  const f = FACTORS[unit.trim().toLowerCase()]
  if (!f || !(value > 0)) return null
  return { value: value * f[1], unit: f[0] }
}

/**
 * Interpreta formati come "500 g", "1 L", "6 x 1,5 l", "0.75l".
 * Restituisce la quantità totale in unità base, o null se non riconoscibile.
 */
export function parseQuantity(text: string | null | undefined): Amount | null {
  if (!text) return null
  const t = text.toLowerCase().replace(',', '.')
  const multi = /(\d+)\s*[x×]\s*(\d+(?:\.\d+)?)\s*(mg|kg|gr|g|ml|cl|dl|lt|l)\b/.exec(t)
  if (multi) {
    const one = toBase(Number(multi[2]), multi[3])
    return one ? { value: one.value * Number(multi[1]), unit: one.unit } : null
  }
  const single = /(\d+(?:\.\d+)?)\s*(mg|kg|gr|g|ml|cl|dl|lt|l)\b/.exec(t)
  if (single) return toBase(Number(single[1]), single[2])
  return null
}

/** Prezzo unitario normalizzato (€/kg, €/l, €/pz). */
export function unitPrice(price: number, amount: Amount | null): { value: number; unit: BaseUnit } | null {
  if (!amount || !(amount.value > 0)) return null
  return { value: price / amount.value, unit: amount.unit }
}

/**
 * Fattore per riportare il prezzo di un prodotto equivalente al formato del prodotto principale.
 * null = formati non confrontabili (unità diverse); undefined = formato non noto.
 */
export function formatScale(primary: Amount | null, alt: Amount | null): number | null | undefined {
  if (!primary || !alt) return undefined
  if (primary.unit !== alt.unit) return null
  return primary.value / alt.value
}

const eur = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' })
const eur3 = new Intl.NumberFormat('it-IT', { minimumFractionDigits: 3, maximumFractionDigits: 3 })

export const fmtEur = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? '—' : eur.format(v))
export const fmtLitre = (v: number | null | undefined) => (v == null ? '—' : `${eur3.format(v)} €/l`)
export const fmtKm = (v: number) => `${v.toLocaleString('it-IT', { maximumFractionDigits: v < 10 ? 1 : 0 })} km`
export const fmtUnitPrice = (u: { value: number; unit: BaseUnit } | null) =>
  u ? `${eur.format(u.value)}/${u.unit}` : ''

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso)
  return d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export function todayIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Giorni tra due date ISO (AAAA-MM-GG o timestamp). */
export function daysBetween(fromIso: string, toIso: string): number {
  const a = Date.parse(fromIso.slice(0, 10) + 'T00:00:00Z')
  const b = Date.parse(toIso.slice(0, 10) + 'T00:00:00Z')
  return Math.round((b - a) / 86400000)
}
