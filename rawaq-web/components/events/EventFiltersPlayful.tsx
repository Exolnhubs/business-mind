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
  'Riyadh', 'Jeddah', 'Dammam', 'Mecca', 'Medina', 'Khobar', 'Tabuk', 'Abha', 'Taif',
  'Dubai', 'Abu Dhabi', 'Sharjah',
  'Cairo', 'Alexandria', 'Giza',
  'Amman', 'Aqaba',
  'Kuwait City',
  'Doha',
  'Manama',
  'Muscat', 'Salalah',
  'Beirut',
  'Casablanca', 'Marrakech',
  'Tunis',
  'Baghdad',
  'Ramallah',
]

export function EventFiltersPlayful() {
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
      p.delete('page')
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
      const p = new URLSearchParams(params.toString())
      p.delete('lat')
      p.delete('lng')
      p.delete('radius_km')
      p.delete('page')
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
  const query = params.get('q') ?? ''
  const activeCount = [category, city, gender, query, freeOnly ? 'free' : '', familyFriendly ? 'family' : '', hasGeo ? 'geo' : '']
    .filter(Boolean)
    .length

  return (
    <div className="relative overflow-hidden rounded-[2rem] border border-gray-200 bg-white/90 p-4 shadow-[0_20px_60px_rgb(15_23_42_/_.08)] backdrop-blur sm:p-5">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-r from-brand-100/50 via-transparent to-orange-100/50" />

      <div className="relative space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gray-400">{t('events.filters.panel.badge')}</p>
            <h3 className="text-lg font-bold text-gray-900">{t('events.filters.panel.title')}</h3>
            <p className="text-sm text-gray-500">{t('events.filters.panel.subtitle')}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-semibold text-gray-600">
              <span className="h-2 w-2 rounded-full bg-brand-500" />
              {t('events.filters.panel.active').replace('{n}', String(activeCount))}
            </span>
            {(category || city || gender || freeOnly || familyFriendly || query || hasGeo) && (
              <button
                onClick={() => router.push(pathname)}
                className="inline-flex items-center gap-2 rounded-full border border-transparent bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-black"
              >
                {t('events.filters.reset')}
              </button>
            )}
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-[1.35fr_repeat(3,minmax(0,0.8fr))]">
          <label className="group flex min-h-[74px] flex-col justify-between rounded-[1.5rem] border border-gray-200 bg-gradient-to-br from-white to-gray-50 px-4 py-3 shadow-sm transition hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-md">
            <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-gray-400">{t('common.search')}</span>
            <input
              type="search"
              placeholder={t('events.filters.search_placeholder')}
              defaultValue={query}
              onChange={(e) => setParam('q', e.target.value || null)}
              className="mt-2 w-full border-0 bg-transparent px-0 py-0 text-sm font-medium text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-0"
            />
          </label>

          <label className="flex min-h-[74px] flex-col justify-between rounded-[1.5rem] border border-gray-200 bg-white px-4 py-3 shadow-sm transition hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-md">
            <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-gray-400">{t('events.filters.category')}</span>
            <select
              value={category}
              onChange={(e) => setParam('category', e.target.value || null)}
              className="mt-2 w-full cursor-pointer border-0 bg-transparent px-0 py-0 text-sm font-medium text-gray-900 focus:outline-none focus:ring-0"
            >
              <option value="">{t('events.filter.all_categories')}</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.icon ? `${c.icon} ` : ''}{c.name_en}
                </option>
              ))}
            </select>
          </label>

          <label className="flex min-h-[74px] flex-col justify-between rounded-[1.5rem] border border-gray-200 bg-white px-4 py-3 shadow-sm transition hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-md">
            <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-gray-400">{t('auth.city')}</span>
            <select
              value={city}
              onChange={(e) => setParam('city', e.target.value || null)}
              className="mt-2 w-full cursor-pointer border-0 bg-transparent px-0 py-0 text-sm font-medium text-gray-900 focus:outline-none focus:ring-0"
            >
              <option value="">{t('events.filter.all_cities')}</option>
              {CITIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </label>

          <label className="flex min-h-[74px] flex-col justify-between rounded-[1.5rem] border border-gray-200 bg-white px-4 py-3 shadow-sm transition hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-md">
            <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-gray-400">{t('events.filters.audience')}</span>
            <select
              value={gender}
              onChange={(e) => setParam('gender', e.target.value || null)}
              className="mt-2 w-full cursor-pointer border-0 bg-transparent px-0 py-0 text-sm font-medium text-gray-900 focus:outline-none focus:ring-0"
            >
              <option value="">{t('events.filters.all_genders')}</option>
              <option value="mixed">{t('events.filter.gender.mixed')}</option>
              <option value="male">{t('events.filter.gender.male')}</option>
              <option value="female">{t('events.filter.gender.female')}</option>
            </select>
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => toggleBool('free')}
            className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition ${
              freeOnly
                ? 'border-green-200 bg-green-50 text-green-700 shadow-sm'
                : 'border-gray-200 bg-white text-gray-600 hover:border-green-200 hover:bg-green-50/70 hover:text-green-700'
            }`}
          >
            <span>{freeOnly ? '✨' : '💸'}</span>
            {t('events.filter.free_only')}
          </button>

          <button
            onClick={() => toggleBool('family')}
            className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition ${
              familyFriendly
                ? 'border-blue-200 bg-blue-50 text-blue-700 shadow-sm'
                : 'border-gray-200 bg-white text-gray-600 hover:border-blue-200 hover:bg-blue-50/70 hover:text-blue-700'
            }`}
          >
            <span>{familyFriendly ? '🪁' : '👨‍👩‍👧'}</span>
            {t('events.filter.family_friendly')}
          </button>

          <button
            onClick={useNearMe}
            disabled={geoLoading}
            className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition disabled:opacity-50 ${
              hasGeo
                ? 'border-brand-200 bg-brand-50 text-brand-700 shadow-sm'
                : 'border-gray-200 bg-white text-gray-600 hover:border-brand-200 hover:bg-brand-50/80 hover:text-brand-700'
            }`}
          >
            <span>{geoLoading ? '...' : hasGeo ? '📡' : '📍'}</span>
            {hasGeo ? t('events.filters.near_me_active') : t('events.filters.use_near_me')}
          </button>
        </div>
      </div>
    </div>
  )
}
