import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronRight, ListChecks, Plus } from 'lucide-react'
import { db } from '../lib/db'
import { createList } from '../lib/data'
import { Empty, PageHeader } from '../components/ui'

export default function Lists() {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const lists = useLiveQuery(() => db.lists.orderBy('updatedAt').reverse().toArray(), [])
  const items = useLiveQuery(() => db.listItems.toArray(), [])

  const create = async (e: React.FormEvent) => {
    e.preventDefault()
    const id = await createList(name || `Spesa del ${new Date().toLocaleDateString('it-IT')}`)
    setName('')
    navigate(`/liste/${id}`)
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Liste della spesa" />
      <form onSubmit={create} className="flex gap-2">
        <input className="input" placeholder="Nome nuova lista (es. Spesa settimanale)" value={name} onChange={(e) => setName(e.target.value)} />
        <button className="btn-primary" aria-label="Crea lista">
          <Plus size={20} />
        </button>
      </form>
      {lists && lists.length === 0 && (
        <Empty icon={<ListChecks size={40} />} title="Nessuna lista">
          Crea una lista e aggiungi i prodotti cercandoli per nome o scansionando il codice a barre.
        </Empty>
      )}
      <ul className="space-y-2">
        {lists?.map((l) => {
          const its = items?.filter((i) => i.listId === l.id) ?? []
          const done = its.filter((i) => i.isPurchased).length
          return (
            <li key={l.id}>
              <Link to={`/liste/${l.id}`} className="card flex items-center gap-3">
                <div className="flex-1">
                  <p className="font-semibold">{l.name}</p>
                  <p className="muted">
                    {its.length} prodotti{its.length > 0 && ` · ${done} presi`}
                  </p>
                </div>
                <ChevronRight className="text-stone-400" />
              </Link>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
