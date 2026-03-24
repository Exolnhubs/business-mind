'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { useLocale } from '@/contexts/locale-context'

interface Category {
  id: string
  name_en: string
  name_ar: string
  icon: string | null
}

const CITIES = [
  // Saudi Arabia
  'Riyadh', 'Jeddah', 'Dammam', 'Mecca', 'Medina', 'Khobar', 'Tabuk', 'Abha', 'Taif',
  // UAE
  'Dubai', 'Abu Dhabi', 'Sharjah',
  // Egypt
  'Cairo', 'Alexandria', 'Giza',
  // Jordan
  'Amman', 'Aqaba',
  // Kuwait
  'Kuwait City',
  // Qatar
  'Doha',
  // Bahrain
  'Manama',
  // Oman
  'Muscat', 'Salalah',
  // Lebanon
  'Beirut',
  // Morocco
  'Casablanca', 'Marrakech',
  // Tunisia
  'Tunis',
  // Iraq
  'Baghdad',
  // Palestine
  'Ramallah',
]

export function EventFilters() {
  const { t } = useLocale()
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [geoLoading, setGeoLoading] = useState(false)
  const [categories, setCategories] = useState<Category[]>([])

  useEffect(() => {
    fetch('/api/categories')
      .then((r) => r.json())
      .then((json) => setCategories(json.data ?? []))
      .catch(() => {})
  }, [])

  const setParam = useCallback(
    (key: string, value: string | null) => {
      const p = new URLSearchParams(params.toString())
      if (value) p.set(key, value)
      else p.delete(key)
      p.delete('page') // reset pagination
      router.push(`${pathname}?${p.toString()}`)
    },
    [params, pathname, router],
  )

  const toggleBool = (key: string) => {
    const current = params.get(key)
    setParam(key, current ? null : 'true')
  }

  const hasGeo = !!(params.get('lat') && params.get('lng'))

  function useNearMe() {
    if (hasGeo) {
      // Clear geo filter
      const p = new URLSearchParams(params.toString())
      p.delete('lat'); p.delete('lng'); p.delete('radius_km'); p.delete('page')
      router.push(`${pathname}?${p.toString()}`)
      return
    }
    if (!navigator.geolocation) return
    setGeoLoading(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const p = new URLSearchParams(params.toString())
        p.set('lat', String(pos.coords.latitude))
        p.set('lng', String(pos.coords.longitude))
        p.set('radius_km', '25')
        p.delete('page')
        router.push(`${pathname}?${p.toString()}`)
        setGeoLoading(false)
      },
      () => setGeoLoading(false),
    )
  }

  const category = params.get('category') ?? ''
  const city = params.get('city') ?? ''
  const gender = params.get('gender') ?? ''
  const freeOnly = params.get('free') === 'true'
  const familyFriendly = params.get('family') === 'true'

  return (
    <div className="flex flex-wrap gap-3 items-center">
      {/* Search */}
      <input
        type="search"
        placeholder={`🔍 ${t('common.search')}`}
        defaultValue={params.get('q') ?? ''}
        onChange={(e) => setParam('q', e.target.value || null)}
        className="input w-44 h-9 text-xs py-1.5"
      />

      {/* Category */}
      <select
        value={category}
        onChange={(e) => setParam('category', e.target.value || null)}
        className="input w-auto h-9 text-xs py-1.5 pe-8 cursor-pointer"
      >
        <option value="">{t('events.filter.all_categories')}</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.icon ? `${c.icon} ` : ''}{c.name_en}
          </option>
        ))}
      </select>

      {/* City */}
      <select
        value={city}
        onChange={(e) => setParam('city', e.target.value || null)}
        className="input w-auto h-9 text-xs py-1.5 pe-8 cursor-pointer"
      >
        <option value="">{t('events.filter.all_cities')}</option>
        {CITIES.map((c) => (
          <option key={c} value={c}>{c}</option>
        ))}
      </select>

      {/* Gender */}
      <select
        value={gender}
        onChange={(e) => setParam('gender', e.target.value || null)}
        className="input w-auto h-9 text-xs py-1.5 pe-8 cursor-pointer"
      >
        <option value="">All genders</option>
        <option value="mixed">{t('events.filter.gender.mixed')}</option>
        <option value="male">{t('events.filter.gender.male')}</option>
        <option value="female">{t('events.filter.gender.female')}</option>
      </select>

      {/* Toggle chips */}
      <button
        onClick={() => toggleBool('free')}
        className={`text-xs font-medium px-3 py-1.5 rounded-full border transition-colors ${
          freeOnly
            ? 'bg-green-50 border-green-200 text-green-700'
            : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
        }`}
      >
        {t('events.filter.free_only')}
      </button>

      <button
        onClick={() => toggleBool('family')}
        className={`text-xs font-medium px-3 py-1.5 rounded-full border transition-colors ${
          familyFriendly
            ? 'bg-blue-50 border-blue-200 text-blue-700'
            : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
        }`}
      >
        {t('events.filter.family_friendly')}
      </button>

      {/* Near me */}
      <button
        onClick={useNearMe}
        disabled={geoLoading}
        className={`text-xs font-medium px-3 py-1.5 rounded-full border transition-colors ${
          hasGeo
            ? 'bg-brand-50 border-brand-200 text-brand-700'
            : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
        } disabled:opacity-50`}
      >
        {geoLoading ? '⌛' : '📍'} {hasGeo ? 'Near me ✕' : 'Near me'}
      </button>

      {/* Clear all */}
      {(category || city || gender || freeOnly || familyFriendly || params.get('q') || hasGeo) && (
        <button
          onClick={() => router.push(pathname)}
          className="text-xs text-gray-400 hover:text-gray-600 underline"
        >
          Clear all
        </button>
      )}
    </div>
  )
}
