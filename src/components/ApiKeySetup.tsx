import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ExternalLink, KeyRound } from 'lucide-react'
import { API_KEY_ROW, db, setApiKey } from '../lib/db'
import { RECEIPT_MODELS, type ReceiptModel } from '../lib/api/receipt'
import { updateSettings, useSettings } from '../lib/settings'
import { useToast } from './Toast'

/** Impostazione della chiave API per la lettura degli scontrini (resta solo su questo dispositivo). */
export default function ApiKeySetup({ compact = false }: { compact?: boolean }) {
  const settings = useSettings()
  const toast = useToast()
  const hasKey = useLiveQuery(async () => !!(await db.settings.get(API_KEY_ROW)), [], false)
  const [value, setValue] = useState('')

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    const key = value.trim()
    if (!key.startsWith('sk-ant-')) return toast('La chiave deve iniziare con «sk-ant-»', { tone: 'error' })
    await setApiKey(key)
    setValue('')
    toast('Chiave salvata su questo dispositivo', { tone: 'ok' })
  }

  return (
    <div className="space-y-3">
      {!compact && (
        <ol className="list-decimal space-y-1 pl-5 text-sm text-stone-700">
          <li>
            Crea un account su{' '}
            <a className="font-medium text-brand-700 underline" href="https://platform.claude.com" target="_blank" rel="noreferrer">
              platform.claude.com <ExternalLink size={12} className="inline" />
            </a>{' '}
            e aggiungi un piccolo credito (bastano 5 $ per centinaia di scontrini con il modello economico).
          </li>
          <li>In «API keys» crea una chiave e copiala.</li>
          <li>Incollala qui sotto: resta solo su questo dispositivo e non viene esportata.</li>
        </ol>
      )}
      {hasKey ? (
        <div className="flex items-center gap-2 rounded-xl bg-brand-50 p-3 text-sm text-brand-800">
          <KeyRound size={16} /> <span className="flex-1">Chiave API configurata</span>
          <button className="font-medium underline" onClick={() => void setApiKey(null)}>
            Rimuovi
          </button>
        </div>
      ) : (
        <form onSubmit={save} className="flex gap-2">
          <input
            className="input"
            type="password"
            autoComplete="off"
            placeholder="sk-ant-..."
            value={value}
            onChange={(e) => setValue(e.target.value)}
            aria-label="Chiave API"
          />
          <button className="btn-primary">Salva</button>
        </form>
      )}
      <label className="block">
        <span className="label">Modello per leggere gli scontrini</span>
        <select
          className="input"
          value={settings.receiptModel}
          onChange={(e) => void updateSettings({ receiptModel: e.target.value as ReceiptModel })}
        >
          {Object.entries(RECEIPT_MODELS).map(([id, m]) => (
            <option key={id} value={id}>
              {m.label}
            </option>
          ))}
        </select>
        <span className="mt-1 block text-xs text-stone-500">
          Costo indicativo per scontrino: Opus circa 5-10 centesimi, Haiku meno di mezzo centesimo. Dopo ogni lettura
          l'app mostra il costo effettivo.
        </span>
      </label>
    </div>
  )
}
