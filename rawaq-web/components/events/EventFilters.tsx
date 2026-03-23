'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useCallback } from 'react'
import { useLocale } from '@/contexts/locale-context'

const CATEGORIES = [
  'sports', 'art', 'music', 'tech', 'food',
  'community', 'education', 'health', 'business', 'entertainment',
]

const CITIES = [
  'Riyadh', 'Jeddah', 'Dammam', 'Mecca', 'Medina',
  'Khobar', 'Tabuk', 'Abha', 'Taif',
]

export function EventFilters() {
  const { t } = useLocale()
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

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
        {CATEGORIES.map((c) => (
          <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
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

      {/* Clear all */}
      {(category || city || gender || freeOnly || familyFriendly || params.get('q')) && (
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
