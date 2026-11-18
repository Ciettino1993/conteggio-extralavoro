import { Package } from 'lucide-react'
import type { Product } from '../lib/db'
import type { ReactNode } from 'react'

export default function ProductRow({ product, right }: { product: Product; right?: ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-white p-2 shadow-sm ring-1 ring-black/5">
      {product.imageUrl ? (
        <img src={product.imageUrl} alt="" className="h-12 w-12 shrink-0 rounded-lg object-contain" loading="lazy" />
      ) : (
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-stone-100 text-stone-400">
          <Package size={22} />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{product.name}</p>
        <p className="truncate text-xs text-stone-500">
          {[product.brand, product.quantity].filter(Boolean).join(' · ') || ' '}
          {product.source === 'utente' && <span className="ml-1 text-amber-700">· da verificare</span>}
        </p>
      </div>
      {right}
    </div>
  )
}
