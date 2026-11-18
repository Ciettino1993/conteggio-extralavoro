import { useState } from 'react'
import { Crosshair, MapPin, Search } from 'lucide-react'
import { geocode } from '../lib/api/osm'
import { updateSettings, useSettings } from '../lib/settings'
import { useToast } from './Toast'

/** Posizione di partenza: GPS solo su richiesta esplicita, oppure comune / CAP / indirizzo. */
export default function LocationPicker({ onDone }: { onDone?: () => void }) {
  const settings = useSettings()
  const toast = useToast()
  const [text, setText] = useState('')
  const [results, setResults] = useState<{ lat: number; lon: number; label: string }[]>([])
  const [busy, setBusy] = useState(false)

  const save = async (loc: { lat: number; lon: number; label: string; source: 'gps' | 'manuale' }) => {
    await updateSettings({ location: loc })
    setResults([])
    toast('Posizione salvata', { tone: 'ok' })
    onDone?.()
  }

  const useGps = () => {
    if (!('geolocation' in navigator)) return toast('Geolocalizzazione non disponibile su questo dispositivo', { tone: 'error' })
    setBusy(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setBusy(false)
        void save({
          lat: Math.round(pos.coords.latitude * 1e5) / 1e5,
          lon: Math.round(pos.coords.longitude * 1e5) / 1e5,
          label: 'Posizione attuale',
          source: 'gps',
        })
      },
      (err) => {
        setBusy(false)
        toast(
          err.code === err.PERMISSION_DENIED
            ? 'Permesso di posizione negato: puoi inserire comune o indirizzo'
            : 'Posizione non disponibile, inserisci comune o indirizzo',
          { tone: 'error' },
        )
      },
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 300000 },
    )
  }

  const search = async (e: React.FormEvent) => {
    e.preventDefault()
    if (text.trim().length < 2) return
    setBusy(true)
    try {
      const r = await geocode(text.trim())
      setResults(r)
      if (!r.length) toast('Nessun risultato: prova con comune e provincia', { tone: 'error' })
    } catch (err) {
      toast((err as Error).message, { tone: 'error' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      {settings.location && (
        <p className="flex items-start gap-2 text-sm text-stone-700">
          <MapPin size={16} className="mt-0.5 shrink-0 text-brand-700" />
          <span>
            Posizione attuale: <strong>{settings.location.label}</strong>
          </span>
        </p>
      )}
      <button type="button" className="btn-secondary w-full" onClick={useGps} disabled={busy}>
        <Crosshair size={18} /> Usa la mia posizione
      </button>
      <form onSubmit={search} className="flex gap-2">
        <input
          className="input"
          placeholder="Comune, CAP o indirizzo"
          value={text}
          onChange={(e) => setText(e.target.value)}
          aria-label="Comune, CAP o indirizzo"
        />
        <button className="btn-primary" disabled={busy} aria-label="Cerca">
          <Search size={18} />
        </button>
      </form>
      {results.length > 0 && (
        <ul className="divide-y divide-black/5 rounded-xl border border-black/10 bg-white">
          {results.map((r) => (
            <li key={`${r.lat},${r.lon}`}>
              <button
                className="w-full px-3 py-2 text-left text-sm hover:bg-brand-50"
                onClick={() => save({ ...r, label: r.label.split(',').slice(0, 3).join(','), source: 'manuale' })}
              >
                {r.label}
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-stone-500">
        La posizione resta su questo dispositivo e serve solo a trovare negozi e distributori vicini. Ricerca indirizzi:
        Nominatim / OpenStreetMap.
      </p>
    </div>
  )
}
