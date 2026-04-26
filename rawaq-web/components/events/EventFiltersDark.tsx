'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useLocale } from '@/contexts/locale-context'
import { clientGetJson } from '@/lib/client-fetch'
import type { EventCategory } from '@/types/database'

// ── Search icon ───────────────────────────────────────────────
function SearchIcon({ className }: { className?: string }) {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={2} className={className}
      style={{ color: 'oklch(0.52 0.015 72)', flexShrink: 0 }}>
      <circle cx={11} cy={11} r={8} />
      <path strokeLinecap="round" d="m21 21-4.35-4.35" />
    </svg>
  )
}

function ChevronIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={2}
      style={{ color: 'oklch(0.52 0.015 72)', pointerEvents: 'none', flexShrink: 0 }}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  )
}

// ── Cities list ───────────────────────────────────────────────
const CITIES_EN = ['All Cities', 'Riyadh', 'Jeddah', 'Cairo', 'Dubai', 'Amman', 'Casablanca', 'Beirut', 'Kuwait City', 'Doha', 'Muscat', 'Tunis']
const CITIES_AR = ['كل المدن', 'الرياض', 'جدة', 'القاهرة', 'دبي', 'عمّان', 'الدار البيضاء', 'بيروت', 'الكويت', 'الدوحة', 'مسقط', 'تونس']

// ── Helper to push URL search params ─────────────────────────
function useFilterSync() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const pushFilter = useCallback(
    (updates: Record<string, string | null>) => {
      const sp = new URLSearchParams(searchParams.toString())
      sp.delete('page')
      Object.entries(updates).forEach(([k, v]) => {
        if (v === null || v === '') sp.delete(k)
        else sp.set(k, v)
      })
      router.push(`${pathname}?${sp.toString()}`, { scroll: false })
    },
    [router, pathname, searchParams],
  )

  return { searchParams, pushFilter }
}

