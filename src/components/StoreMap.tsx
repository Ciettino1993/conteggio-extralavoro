import { useEffect } from 'react'
import { Circle, CircleMarker, MapContainer, Polyline, Popup, TileLayer, useMap } from 'react-leaflet'
import type { LatLon } from '../lib/geo'

export interface MapPoint extends LatLon {
  id: string
  label: string
  detail?: string
  color?: string
  radius?: number
}

function FitBounds({ points }: { points: LatLon[] }) {
  const map = useMap()
  const key = points.map((p) => `${p.lat.toFixed(4)},${p.lon.toFixed(4)}`).join('|')
  useEffect(() => {
    if (points.length === 1) map.setView([points[0].lat, points[0].lon], 14)
    else if (points.length > 1) map.fitBounds(points.map((p) => [p.lat, p.lon] as [number, number]), { padding: [30, 30] })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, map])
  return null
}

/** Mappa OpenStreetMap con casa, punti (negozi/distributori), raggio e percorso. */
export default function StoreMap({
  home,
  points,
  radiusKm,
  route,
  height = 280,
}: {
  home: LatLon
  points: MapPoint[]
  radiusKm?: number
  route?: [number, number][]
  height?: number
}) {
  const fit = radiusKm
    ? [
        { lat: home.lat + radiusKm / 111.32, lon: home.lon },
        { lat: home.lat - radiusKm / 111.32, lon: home.lon },
      ]
    : [home, ...points]
  return (
    <MapContainer center={[home.lat, home.lon]} zoom={13} style={{ height }} scrollWheelZoom={false}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        maxZoom={19}
      />
      <FitBounds points={fit} />
      {radiusKm && (
        <Circle center={[home.lat, home.lon]} radius={radiusKm * 1000} pathOptions={{ color: '#15803d', weight: 1, fillOpacity: 0.04 }} />
      )}
      {route && <Polyline positions={route} pathOptions={{ color: '#15803d', weight: 4, opacity: 0.8 }} />}
      {points.map((p) => (
        <CircleMarker
          key={p.id}
          center={[p.lat, p.lon]}
          radius={p.radius ?? 7}
          pathOptions={{ color: '#fff', weight: 2, fillColor: p.color ?? '#15803d', fillOpacity: 1 }}
        >
          <Popup>
            <strong>{p.label}</strong>
            {p.detail && <div>{p.detail}</div>}
          </Popup>
        </CircleMarker>
      ))}
      <CircleMarker center={[home.lat, home.lon]} radius={9} pathOptions={{ color: '#fff', weight: 3, fillColor: '#2563eb', fillOpacity: 1 }}>
        <Popup>Punto di partenza</Popup>
      </CircleMarker>
    </MapContainer>
  )
}
