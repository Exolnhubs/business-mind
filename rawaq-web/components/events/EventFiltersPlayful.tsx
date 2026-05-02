'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { useLocale } from '@/contexts/locale-context'
import { clientGetJson } from '@/lib/client-fetch'

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
  const paramsSnapshot = params.toString()
  const query = params.get('q') ?? ''
  const [, startTransition] = useTransition()
  const [geoLoading, setGeoLoading] = useState(false)
  const [radiusDisplay, setRadiusDisplay] = useState<number | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [searchValue, setSearchValue] = useState(query)
  const pendingSearchQueryRef = useRef<string | null>(null)
  const [, setFadeLeft] = useState(false)
  const [, setFadeRight] = useState(false)
  const catsRef = useRef<HTMLDivElement>(null)
  const { dir } = useLocale()

  // ── Drag-to-scroll (document-level so it works outside the element bounds) ──
  useEffect(() => {
    const el = catsRef.current
    if (!el) return

    let isDown = false
    let startX = 0
    let scrollLeft = 0
    let didDrag = false

    const updateFades = () => {
      setFadeLeft(el.scrollLeft > 4)
      setFadeRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 4)
    }

    // Document-level handlers keep the drag alive even when cursor leaves the row
    const onDocMouseMove = (e: MouseEvent) => {
      if (!isDown) return
      e.preventDefault()
      const walk = e.clientX - startX
      if (Math.abs(walk) > 4) didDrag = true
      el.scrollLeft = scrollLeft - walk * 1.4
    }

    const onDocMouseUp = () => {
      if (!isDown) return
      isDown = false
      el.classList.remove('ef-cats-track--dragging')
      document.removeEventListener('mousemove', onDocMouseMove)
      document.removeEventListener('mouseup', onDocMouseUp)
    }

    const onMouseDown = (e: MouseEvent) => {
      isDown = true
      didDrag = false
      startX = e.clientX
      scrollLeft = el.scrollLeft
      el.classList.add('ef-cats-track--dragging')
      document.addEventListener('mousemove', onDocMouseMove)
      document.addEventListener('mouseup', onDocMouseUp)
    }

    const onClickCapture = (e: MouseEvent) => {
      if (didDrag) { e.stopPropagation(); didDrag = false }
    }

    el.addEventListener('mousedown', onMouseDown)
    el.addEventListener('click', onClickCapture, true)
    el.addEventListener('scroll', updateFades, { passive: true })

    return () => {
      el.removeEventListener('mousedown', onMouseDown)
      el.removeEventListener('click', onClickCapture, true)
      el.removeEventListener('scroll', updateFades)
      document.removeEventListener('mousemove', onDocMouseMove)
      document.removeEventListener('mouseup', onDocMouseUp)
    }
  }, [])

  // ── Fetch categories + recalculate fades once content is known ──
  useEffect(() => {
    clientGetJson<{ data?: Category[] }>('/api/categories', { ttlMs: 60 * 60 * 1000 })
      .then((json) => {
        setCategories(json.data ?? [])
        // Wait one frame for the DOM to reflect the new pill widths
        requestAnimationFrame(() => {
          const el = catsRef.current
          if (!el) return
          setFadeRight(el.scrollWidth > el.clientWidth + 4)
        })
      })
      .catch(() => { })
  }, [])

  const replaceWithParams = useCallback(
    (nextParams: URLSearchParams) => {
      const qs = nextParams.toString()
      startTransition(() => {
        router.replace(`${pathname}${qs ? `?${qs}` : ''}`, { scroll: false })
      })
    },
    [pathname, router, startTransition],
  )

  const setParam = useCallback(
    (key: string, value: string | null) => {
      const currentValue = params.get(key)
      const normalizedValue = value && value.length > 0 ? value : null
      if ((currentValue ?? null) === normalizedValue) return
      const p = new URLSearchParams(paramsSnapshot)
      if (value) p.set(key, value)
      else p.delete(key)
      p.delete('page')
      replaceWithParams(p)
    },
    [params, paramsSnapshot, replaceWithParams],
  )

  useEffect(() => {
    if (pendingSearchQueryRef.current === query) {
      pendingSearchQueryRef.current = null
      return
    }

    setSearchValue(query)
  }, [query])

  useEffect(() => {
    const normalizedSearch = searchValue.trim()
    if (normalizedSearch === query) return

    const timeoutId = window.setTimeout(() => {
      pendingSearchQueryRef.current = normalizedSearch
      const nextParams = new URLSearchParams(paramsSnapshot)
      if (normalizedSearch) nextParams.set('q', normalizedSearch)
      else nextParams.delete('q')
      nextParams.delete('page')
      replaceWithParams(nextParams)
    }, 320)

    return () => window.clearTimeout(timeoutId)
  }, [paramsSnapshot, query, replaceWithParams, searchValue])

  const toggleBool = (key: string) => {
    const current = params.get(key)
    setParam(key, current ? null : 'true')
  }

  const hasGeo = !!(params.get('lat') && params.get('lng'))

  function useNearMe() {
    if (hasGeo) {
      const p = new URLSearchParams(paramsSnapshot)
      p.delete('lat'); p.delete('lng'); p.delete('radius_km'); p.delete('page')
      replaceWithParams(p)
      return
    }
    if (!navigator.geolocation) return
    setGeoLoading(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const p = new URLSearchParams(paramsSnapshot)
        p.set('lat', String(pos.coords.latitude))
        p.set('lng', String(pos.coords.longitude))
        p.set('radius_km', '25')
        p.delete('page')
        replaceWithParams(p)
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
  const hotOffers = params.get('hot') === 'true'
  const hasFilters = !!(category || city || gender || freeOnly || familyFriendly || hotOffers || query || hasGeo)
  const activeCount = [category, city, gender, query, freeOnly ? '1' : '', familyFriendly ? '1' : '', hotOffers ? '1' : '', hasGeo ? '1' : ''].filter(Boolean).length

  return (
    <div className="ef-wrap">

      {/* ── Dark header ─────────────────────────────────── */}
      <div className="ef-header">
        <div className="ef-pattern" aria-hidden="true" />
        <div className="ef-header-inner">
          <div>
            <p className="ef-eyebrow">{t('events.filters.panel.badge')}</p>
            <h3 className="ef-title">{t('events.filters.panel.title')}</h3>
          </div>
          <div className="ef-header-right">
            <span className={`ef-count-badge${activeCount > 0 ? ' ef-count-badge--active' : ''}`}>
              <span className={`ef-count-dot${activeCount > 0 ? ' ef-count-dot--lit' : ''}`} aria-hidden="true" />
              {t('events.filters.panel.active').replace('{n}', String(activeCount))}
            </span>
            {hasFilters && (
              <button
                onClick={() => {
                  pendingSearchQueryRef.current = ''
                  setSearchValue('')
                  replaceWithParams(new URLSearchParams())
                }}
                className="ef-clear-btn"
                aria-label="Clear all filters"
              >
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
                  <path d="M1.5 1.5L8.5 8.5M8.5 1.5L1.5 8.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
                {t('events.filters.reset')}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Body ────────────────────────────────────────── */}
      <div className="ef-body">

        {/* Row 1 — Search + City + Audience */}
        <div className="ef-row-1">
          {/* Search */}
          <div className="ef-search-wrap">
            <svg className="ef-search-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5" />
              <path d="M10.5 10.5L13.5 13.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <input
              type="search"
              placeholder={t('events.filters.search_placeholder')}
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              className="ef-search-input"
            />
          </div>

          {/* City */}
          <div className="ef-select-wrap">
            <span className="ef-select-label">{t('auth.city')}</span>
            <div className="ef-select-row">
              <select
                value={city}
                onChange={(e) => setParam('city', e.target.value || null)}
                className="ef-select"
              >
                <option value="">{t('events.filter.all_cities')}</option>
                {CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <svg className="ef-chevron" width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          </div>

          {/* Audience */}
          <div className="ef-select-wrap">
            <span className="ef-select-label">{t('events.filters.audience')}</span>
            <div className="ef-select-row">
              <select
                value={gender}
                onChange={(e) => setParam('gender', e.target.value || null)}
                className="ef-select"
              >
                <option value="">{t('events.filters.all_genders')}</option>
                <option value="mixed">{t('events.filter.gender.mixed')}</option>
                <option value="male">{t('events.filter.gender.male')}</option>
                <option value="female">{t('events.filter.gender.female')}</option>
              </select>
              <svg className="ef-chevron" width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          </div>
        </div>

        <div className="ef-divider" />

        {/* Row 2 — Category pills (horizontal scroll + drag) */}
        <div className="ef-cats-wrap">
           {/* {fadeLeft && <div className="ef-cats-fade ef-cats-fade--left" aria-hidden="true" />} */}
          { dir === 'ltr' && <div className="ef-cats-fade ef-cats-fade--right" aria-hidden="true" />} 
          { dir === 'rtl' && <div className="ef-cats-fade ef-cats-fade--left" aria-hidden="true" />} 

          <div ref={catsRef} className="ef-cats-track">
            <button
              onClick={() => setParam('category', null)}
              className={`ef-cat-pill${!category ? ' ef-cat-pill--active' : ''}`}
              style={{ animationDelay: '0ms' }}
            >
              {t('events.filter.all_categories')}
            </button>
            {categories.map((cat, i) => (
              <button
                key={cat.id}
                onClick={() => setParam('category', category === cat.id ? null : cat.id)}
                className={`ef-cat-pill${category === cat.id ? ' ef-cat-pill--active' : ''}`}
                style={{ animationDelay: `${(i + 1) * 38}ms` }}
              >
                {cat.icon && <span aria-hidden="true">{cat.icon}</span>}
                {  dir === 'rtl' ? cat.name_ar : cat.name_en}
              </button>
            ))}
          </div>
        </div>

        <div className="ef-divider" />

        {/* Row 3 — Quick-toggle chips */}
        <div className="ef-toggles">
          <button
            onClick={() => toggleBool('free')}
            className={`ef-toggle${freeOnly ? ' ef-toggle--on ef-toggle--green' : ''}`}
          >
            <span aria-hidden="true">{freeOnly ? '✓' : '💸'}</span>
            {t('events.filter.free_only')}
          </button>

          <button
            onClick={() => toggleBool('family')}
            className={`ef-toggle${familyFriendly ? ' ef-toggle--on ef-toggle--blue' : ''}`}
          >
            <span aria-hidden="true">{familyFriendly ? '✓' : '👨‍👩‍👧'}</span>
            {t('events.filter.family_friendly')}
          </button>

          <button
            onClick={() => toggleBool('hot')}
            className={`ef-toggle${hotOffers ? ' ef-toggle--on ef-toggle--amber' : ''}`}
          >
            <span aria-hidden="true">{hotOffers ? '✓' : '🔥'}</span>
            {t('events.filter.hot_offers')}
          </button>

          <button
            onClick={useNearMe}
            disabled={geoLoading}
            className={`ef-toggle${hasGeo ? ' ef-toggle--on ef-toggle--amber' : ''}${geoLoading ? ' ef-toggle--loading' : ''}`}
          >
            <span
              className={geoLoading ? 'ef-geo-pulse' : ''}
              aria-hidden="true"
            >
              {geoLoading ? '◌' : hasGeo ? '📡' : '📍'}
            </span>
            {geoLoading
              ? 'Locating…'
              : hasGeo
                ? t('events.filters.near_me_active')
                : t('events.filters.use_near_me')}
          </button>
        </div>

        {hasGeo && (
          <div className="ef-radius-row">
            <span className="ef-radius-label">📍 Within</span>
            <input
              type="range"
              min={5}
              max={100}
              step={5}
              value={radiusDisplay ?? Number(params.get('radius_km') ?? 25)}
              onChange={(e) => setRadiusDisplay(Number(e.target.value))}
              onMouseUp={(e) => {
                const val = (e.target as HTMLInputElement).value
                setRadiusDisplay(null)
                const p = new URLSearchParams(paramsSnapshot)
                p.set('radius_km', val)
                p.delete('page')
                replaceWithParams(p)
              }}
              onTouchEnd={(e) => {
                const val = (e.target as HTMLInputElement).value
                setRadiusDisplay(null)
                const p = new URLSearchParams(paramsSnapshot)
                p.set('radius_km', val)
                p.delete('page')
                replaceWithParams(p)
              }}
              className="ef-radius-slider"
            />
            <span className="ef-radius-value">{radiusDisplay ?? params.get('radius_km') ?? 25} km</span>
          </div>
        )}

      </div>
    </div>
  )
}