// ── Main component ────────────────────────────────────────────
export function EventFiltersDark() {
  const { t, locale, dir } = useLocale()
  const { searchParams, pushFilter } = useFilterSync()
  const isAr = locale === 'ar'
  const ff = isAr ? 'var(--font-arabic)' : 'var(--font-display)'

  // Local UI state
  const [search, setSearch]         = useState(searchParams.get('q') ?? '')
  const [expanded, setExpanded]     = useState(true)
  const [geoLoading, setGeoLoading] = useState(false)
  const [radiusDisplay, setRadiusDisplay] = useState<number | null>(null)

  // Categories
  const [categories, setCategories] = useState<EventCategory[]>([])
  useEffect(() => {
    clientGetJson<{ data: EventCategory[] }>('/api/categories', { ttlMs: 5 * 60_000 })
      .then((res) => setCategories(res.data ?? []))
      .catch(() => setCategories([]))
  }, [])

  // ── Drag-to-scroll for category pills ────────────────────────
  const catsRef = useRef<HTMLDivElement>(null)
  const [fadeRight, setFadeRight] = useState(false)

  useEffect(() => {
    const el = catsRef.current
    if (!el) return

    let isDown = false
    let startX = 0
    let scrollLeft = 0
    let didDrag = false

    const updateFades = () => {
      setFadeRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 4)
    }

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
      el.style.cursor = 'grab'
      document.removeEventListener('mousemove', onDocMouseMove)
      document.removeEventListener('mouseup', onDocMouseUp)
    }

    const onMouseDown = (e: MouseEvent) => {
      isDown = true
      didDrag = false
      startX = e.clientX
      scrollLeft = el.scrollLeft
      el.style.cursor = 'grabbing'
      document.addEventListener('mousemove', onDocMouseMove)
      document.addEventListener('mouseup', onDocMouseUp)
    }

    const onClickCapture = (e: MouseEvent) => {
      if (didDrag) { e.stopPropagation(); didDrag = false }
    }

    el.style.cursor = 'grab'
    el.addEventListener('mousedown', onMouseDown)
    el.addEventListener('click', onClickCapture, true)
    el.addEventListener('scroll', updateFades, { passive: true })

    // Initial fade state once categories populate
    requestAnimationFrame(() => {
      if (el) setFadeRight(el.scrollWidth > el.clientWidth + 4)
    })

    return () => {
      el.removeEventListener('mousedown', onMouseDown)
      el.removeEventListener('click', onClickCapture, true)
      el.removeEventListener('scroll', updateFades)
      document.removeEventListener('mousemove', onDocMouseMove)
      document.removeEventListener('mouseup', onDocMouseUp)
    }
  }, [])

  // Re-evaluate fade when categories load
  useEffect(() => {
    requestAnimationFrame(() => {
      const el = catsRef.current
      if (el) setFadeRight(el.scrollWidth > el.clientWidth + 4)
    })
  }, [categories])

  // ── Derived from URL ──────────────────────────────────────────
  const activeCat    = searchParams.get('category') ?? ''
  const activeCity   = searchParams.get('city') ?? ''
  const activeGender = searchParams.get('gender') ?? ''
  const isFree       = searchParams.get('free') === 'true'
  const isFamily     = searchParams.get('family') === 'true'
  const isHot        = searchParams.get('hot') === 'true'
  const hasGeo       = !!(searchParams.get('lat') && searchParams.get('lng'))

  const activeCount = [search, activeCat, activeCity, activeGender, isFree, isFamily, isHot, hasGeo]
    .filter(Boolean).length

  // ── Debounced search ──────────────────────────────────────────
  const searchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  function handleSearchChange(v: string) {
    setSearch(v)
    clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => pushFilter({ q: v || null }), 300)
  }

  // ── Reset all ─────────────────────────────────────────────────
  function resetAll() {
    setSearch('')
    pushFilter({
      q: null, category: null, city: null, gender: null,
      free: null, family: null, hot: null,
      lat: null, lng: null, radius_km: null,
    })
  }

  // ── Near Me ───────────────────────────────────────────────────
  function handleNearMe() {
    if (hasGeo) {
      pushFilter({ lat: null, lng: null, radius_km: null })
      return
    }
    if (!navigator.geolocation) return
    setGeoLoading(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        pushFilter({
          lat: String(pos.coords.latitude),
          lng: String(pos.coords.longitude),
          radius_km: '25',
        })
        setGeoLoading(false)
      },
      () => setGeoLoading(false),
    )
  }

  const cities = isAr ? CITIES_AR : CITIES_EN
  const genderOptions = [
    t('events.filters.all_genders'),
    t('events.filter.gender.male'),
    t('events.filter.gender.female'),
  ]
  const genderValues = ['', 'male', 'female']

  // Fade gradient color matches filter body background
  const fadeColor = 'var(--c-ink-mid, oklch(0.18 0.025 68))'

  return (
    <div className="dark-filter-panel">
      {/* Header */}
      <div
        className="dark-filter-header"
        onClick={() => setExpanded((o) => !o)}
        role="button"
        aria-expanded={expanded}
      >
        <div
          aria-hidden
          style={{
            position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.5,
            backgroundImage: `
              repeating-linear-gradient(0deg,   oklch(1 0 0 / 0.055) 0px, transparent 1px, transparent 39px, oklch(1 0 0 / 0.055) 40px),
              repeating-linear-gradient(90deg,  oklch(1 0 0 / 0.055) 0px, transparent 1px, transparent 39px, oklch(1 0 0 / 0.055) 40px)`,
          }}
        />

        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            fontSize: 9, fontWeight: 700, letterSpacing: '0.16em',
            textTransform: 'uppercase', color: 'oklch(0.78 0.18 72 / 0.65)',
            fontFamily: ff,
          }}>
            {t('events.filters.panel.badge')}
          </div>
          <div style={{
            fontSize: 14, fontWeight: 700,
            color: 'oklch(0.94 0.01 82)', fontFamily: ff,
          }}>
            {t('events.filters.panel.title')}
          </div>
        </div>

        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 8 }}>
          {activeCount > 0 && (
            <>
              <span style={{
                fontSize: 11, fontWeight: 600, color: 'var(--c-gold)',
                background: 'oklch(0.78 0.18 72 / 0.10)',
                border: '1px solid oklch(0.78 0.18 72 / 0.28)',
                padding: '3px 10px', borderRadius: 20, fontFamily: ff,
              }}>
                {t('events.filters.panel.active').replace('{n}', String(activeCount))}
              </span>
              <button
                onClick={(e) => { e.stopPropagation(); resetAll() }}
                style={{
                  fontSize: 11, fontWeight: 600, color: 'oklch(0.52 0.015 72)',
                  background: 'transparent',
                  border: '1px solid oklch(1 0 0 / 0.10)',
                  padding: '3px 10px', borderRadius: 20, cursor: 'pointer',
                  fontFamily: ff, transition: 'all 0.18s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = 'oklch(0.88 0.01 80)')}
                onMouseLeave={(e) => (e.currentTarget.style.color = 'oklch(0.52 0.015 72)')}
              >
                {t('events.filters.reset')}
              </button>
            </>
          )}
          <span style={{ color: 'oklch(0.42 0.01 72)', fontSize: 11 }}>
            {expanded ? '▲' : '▼'}
          </span>
        </div>
      </div>

      {/* Body */}
      {expanded && (
        <div className="dark-filter-body">
          {/* Row 1: Search + City + Gender */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <div className="dark-search-wrap">
              <SearchIcon />
              <input
                type="search"
                value={search}
                onChange={(e) => handleSearchChange(e.target.value)}
                placeholder={t('events.filters.search_placeholder')}
                className="dark-search-input"
              />
            </div>

            <div className="dark-select-wrap">
              <div className="dark-select-label">{t('auth.city')}</div>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center', marginTop: 3 }}>
                <select
                  value={activeCity}
                  onChange={(e) => pushFilter({ city: e.target.value || null })}
                  className="dark-select"
                  style={{ paddingInlineEnd: 20 }}
                >
                  {cities.map((c, i) => (
                    <option key={i} value={i === 0 ? '' : c} style={{ background: '#1a1612' }}>{c}</option>
                  ))}
                </select>
                <div style={{ position: 'absolute', insetInlineEnd: 0 }}><ChevronIcon /></div>
              </div>
            </div>

            <div className="dark-select-wrap">
              <div className="dark-select-label">{t('events.filters.audience')}</div>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center', marginTop: 3 }}>
                <select
                  value={activeGender}
                  onChange={(e) => pushFilter({ gender: e.target.value || null })}
                  className="dark-select"
                  style={{ paddingInlineEnd: 20 }}
                >
                  {genderOptions.map((g, i) => (
                    <option key={i} value={genderValues[i]} style={{ background: '#1a1612' }}>{g}</option>
                  ))}
                </select>
                <div style={{ position: 'absolute', insetInlineEnd: 0 }}><ChevronIcon /></div>
              </div>
            </div>
          </div>

          {/* Category pills — drag-to-scroll */}
          <div style={{ position: 'relative' }}>
            {/* Right fade overlay */}
            {fadeRight && (
              <div
                aria-hidden
                style={{
                  position: 'absolute',
                  insetInlineEnd: 0, top: 0, bottom: 2,
                  width: 48, pointerEvents: 'none', zIndex: 1,
                  background: dir === 'rtl'
                    ? `linear-gradient(to left, ${fadeColor}, transparent)`
                    : `linear-gradient(to right, ${fadeColor}, transparent)`,
                }}
              />
            )}
            <div
              ref={catsRef}
              style={{
                display: 'flex', gap: 8,
                overflowX: 'auto', paddingBottom: 2,
                scrollbarWidth: 'none',
                userSelect: 'none',
              }}
            >
              <button
                onClick={() => pushFilter({ category: null })}
                className={`dark-cat-pill${!activeCat ? ' dark-cat-pill--active' : ''}`}
                style={{ fontFamily: ff }}
              >
                {t('events.filter.all_categories')}
              </button>
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => pushFilter({ category: activeCat === cat.id ? null : cat.id })}
                  className={`dark-cat-pill${activeCat === cat.id ? ' dark-cat-pill--active' : ''}`}
                  style={{ fontFamily: ff }}
                >
                  {cat.icon && <span style={{ marginInlineEnd: 4 }}>{cat.icon}</span>}
                  {locale === 'ar' ? cat.name_ar : cat.name_en}
                </button>
              ))}
            </div>
          </div>

          {/* Toggle chips — including Near Me */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {[
              { label: t('events.filter.free_only'),      key: 'free',   val: isFree,   color: 'green', icon: '🎫' },
              { label: t('events.filter.family_friendly'), key: 'family', val: isFamily, color: 'blue',  icon: '👨‍👩‍👧' },
              { label: t('events.filter.hot_offers'),      key: 'hot',    val: isHot,    color: 'red',   icon: '🔥' },
            ].map(({ label, key, val, color, icon }) => (
              <button
                key={key}
                onClick={() => pushFilter({ [key]: val ? null : 'true' })}
                className={`dark-toggle dark-toggle--${color}${val ? ' dark-toggle--on' : ''}`}
                style={{ fontFamily: ff }}
              >
                <span>{icon}</span>
                {label}
              </button>
            ))}

            {/* Near Me */}
            <button
              onClick={handleNearMe}
              disabled={geoLoading}
              className={`dark-toggle dark-toggle--amber${hasGeo ? ' dark-toggle--on' : ''}`}
              style={{ fontFamily: ff, opacity: geoLoading ? 0.65 : 1 }}
            >
              <span>{geoLoading ? '◌' : hasGeo ? '📡' : '📍'}</span>
              {geoLoading
                ? 'Locating…'
                : hasGeo
                  ? t('events.filters.near_me_active')
                  : t('events.filters.use_near_me')}
            </button>
          </div>

          {/* Radius slider — shown when geo is active */}
          {hasGeo && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              background: 'oklch(0.78 0.18 72 / 0.06)',
              border: '1px solid oklch(0.78 0.18 72 / 0.18)',
              borderRadius: '0.75rem', padding: '0.5rem 1rem',
            }}>
              <span style={{ fontSize: 11, color: 'oklch(0.52 0.015 72)', whiteSpace: 'nowrap', fontFamily: ff }}>
                📍 Within
              </span>
              <input
                type="range"
                min={5} max={100} step={5}
                value={radiusDisplay ?? Number(searchParams.get('radius_km') ?? 25)}
                onChange={(e) => setRadiusDisplay(Number(e.target.value))}
                onMouseUp={(e) => {
                  const val = (e.target as HTMLInputElement).value
                  setRadiusDisplay(null)
                  pushFilter({ radius_km: val })
                }}
                onTouchEnd={(e) => {
                  const val = (e.target as HTMLInputElement).value
                  setRadiusDisplay(null)
                  pushFilter({ radius_km: val })
                }}
                style={{ flex: 1, accentColor: 'var(--c-gold)' }}
              />
              <span style={{
                fontSize: 12, fontWeight: 700, color: 'var(--c-gold)',
                minWidth: 44, textAlign: 'end', fontFamily: ff,
              }}>
                {radiusDisplay ?? searchParams.get('radius_km') ?? 25} km
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
