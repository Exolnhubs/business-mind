'use client'

import { useEffect } from 'react'
import { CircleMarker, MapContainer, TileLayer, useMap, useMapEvents } from 'react-leaflet'

export type PickedLocation = {
  lat: number
  lng: number
  label: string
}

function MapClickHandler({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(event) {
      onPick(event.latlng.lat, event.latlng.lng)
    },
  })

  return null
}

function RecenterMap({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap()

  useEffect(() => {
    map.setView([lat, lng], Math.max(map.getZoom(), 15), { animate: true })
  }, [lat, lng, map])

  return null
}

export function LeafletLocationMap({
  selected,
  onPick,
}: {
  selected: PickedLocation | null
  onPick: (lat: number, lng: number) => void
}) {
  const center: [number, number] = selected ? [selected.lat, selected.lng] : [29.9792, 31.1342]

  return (
    <MapContainer
      center={center}
      zoom={selected ? 15 : 11}
      scrollWheelZoom
      className="h-[320px] w-full rounded-2xl"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <MapClickHandler onPick={onPick} />
      {selected && (
        <>
          <RecenterMap lat={selected.lat} lng={selected.lng} />
          <CircleMarker
            center={[selected.lat, selected.lng]}
            radius={10}
            pathOptions={{
              color: '#d97706',
              weight: 3,
              fillColor: '#f59e0b',
              fillOpacity: 0.85,
            }}
          />
        </>
      )}
    </MapContainer>
  )
}
