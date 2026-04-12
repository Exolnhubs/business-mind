'use client'

import dynamic from 'next/dynamic'
import { useEffect, useMemo, useState } from 'react'

const LeafletLocationMap = dynamic(
  () => import('./LeafletLocationMap').then((mod) => mod.LeafletLocationMap),
  { ssr: false },
)

export type PickedLocation = {
  lat: number
  lng: number
  label: string
  address: string
  city: string
  country: string
  countryCode: string
}

type NominatimResult = {
  display_name: string
  lat: string
  lon: string
  address?: {
    city?: string
    town?: string
    village?: string
    municipality?: string
    county?: string
    state_district?: string
    state?: string
    country?: string
    country_code?: string
    road?: string
    house_number?: string
    suburb?: string
    neighbourhood?: string
  }
}

function toPickedLocation(lat: number, lng: number, label: string, address?: NominatimResult['address']): PickedLocation {
  const rawCity =
    address?.city ||
    address?.town ||
    address?.village ||
    address?.municipality ||
    address?.county ||
    address?.state_district ||
    address?.state ||
    ''
  const city = (rawCity || address?.country || 'Selected area').slice(0, 100)

  const streetAddress = [address?.house_number, address?.road].filter(Boolean).join(' ').trim()
  const fallbackAddress = [
    streetAddress,
    address?.suburb,
    address?.neighbourhood,
    city,
    address?.country,
  ].filter(Boolean).join(', ')

  return {
    lat,
    lng,
    label,
    address: fallbackAddress || label,
    city,
    country: address?.country || '',
    countryCode: address?.country_code?.toUpperCase() || '',
  }
}

async function reverseGeocode(lat: number, lng: number): Promise<PickedLocation> {
  const res = await fetch(
    `https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&lat=${lat}&lon=${lng}`,
  )
  const json = await res.json().catch(() => null) as NominatimResult | null
  const label = json?.display_name?.trim() || `${lat.toFixed(5)}, ${lng.toFixed(5)}`
  return toPickedLocation(lat, lng, label, json?.address)
}

export function LocationPickerModal({
  open,
  initialLocation,
  onClose,
  onConfirm,
}: {
  open: boolean
  initialLocation: PickedLocation | null
  onClose: () => void
  onConfirm: (location: PickedLocation | null) => void
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<NominatimResult[]>([])
  const [searching, setSearching] = useState(false)
  const [resolving, setResolving] = useState(false)
  const [selected, setSelected] = useState<PickedLocation | null>(initialLocation)

  useEffect(() => {
    if (open) {
      setSelected(initialLocation)
      setQuery(initialLocation?.label ?? '')
      setResults([])
    }
  }, [initialLocation, open])

  const hasSelection = useMemo(() => !!selected, [selected])

  async function searchLocation() {
    if (!query.trim()) return
    setSearching(true)
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=5&q=${encodeURIComponent(query.trim())}`,
      )
      const json = await res.json().catch(() => []) as NominatimResult[]
      setResults(json)
    } finally {
      setSearching(false)
    }
  }

  async function handleMapPick(lat: number, lng: number) {
    setResolving(true)
    try {
      const location = await reverseGeocode(lat, lng)
      setSelected(location)
      setQuery(location.label)
      setResults([])
    } finally {
      setResolving(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 px-4 py-6">
      <div className="w-full max-w-3xl rounded-[28px] bg-white p-5 shadow-2xl">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h3 className="text-xl font-bold text-gray-900">Pick meetup location</h3>
            <p className="mt-1 text-sm text-gray-500">
              Search a place like a gate, cafe, or landmark, or tap directly on the map.
            </p>
          </div>
          <button onClick={onClose} className="btn-ghost text-xs">
            Close
          </button>
        </div>

        <div className="mb-4 flex flex-col gap-3 sm:flex-row">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search for a meetup spot"
            className="input flex-1"
          />
          <button type="button" onClick={searchLocation} disabled={searching || !query.trim()} className="btn-secondary sm:min-w-[132px]">
            {searching ? 'Searching...' : 'Search'}
          </button>
        </div>

        {results.length > 0 && (
          <div className="mb-4 max-h-44 overflow-y-auto rounded-2xl border border-gray-100 bg-gray-50 p-2">
            {results.map((result) => (
              <button
                key={`${result.lat}-${result.lon}-${result.display_name}`}
                type="button"
                onClick={() => {
                  const location = toPickedLocation(
                    Number(result.lat),
                    Number(result.lon),
                    result.display_name,
                    result.address,
                  )
                  setSelected(location)
                  setQuery(location.label)
                  setResults([])
                }}
                className="flex w-full flex-col rounded-xl px-3 py-2 text-left hover:bg-white"
              >
                <span className="text-sm font-medium text-gray-800">{result.display_name}</span>
                <span className="text-xs text-gray-400">
                  {Number(result.lat).toFixed(5)}, {Number(result.lon).toFixed(5)}
                </span>
              </button>
            ))}
          </div>
        )}

        <LeafletLocationMap selected={selected} onPick={handleMapPick} />

        <div className="mt-4 rounded-2xl border border-brand-100 bg-brand-50 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-700">Selected spot</p>
          {hasSelection ? (
            <div className="mt-1">
              <p className="text-sm font-semibold text-gray-900">{selected?.label}</p>
              <p className="text-xs text-gray-500">
                {selected?.lat.toFixed(5)}, {selected?.lng.toFixed(5)}
              </p>
            </div>
          ) : (
            <p className="mt-1 text-sm text-gray-500">No meetup spot selected yet.</p>
          )}
          {resolving && <p className="mt-2 text-xs text-brand-700">Updating selected address...</p>}
        </div>

        <div className="mt-5 flex flex-wrap justify-between gap-3">
          <button
            type="button"
            onClick={() => {
              setSelected(null)
              setQuery('')
              setResults([])
            }}
            className="btn-ghost text-xs"
          >
            Clear selection
          </button>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="btn-secondary">
              Cancel
            </button>
            <button
              type="button"
              onClick={() => onConfirm(selected)}
              className="btn-primary"
            >
              Confirm location
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

