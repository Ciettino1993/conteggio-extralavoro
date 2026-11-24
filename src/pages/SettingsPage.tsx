import { useState } from 'react'
import { Link } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronRight, Download, Info, Trash2 } from 'lucide-react'
import { db, deleteAll, exportJson } from '../lib/db'
import { updateSettings, useSettings, type Settings } from '../lib/settings'
import { tripsToCsv } from '../lib/trip'
import { fmtEur } from '../lib/units'
import { fuelCostPerKm } from '../lib/fuel'
import { NumberField, PageHeader } from '../components/ui'
import { useToast } from '../components/Toast'
import { downloadFile } from './Report'

export default function SettingsPage() {
  const s = useSettings()
  const toast = useToast()
  const set = (patch: Partial<Settings>) => void updateSettings(patch)
  const count = useLiveQuery(() => db.trips.count(), [], 0)
  const [confirmDelete, setConfirmDelete] = useState(false)

  return (
    <div className="space-y-4">
      <PageHeader title="Impostazioni" />

      <section className="card space-y-3">
        <h2 className="h2">Lavoro</h2>
        <NumberField
          label="Paga oraria"
          value={s.hourlyWage}
          step={0.5}
          suffix="€ all'ora"
          hint="Usata per il costo del tempo passato in viaggio."
          onChange={(v) => v != null && v >= 0 && v <= 500 && set({ hourlyWage: v })}
        />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="h-5 w-5 accent-brand-700" checked={s.countTime} onChange={(e) => set({ countTime: e.target.checked })} />
          Conta il tempo di viaggio come costo
        </label>
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
          <input type="checkbox" className="h-5 w-5 accent-brand-700" checked={s.useSelfService} onChange={(e) => set({ useSelfService: e.target.checked })} />
          Rifornisco in self service
        </label>
        <NumberField
          label="Consumo medio dell'auto"
          value={s.kmPerLitre}
          step={0.5}
          suffix="km con 1 litro"
          hint="Utilitaria a benzina: 14-18 km/l. Diesel: 17-22 km/l. Lo trovi nel computer di bordo."
          onChange={(v) => v != null && v >= 2 && v <= 60 && set({ kmPerLitre: v })}
        />
        <NumberField
          label="Raggio per il prezzo medio"
          value={s.fuelRadiusKm}
          suffix="km"
          onChange={(v) => v != null && v >= 1 && v <= 50 && set({ fuelRadiusKm: v })}
        />
        <NumberField
          label="Prezzo carburante fisso (facoltativo)"
          value={s.manualFuelPrice}
          step={0.001}
          suffix="€/l"
          hint="Se compilato sostituisce la media dei distributori vicini (es. il prezzo che paghi di solito)."
          onChange={(v) => set({ manualFuelPrice: v != null && v > 0 && v <= 5 ? v : null })}
        />
        {s.manualFuelPrice && (
          <p className="text-xs text-stone-500">Costo al km: {fmtEur(fuelCostPerKm(s.manualFuelPrice, s.kmPerLitre))}</p>
        )}
      </section>

      <section className="card space-y-3">
        <h2 className="h2">I tuoi dati</h2>
        <p className="muted">{count} viaggi salvati solo su questo telefono. Esporta ogni tanto una copia.</p>
        <button
          className="btn-secondary w-full"
          disabled={!count}
          onClick={async () => downloadFile('extralavoro-tutti-i-viaggi.csv', tripsToCsv(await db.trips.orderBy('startedAt').toArray()), 'text/csv;charset=utf-8')}
        >
          <Download size={18} /> Tutti i viaggi per Excel (CSV)
        </button>
        <button
          className="btn-secondary w-full"
          onClick={async () => downloadFile(`extralavoro-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(await exportJson(), null, 1), 'application/json')}
        >
          <Download size={18} /> Copia completa (JSON)
        </button>
        {confirmDelete ? (
          <div className="flex gap-2">
            <button
              className="btn-primary flex-1 bg-red-700 hover:bg-red-800"
              onClick={async () => {
                await deleteAll()
                setConfirmDelete(false)
                toast('Dati cancellati', { tone: 'ok' })
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
        <span className="flex-1 font-medium">Come funziona, fonti e privacy</span>
        <ChevronRight className="text-stone-400" />
      </Link>
    </div>
  )
}
