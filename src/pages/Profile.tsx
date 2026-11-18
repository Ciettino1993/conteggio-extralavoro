import { useState } from 'react'
import { Link } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronRight, Download, Info, Trash2 } from 'lucide-react'
import { db, deleteAll, exportAll } from '../lib/db'
import { updateSettings, useSettings, type Settings } from '../lib/settings'
import { NumberField, PageHeader } from '../components/ui'
import LocationPicker from '../components/LocationPicker'
import ApiKeySetup from '../components/ApiKeySetup'
import { useToast } from '../components/Toast'

export default function Profile() {
  const s = useSettings()
  const toast = useToast()
  const set = (patch: Partial<Settings>) => void updateSettings(patch)
  const brands = useLiveQuery(async () => {
    const all = await db.stores.toArray()
    return [...new Set(all.map((x) => x.brand).filter(Boolean))].sort()
  }, [])
  const [confirmDelete, setConfirmDelete] = useState(false)

  const download = async () => {
    const data = await exportAll()
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `spesasmart-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Profilo e preferenze" />

      <section className="card space-y-3">
        <h2 className="h2">Posizione di partenza</h2>
        <LocationPicker />
        <NumberField
          label="Raggio di ricerca supermercati"
          value={s.storeRadiusKm}
          min={1}
          max={30}
          suffix="km"
          onChange={(v) => v && v >= 1 && v <= 30 && set({ storeRadiusKm: v })}
        />
      </section>

      <section className="card space-y-3">
        <h2 className="h2">Auto e carburante</h2>
        <div className="grid grid-cols-2 gap-2">
          {(['benzina', 'gasolio'] as const).map((f) => (
            <button key={f} className={s.fuelType === f ? 'btn-primary' : 'btn-secondary'} onClick={() => set({ fuelType: f })}>
              {f === 'benzina' ? 'Benzina' : 'Diesel'}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={s.useSelfService} onChange={(e) => set({ useSelfService: e.target.checked })} className="h-5 w-5 accent-brand-700" />
          Rifornisco in self service
        </label>
        <NumberField
          label="Consumo medio dell'auto"
          value={s.kmPerLitre}
          step={0.5}
          min={2}
          max={60}
          suffix="km con 1 litro"
          hint="Utilitaria a benzina: 14-18 km/l. Diesel: 17-22 km/l."
          onChange={(v) => v && v >= 2 && v <= 60 && set({ kmPerLitre: v })}
        />
        <NumberField
          label="Raggio per il prezzo medio carburante"
          value={s.fuelRadiusKm}
          min={1}
          max={50}
          suffix="km"
          onChange={(v) => v && v >= 1 && v <= 50 && set({ fuelRadiusKm: v })}
        />
        <NumberField
          label="Prezzo carburante a mano (facoltativo)"
          value={s.manualFuelPrice}
          step={0.001}
          min={0}
          max={5}
          suffix="€/l"
          hint="Se compilato sostituisce la media dei distributori vicini."
          onChange={(v) => set({ manualFuelPrice: v && v > 0 && v <= 5 ? v : null })}
        />
      </section>

      <section className="card space-y-3">
        <h2 className="h2">Confronto tra negozi</h2>
        <div>
          <span className="label">Numero massimo di supermercati da visitare</span>
          <div className="grid grid-cols-3 gap-2">
            {[1, 2, 3].map((n) => (
              <button key={n} className={s.maxStores === n ? 'btn-primary' : 'btn-secondary'} onClick={() => set({ maxStores: n })}>
                {n}
              </button>
            ))}
          </div>
        </div>
        <NumberField
          label="Risparmio minimo per una fermata in più"
          value={s.minSavingForExtraStop}
          step={0.5}
          min={0}
          suffix="€"
          onChange={(v) => v != null && v >= 0 && v <= 50 && set({ minSavingForExtraStop: v })}
        />
        <NumberField
          label="Valore del tuo tempo (facoltativo)"
          value={s.timeValuePerHour}
          step={1}
          min={0}
          suffix="€/ora"
          hint="0 = conta solo il carburante."
          onChange={(v) => v != null && v >= 0 && v <= 100 && set({ timeValuePerHour: v })}
        />
        <NumberField
          label="Prezzi validi per"
          value={s.maxPriceAgeDays}
          step={1}
          min={7}
          max={365}
          suffix="giorni"
          hint="I prezzi più vecchi sono mostrati come scaduti e non usati."
          onChange={(v) => v && v >= 7 && v <= 365 && set({ maxPriceAgeDays: Math.round(v) })}
        />
        {brands && brands.length > 0 && (
          <details>
            <summary className="label cursor-pointer">
              Catene da escludere{s.excludedBrands.length > 0 && ` (${s.excludedBrands.length} escluse)`}
            </summary>
            <div className="mt-2 flex flex-wrap gap-2">
              {brands.map((b) => {
                const off = s.excludedBrands.includes(b)
                return (
                  <button
                    key={b}
                    className={`chip px-3 py-1 text-sm ${off ? 'bg-red-100 text-red-800 line-through' : 'bg-stone-100 text-stone-700'}`}
                    onClick={() => set({ excludedBrands: off ? s.excludedBrands.filter((x) => x !== b) : [...s.excludedBrands, b] })}
                  >
                    {b}
                  </button>
                )
              })}
            </div>
          </details>
        )}
      </section>

      <section className="card space-y-3">
        <h2 className="h2">Lettura scontrini</h2>
        <ApiKeySetup />
      </section>

      <section className="card space-y-3">
        <h2 className="h2">I tuoi dati</h2>
        <p className="muted">
          Liste, spese e preferenze sono salvate solo su questo dispositivo. Nessun account, nessun invio a server di SpesaSmart.
        </p>
        <button className="btn-secondary w-full" onClick={download}>
          <Download size={18} /> Esporta i miei dati (JSON)
        </button>
        {confirmDelete ? (
          <div className="flex gap-2">
            <button
              className="btn-primary flex-1 bg-red-700 hover:bg-red-800"
              onClick={async () => {
                await deleteAll()
                setConfirmDelete(false)
                toast('Tutti i dati sono stati cancellati', { tone: 'ok' })
              }}
            >
              Sì, cancella tutto
            </button>
            <button className="btn-secondary" onClick={() => setConfirmDelete(false)}>
              Annulla
            </button>
          </div>
        ) : (
          <button className="btn-ghost w-full text-red-700" onClick={() => setConfirmDelete(true)}>
            <Trash2 size={18} /> Cancella tutti i dati
          </button>
        )}
      </section>

      <Link to="/info" className="card flex items-center gap-3">
        <Info className="text-brand-700" />
        <span className="flex-1 font-medium">Fonti dei dati, licenze e privacy</span>
        <ChevronRight className="text-stone-400" />
      </Link>
    </div>
  )
}
