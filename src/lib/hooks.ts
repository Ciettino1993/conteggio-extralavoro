import { useQuery } from '@tanstack/react-query'
import { FUEL_LABEL, fuelCostPerKm, fuelStats, loadFuelMeta, loadStationsAround, type FuelStats } from './fuel'
import type { Settings } from './settings'
import { todayIso } from './units'

/** Distributori e prezzi carburante attorno alla posizione salvata. */
export function useFuelData(settings: Settings) {
  const loc = settings.location
  return useQuery({
    queryKey: ['fuel', loc?.lat.toFixed(3), loc?.lon.toFixed(3), settings.fuelRadiusKm],
    enabled: !!loc,
    queryFn: async () => {
      const meta = await loadFuelMeta()
      if (!meta || !loc) return { meta: null, stations: [] }
      const stations = await loadStationsAround(meta, loc, settings.fuelRadiusKm)
      return { meta, stations }
    },
  })
}

export interface TravelCost {
  pricePerLitre: number | null
  priceSource: 'mimit' | 'manuale' | null
  costPerKm: number
  costPerMinute: number
  stats: FuelStats | null
  description: string
}

/** Costo per km dello spostamento: prezzo medio carburante entro il raggio diviso per i km/l dell'auto. */
export function useTravelCost(settings: Settings) {
  const fuel = useFuelData(settings)
  const meta = fuel.data?.meta
  const stats = meta
    ? fuelStats(fuel.data!.stations, settings.fuelType, {
        refDate: meta.extraction ?? todayIso(),
        self: settings.useSelfService,
      })
    : null
  let pricePerLitre: number | null = null
  let priceSource: TravelCost['priceSource'] = null
  if (settings.manualFuelPrice) {
    pricePerLitre = settings.manualFuelPrice
    priceSource = 'manuale'
  } else if (stats?.avg) {
    pricePerLitre = stats.avg
    priceSource = 'mimit'
  }
  const costPerKm = pricePerLitre ? fuelCostPerKm(pricePerLitre, settings.kmPerLitre) : 0
  const label = `${FUEL_LABEL[settings.fuelType].toLowerCase()} ${settings.useSelfService ? 'self' : 'servito'}`
  const description =
    priceSource === 'mimit'
      ? `${label}: media di ${stats!.count} distributori entro ${settings.fuelRadiusKm} km`
      : priceSource === 'manuale'
        ? `${label}: prezzo inserito da te`
        : 'prezzo carburante non disponibile: lo spostamento non viene conteggiato'
  const value: TravelCost = {
    pricePerLitre,
    priceSource,
    costPerKm,
    costPerMinute: settings.timeValuePerHour / 60,
    stats,
    description,
  }
  return { ...value, isLoading: fuel.isLoading, meta }
}
