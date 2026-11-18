import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { Check, Link2, Minus, Pencil, Plus, Replace, Scale, ScanBarcode, Trash2, X } from 'lucide-react'
import { db, type ListItem, type Product } from '../lib/db'
import {
  addAlternative,
  addProductToList,
  addTextToList,
  deleteList,
  linkProduct,
  removeAlternative,
  renameList,
  updateListItem,
} from '../lib/data'
import ProductPicker from '../components/ProductPicker'
import { Empty, PageHeader } from '../components/ui'
import { useToast } from '../components/Toast'

type Picker = { kind: 'add'; scan?: boolean } | { kind: 'link'; item: ListItem } | { kind: 'alt'; item: ListItem } | null

export default function ListDetail() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  // undefined = in caricamento, null = non trovata
  const list = useLiveQuery(async () => (await db.lists.get(id)) ?? null, [id])
  const items = useLiveQuery(() => db.listItems.where({ listId: id }).sortBy('createdAt'), [id])
  const products = useLiveQuery(async () => {
    const codes = (items ?? []).flatMap((i) => [i.productCode, ...i.alternatives]).filter(Boolean) as string[]
    const ps = await db.products.bulkGet(codes)
    return new Map(ps.filter(Boolean).map((p) => [p!.code, p!]))
  }, [items])
  const [picker, setPicker] = useState<Picker>(null)
  const [open, setOpen] = useState<string | null>(null)

  if (list === undefined) return null
  if (list === null) {
    return (
      <div>
        <PageHeader title="Lista non trovata" back="/liste" />
      </div>
    )
  }

  const onPick = async (p: Product) => {
    if (!picker) return
    if (picker.kind === 'add') {
      await addProductToList(id, p)
      toast(`Aggiunto: ${p.name}`, { tone: 'ok' })
    } else if (picker.kind === 'link') {
      await linkProduct(picker.item.id, p)
      setPicker(null)
    } else {
      await addAlternative(picker.item.id, p)
      toast('Equivalente aggiunto', { tone: 'ok' })
      setPicker(null)
    }
  }

  const rename = async () => {
    const name = prompt('Nome della lista', list.name)
    if (name != null) await renameList(id, name)
  }

  const remove = async () => {
    if (!confirm(`Eliminare la lista «${list.name}»?`)) return
    await deleteList(id)
    navigate('/liste')
  }

  const todo = items?.filter((i) => !i.isPurchased) ?? []
  const done = items?.filter((i) => i.isPurchased) ?? []
  const unlinked = todo.filter((i) => !i.productCode).length

  return (
    <div className="space-y-4">
      <PageHeader
        title={list.name}
        back="/liste"
        action={
          <button className="btn-ghost" onClick={rename} aria-label="Rinomina">
            <Pencil size={20} />
          </button>
        }
      />

      <div className="grid grid-cols-2 gap-2">
        <button className="btn-primary" onClick={() => setPicker({ kind: 'add' })}>
          <Plus size={18} /> Aggiungi
        </button>
        <button className="btn-secondary" onClick={() => setPicker({ kind: 'add', scan: true })}>
          <ScanBarcode size={18} /> Scansiona
        </button>
      </div>

      {items && items.length === 0 && (
        <Empty icon={<Plus size={36} />} title="Lista vuota">
          Cerca i prodotti per nome, marca o codice a barre. Per confrontare i prezzi serve il prodotto preciso; puoi anche
          scrivere voci libere (es. «pane») e collegarle dopo.
        </Empty>
      )}

      <ul className="space-y-2">
        {todo.map((item) => (
          <ItemRow
            key={item.id}
            item={item}
            products={products}
            open={open === item.id}
            onToggle={() => setOpen(open === item.id ? null : item.id)}
            onLink={() => setPicker({ kind: 'link', item })}
            onAlt={() => setPicker({ kind: 'alt', item })}
          />
        ))}
      </ul>

      {done.length > 0 && (
        <details className="card" open>
          <summary className="cursor-pointer font-semibold">Già presi ({done.length})</summary>
          <ul className="mt-2 space-y-1">
            {done.map((item) => (
              <li key={item.id} className="flex items-center gap-2 text-sm text-stone-500">
                <button
                  className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-600 text-white"
                  onClick={() => updateListItem(item.id, { isPurchased: 0 })}
                  aria-label="Segna come da prendere"
                >
                  <Check size={14} />
                </button>
                <span className="line-through">
                  {item.quantity > 1 && `${item.quantity}× `}
                  {item.description}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {todo.length > 0 && (
        <div className="space-y-2">
          {unlinked > 0 && (
            <p className="text-xs text-stone-500">
              {unlinked} voci libere non hanno un prodotto collegato e non entrano nel confronto prezzi: tocca la voce e
              scegli «Collega prodotto».
            </p>
          )}
          <div className="grid grid-cols-2 gap-2">
            <Link to={`/confronta?lista=${id}`} className="btn-primary">
              <Scale size={18} /> Confronta prezzi
            </Link>
            <Link to={`/spesa?lista=${id}`} className="btn-secondary">
              <ScanBarcode size={18} /> Vai a fare la spesa
            </Link>
          </div>
        </div>
      )}

      <button className="btn-ghost w-full text-red-700" onClick={remove}>
        <Trash2 size={18} /> Elimina lista
      </button>

      {picker && (
        <ProductPicker
          title={picker.kind === 'add' ? 'Aggiungi alla lista' : picker.kind === 'link' ? 'Collega un prodotto' : 'Prodotto equivalente'}
          startWithScanner={picker.kind === 'add' && picker.scan}
          onPick={onPick}
          onClose={() => setPicker(null)}
          onFreeText={
            picker.kind === 'add'
              ? async (text) => {
                  await addTextToList(id, text)
                  toast(`Aggiunto: ${text}`, { tone: 'ok' })
                }
              : undefined
          }
        />
      )}
    </div>
  )
}

function ItemRow({
  item,
  products,
  open,
  onToggle,
  onLink,
  onAlt,
}: {
  item: ListItem
  products?: Map<string, Product>
  open: boolean
  onToggle: () => void
  onLink: () => void
  onAlt: () => void
}) {
  const product = item.productCode ? products?.get(item.productCode) : undefined
  return (
    <li className="card p-3">
      <div className="flex items-center gap-3">
        <button
          className="h-7 w-7 shrink-0 rounded-full border-2 border-stone-300 hover:border-brand-600"
          onClick={() => updateListItem(item.id, { isPurchased: 1 })}
          aria-label={`Segna come preso: ${item.description}`}
        />
        <button className="min-w-0 flex-1 text-left" onClick={onToggle}>
          <p className="truncate font-medium">{product?.name ?? item.description}</p>
          <p className="truncate text-xs text-stone-500">
            {product ? [product.brand, product.quantity].filter(Boolean).join(' · ') : 'voce libera · senza prodotto'}
            {item.alternatives.length > 0 && ` · +${item.alternatives.length} equivalenti`}
          </p>
        </button>
        <div className="flex items-center gap-1">
          <button
            className="btn-ghost h-8 w-8 p-0"
            onClick={() => (item.quantity > 1 ? updateListItem(item.id, { quantity: item.quantity - 1 }) : db.listItems.delete(item.id))}
            aria-label="Diminuisci quantità"
          >
            {item.quantity > 1 ? <Minus size={16} /> : <Trash2 size={16} />}
          </button>
          <span className="w-6 text-center font-semibold tabular-nums">{item.quantity}</span>
          <button className="btn-ghost h-8 w-8 p-0" onClick={() => updateListItem(item.id, { quantity: item.quantity + 1 })} aria-label="Aumenta quantità">
            <Plus size={16} />
          </button>
        </div>
      </div>
      {open && (
        <div className="mt-3 space-y-2 border-t border-black/5 pt-3">
          <div className="flex flex-wrap gap-2">
            <button className="btn-secondary py-1.5" onClick={onLink}>
              <Link2 size={16} /> {item.productCode ? 'Cambia prodotto' : 'Collega prodotto'}
            </button>
            {item.productCode && (
              <button className="btn-secondary py-1.5" onClick={onAlt}>
                <Replace size={16} /> Aggiungi equivalente
              </button>
            )}
            <button className="btn-ghost py-1.5 text-red-700" onClick={() => db.listItems.delete(item.id)}>
              <Trash2 size={16} /> Rimuovi
            </button>
          </div>
          {item.alternatives.length > 0 && (
            <div>
              <p className="text-xs font-medium text-stone-600">
                Equivalenti accettati (nel confronto sono indicati come «equivalente», non come lo stesso prodotto):
              </p>
              <ul className="mt-1 space-y-1">
                {item.alternatives.map((code) => {
                  const p = products?.get(code)
                  return (
                    <li key={code} className="flex items-center gap-2 text-sm">
                      <span className="flex-1 truncate">
                        {p ? `${p.name} ${p.brand ? `- ${p.brand}` : ''} ${p.quantity ? `(${p.quantity})` : ''}` : code}
                      </span>
                      <button className="btn-ghost h-7 w-7 p-0" onClick={() => removeAlternative(item.id, code)} aria-label="Rimuovi equivalente">
                        <X size={14} />
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
          <input
            className="input py-1.5 text-sm"
            placeholder="Note (es. senza lattosio)"
            defaultValue={item.notes ?? ''}
            onBlur={(e) => updateListItem(item.id, { notes: e.target.value })}
          />
        </div>
      )}
    </li>
  )
}
