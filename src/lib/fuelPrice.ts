import { useQuery } from '@tanstack/react-query'
import { FUEL_LABEL, fuelCostPerKm, fuelStats, loadFuelMeta, loadStationsAround } from './fuel'
import type { LatLon } from './geo'
import type { Settings } from './settings'
import { todayIso } from './units'

export interface FuelPrice {
  pricePerLitre: number | null
  source: 'mimit' | 'manuale' | null
  costPerKm: number
  stations: number
  extraction: string | null
  description: string
}

/** Prezzo medio del carburante entro il raggio impostato (dati MIMIT), oppure il prezzo inserito a mano. */
export async function fuelPriceAt(position: LatLon | null, s: Settings): Promise<FuelPrice> {
  const label = `${FUEL_LABEL[s.fuelType].toLowerCase()} ${s.useSelfService ? 'self' : 'servito'}`
  if (s.manualFuelPrice) {
    return {
      pricePerLitre: s.manualFuelPrice,
      source: 'manuale',
      costPerKm: fuelCostPerKm(s.manualFuelPrice, s.kmPerLitre),
      stations: 0,
      extraction: null,
      description: `${label}: prezzo inserito da te`,
    }
  }
  const meta = position ? await loadFuelMeta() : null
  if (!position || !meta) {
    return {
      pricePerLitre: null,
      source: null,
      costPerKm: 0,
      stations: 0,
      extraction: null,
      description: position ? 'prezzi carburante non disponibili' : 'posizione non ancora rilevata',
    }
  }
  const stations = await loadStationsAround(meta, position, s.fuelRadiusKm)
  const stats = fuelStats(stations, s.fuelType, { refDate: meta.extraction ?? todayIso(), self: s.useSelfService })
  return {
    pricePerLitre: stats.avg,
    source: stats.avg ? 'mimit' : null,
    costPerKm: stats.avg ? fuelCostPerKm(stats.avg, s.kmPerLitre) : 0,
    stations: stats.count,
    extraction: meta.extraction,
    description: stats.avg
      ? `${label}: media di ${stats.count} distributori entro ${s.fuelRadiusKm} km`
      : `nessun prezzo di ${label} entro ${s.fuelRadiusKm} km`,
  }
}

export function useFuelPrice(position: LatLon | null, s: Settings) {
  return useQuery({
    queryKey: ['prezzo', position?.lat.toFixed(2), position?.lon.toFixed(2), s.fuelType, s.useSelfService, s.fuelRadiusKm, s.manualFuelPrice, s.kmPerLitre],
    queryFn: () => fuelPriceAt(position, s),
  })
}
