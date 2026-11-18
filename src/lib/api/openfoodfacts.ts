// Open Food Facts: identità dei prodotti e codici a barre (dati ODbL). NON è una fonte di prezzi.
import { z } from 'zod'
import { db, nowIso, type Product } from '../db'

const FIELDS = 'code,product_name,product_name_it,brands,quantity,image_small_url'
const APP = 'app_name=SpesaSmart'

const OffProduct = z.object({
  code: z.string(),
  product_name: z.string().optional().nullable(),
  product_name_it: z.string().optional().nullable(),
  brands: z.union([z.string(), z.array(z.string())]).optional().nullable(),
  quantity: z.union([z.string(), z.number()]).optional().nullable(),
  image_small_url: z.string().optional().nullable(),
})

function toProduct(p: z.infer<typeof OffProduct>): Product | null {
  const name = (p.product_name_it || p.product_name || '').trim()
  if (!name) return null
  const brands = Array.isArray(p.brands) ? p.brands.join(', ') : (p.brands ?? '')
  return {
    code: p.code,
    name,
    brand: brands.split(',')[0]?.trim() ?? '',
    quantity: p.quantity != null ? String(p.quantity) : '',
    imageUrl: p.image_small_url ?? undefined,
    source: 'openfoodfacts',
    updatedAt: nowIso(),
  }
}

/** Codice a barre valido (EAN-8, UPC-A, EAN-13, EAN-14) con cifra di controllo. */
export function isValidBarcode(code: string): boolean {
  if (!/^\d{8}$|^\d{12,14}$/.test(code)) return false
  const digits = code.split('').map(Number)
  const check = digits.pop()!
  const sum = digits.reverse().reduce((s, d, i) => s + d * (i % 2 === 0 ? 3 : 1), 0)
  return (10 - (sum % 10)) % 10 === check
}

/** Cerca un codice a barre: prima nel catalogo locale, poi su Open Food Facts. */
export async function lookupBarcode(code: string): Promise<Product | null> {
  const local = await db.products.get(code)
  if (local) return local
  const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=${FIELDS}&${APP}`)
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`Open Food Facts non raggiungibile (HTTP ${res.status})`)
  const json = await res.json()
  if (json.status !== 1 || !json.product) return null
  const parsed = OffProduct.safeParse({ ...json.product, code })
  const product = parsed.success ? toProduct(parsed.data) : null
  if (product) await db.products.put(product)
  return product
}

/** Ricerca testuale su Open Food Facts (prodotti venduti in Italia). Limite: circa 10 ricerche al minuto. */
export async function searchProducts(query: string): Promise<Product[]> {
  // Il sottodominio "it." limita già ai prodotti venduti in Italia (filtri aggiuntivi vengono rifiutati con 503).
  const params = new URLSearchParams({ search_terms: query, search_simple: '1', json: '1', page_size: '24', fields: FIELDS })
  let res: Response
  try {
    res = await fetch(`https://it.openfoodfacts.org/cgi/search.pl?${params}&${APP}`)
  } catch {
    throw new Error('Ricerca prodotti non raggiungibile: controlla la connessione o riprova tra un minuto.')
  }
  if (!res.ok) throw new Error(`Ricerca non disponibile (HTTP ${res.status}). Riprova tra un minuto.`)
  const json = await res.json()
  const list = z.array(z.unknown()).safeParse(json.products)
  if (!list.success) return []
  const out: Product[] = []
  for (const raw of list.data) {
    const p = OffProduct.safeParse(raw)
    const prod = p.success ? toProduct(p.data) : null
    if (prod) out.push(prod)
  }
  return out
}

/** Ricerca nel catalogo locale (prodotti già usati o creati dall'utente). */
export async function searchLocalProducts(query: string): Promise<Product[]> {
  const q = query.trim().toLowerCase()
  if (!q) return []
  return db.products
    .filter((p) => `${p.name} ${p.brand}`.toLowerCase().includes(q) || p.code === q)
    .limit(20)
    .toArray()
}
