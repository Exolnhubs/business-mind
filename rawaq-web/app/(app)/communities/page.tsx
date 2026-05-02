'use client'

import { useCallback, useDeferredValue, useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/auth-context'
import { useLocale } from '@/contexts/locale-context'
import { HorizontalDragScroll } from '@/components/ui/HorizontalDragScroll'
import { Spinner } from '@/components/ui/Spinner'
import { clientFetchInvalidate, clientGetJson, clientPostJson, clientDeleteJson } from '@/lib/client-fetch'
import type { Community, CommunityLevel } from '@/types/database'

// ── Types ─────────────────────────────────────────────────────
type CommunityWithMembership = Community & {
  is_member: boolean
  event_count?: number
}
type TrendingCommunity = CommunityWithMembership & { trending_score?: number }
type MembershipMutationResponse = { is_member?: boolean; member_count?: number }

// ── Level config ──────────────────────────────────────────────
const LEVEL_COLORS: Record<CommunityLevel, string> = {
  micro:    '#3dba6a',
  interest: '#8b6be8',
  district: '#f5a623',
  city:     '#2ab8a0',
  country:  '#e85d3a',
}

const ALL_LEVELS: CommunityLevel[] = ['micro', 'interest', 'district', 'city', 'country']

// ── Search icon ───────────────────────────────────────────────
function SearchIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={2}
      style={{ color: 'oklch(0.52 0.015 72)', flexShrink: 0 }}>
      <circle cx={11} cy={11} r={8} />
      <path strokeLinecap="round" d="m21 21-4.35-4.35" />
    </svg>
  )
}

// ── Dark Community Card ───────────────────────────────────────
function CommunityCardDark({
  community,
  onToggleMembership,
}: {
  community: CommunityWithMembership
  onToggleMembership: (slug: string, joined: boolean, memberCount?: number) => void
}) {
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const { t, locale } = useLocale()
  const isAr = locale === 'ar'
  const ff = isAr ? 'var(--font-arabic)' : 'var(--font-display)'
  const fb = isAr ? 'var(--font-arabic)' : 'var(--font-sans)'
  const color = LEVEL_COLORS[community.level]
  const name = isAr && community.name_ar ? community.name_ar : community.name
  const desc = isAr && community.description_ar ? community.description_ar : community.description

  async function handleJoinLeave(e: React.MouseEvent<HTMLButtonElement>) {
    e.stopPropagation()
    setLoading(true)
    const endpoint = community.is_member
      ? `/api/communities/${community.slug}/leave`
      : `/api/communities/${community.slug}/join`
    try {
      const json = community.is_member
        ? await clientDeleteJson<{ data?: MembershipMutationResponse }>(endpoint)
        : await clientPostJson<{ data?: MembershipMutationResponse }>(endpoint, {})
      clientFetchInvalidate('/api/communities')
      onToggleMembership(
        community.slug,
        json.data?.is_member ?? !community.is_member,
        json.data?.member_count,
      )
    } catch { /* toast-handled */ }
    setLoading(false)
  }

  return (
    <article
      className="dark-comm-card"
      onClick={() => router.push(`/communities/${community.slug}`)}
    >
      {/* Cover image or gradient */}
      {community.cover_url ? (
        <div className="relative h-[120px] w-full">
          <Image src={community.cover_url} alt="" fill sizes="(max-width: 768px) 100vw, 33vw" className="object-cover" />
        </div>
      ) : (
        <div style={{
          height: 120,
          background: `linear-gradient(135deg, ${color}28, ${color}08)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          position: 'relative',
        }}>
          <span style={{
            fontSize: 40, fontFamily: ff, fontWeight: 800, color: `${color}50`,
          }}>
            {name[0]}
          </span>
          {community.is_verified && (
            <div style={{
              position: 'absolute', top: 10, insetInlineStart: 10,
              background: 'oklch(0.10 0.02 68 / 0.85)', backdropFilter: 'blur(8px)',
              fontSize: 10, fontWeight: 600, padding: '3px 10px', borderRadius: 20,
              color: '#2ab8a0', border: '1px solid #2ab8a035',
            }}>
              ✓ {t('comm.verified')}
            </div>
          )}
        </div>
      )}

      {/* Body */}
      <div style={{
        padding: '14px 16px', flex: 1, display: 'flex',
        flexDirection: 'column', gap: 8,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{
            fontFamily: ff, fontWeight: 600, fontSize: 15,
            color: 'oklch(0.94 0.01 82)', lineHeight: 1.3,
          }}>
            {name}
          </div>
          <span style={{
            background: `${color}18`, color,
            fontSize: 9, fontWeight: 700, padding: '3px 9px',
            borderRadius: 20, fontFamily: ff, letterSpacing: '0.05em',
            whiteSpace: 'nowrap', marginInlineStart: 8,
            textTransform: 'uppercase',
          }}>
            {t(`comm.level.${community.level}`)}
          </span>
        </div>

        {desc && (
          <div style={{
            fontSize: 12, color: 'oklch(0.52 0.015 72)',
            fontFamily: fb, lineHeight: 1.55,
            display: '-webkit-box', WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical', overflow: 'hidden',
          }}>
            {desc}
          </div>
        )}

        {/* Footer */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginTop: 'auto', paddingTop: 8,
          borderTop: '1px solid oklch(1 0 0 / 0.07)',
        }}>
          <div style={{ display: 'flex', gap: 12 }}>
            <span style={{ fontSize: 11, color: 'oklch(0.52 0.015 72)', fontFamily: fb }}>
              <span style={{ color: 'oklch(0.94 0.01 82)', fontWeight: 600 }}>
                {community.member_count.toLocaleString()}
              </span>{' '}
              {t('comm.member_count').replace('{n}', '').trim() || t('comm.members').replace('{n}', '').trim() || 'members'}
            </span>
            <span style={{ fontSize: 11, color: 'oklch(0.52 0.015 72)', fontFamily: fb }}>
              <span style={{ color: 'oklch(0.94 0.01 82)', fontWeight: 600 }}>
                {community.event_count ?? 0}
              </span>{' '}
              {t('comm.event_count').replace('{n}', '').trim() || 'events'}
            </span>
          </div>

          <button
            onClick={handleJoinLeave}
            disabled={loading}
            style={{
              background: community.is_member ? 'oklch(0.78 0.18 72 / 0.14)' : 'var(--c-gold)',
              border: community.is_member ? '1px solid oklch(0.78 0.18 72 / 0.45)' : 'none',
              color: community.is_member ? 'var(--c-gold)' : 'var(--c-ink)',
              fontSize: 12, fontWeight: 700, padding: '6px 16px',
              borderRadius: 8, cursor: 'pointer',
              fontFamily: ff, transition: 'all 0.2s',
              opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? '...' : community.is_member ? t('comm.joined') : t('comm.join')}
          </button>
        </div>
      </div>
    </article>
  )
}

// ── Community suggestion rail ─────────────────────────────────
function DarkCommRail({
  communities,
  title,
  color,
  onToggleMembership,
}: {
  communities: CommunityWithMembership[]
  title: string
  color: string
  onToggleMembership: (slug: string, joined: boolean, memberCount?: number) => void
}) {
  const { locale, dir } = useLocale()
  const isAr = locale === 'ar'
  const ff = isAr ? 'var(--font-arabic)' : 'var(--font-display)'

  if (communities.length === 0) return null

  const fadeColor = 'oklch(0.12 0.022 68)'

  return (
    <div style={{ marginBottom: 40 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <div style={{ width: 3, height: 18, borderRadius: 2, background: color }} />
        <span style={{ fontSize: 16, fontWeight: 700, color: 'oklch(0.94 0.01 82)', fontFamily: ff }}>
          {title}
        </span>
      </div>
      <HorizontalDragScroll
        ariaLabel={title}
        showEndFade
        fadeColor={fadeColor}
        dir={dir}
        contentStyle={{ gap: 16, paddingBottom: 12, alignItems: 'stretch' }}
      >
        {communities.map((c) => (
          <div key={c.id} style={{ width: 280, flexShrink: 0, display: 'flex', flexDirection: 'column' }}>
            <CommunityCardDark community={c} onToggleMembership={onToggleMembership} />
          </div>
        ))}
      </HorizontalDragScroll>
    </div>
  )
}

// ── Trending pill ─────────────────────────────────────────────
function TrendingPill({
  community,
  t,
  locale,
}: {
  community: TrendingCommunity
  onJoin: (c: TrendingCommunity) => void
  joining: string | null
  t: (k: string) => string
  locale: string
}) {
  const router = useRouter()
  const isAr = locale === 'ar'
  const ff = isAr ? 'var(--font-arabic)' : 'var(--font-display)'
  const color = LEVEL_COLORS[community.level]
  const name = isAr && community.name_ar ? community.name_ar : community.name

  return (
    <div
      className="dark-trending-pill"
      style={{ border: `1px solid ${color}40` }}
      onClick={() => router.push(`/communities/${community.slug}`)}
    >
      <div style={{
        width: 32, height: 32, borderRadius: '50%',
        background: `${color}22`, border: `1px solid ${color}50`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: ff, fontWeight: 700, fontSize: 13, color,
        flexShrink: 0,
      }}>
        {name[0]}
      </div>
      <div>
        <div style={{ fontFamily: ff, fontSize: 12, fontWeight: 600, color: 'oklch(0.94 0.01 82)' }}>
          {name}
        </div>
        <div style={{ fontSize: 10, color: 'oklch(0.52 0.015 72)' }}>
          {community.member_count.toLocaleString()} {t('comm.members').replace('{n}', '').trim()}
        </div>
      </div>
      <div style={{
        fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
        color: 'var(--c-gold)', background: 'oklch(0.78 0.18 72 / 0.12)',
        border: '1px solid oklch(0.78 0.18 72 / 0.3)', padding: '2px 8px', borderRadius: 20,
        fontFamily: ff, marginInlineStart: 4,
      }}>
        🔥 {t('comm.trending_badge')}
      </div>
    </div>
  )
}

// ── Communities Page ──────────────────────────────────────────
export default function CommunitiesPage() {
  const { user } = useAuth()
  const router = useRouter()
  const { t, locale } = useLocale()
  const isAr = locale === 'ar'
  const ff = isAr ? 'var(--font-arabic)' : 'var(--font-display)'
  const fb = isAr ? 'var(--font-arabic)' : 'var(--font-sans)'

  const cacheScopeKey = user?.id ?? null
  const [communities, setCommunities] = useState<CommunityWithMembership[]>([])
  const [loading,      setLoading]    = useState(true)
  const [level,        setLevel]      = useState<CommunityLevel | 'all'>('all')
  const [search,       setSearch]     = useState('')
  const [joinedOnly,   setJoinedOnly] = useState(false)
  const [page,         setPage]       = useState(1)
  const [hasMore,      setHasMore]    = useState(false)
  const [trending,     setTrending]   = useState<TrendingCommunity[]>([])
  const [trendingLoaded, setTrendingLoaded] = useState(false)
  const [joiningSlug,  setJoiningSlug] = useState<string | null>(null)
  const [recommended, setRecommended] = useState<CommunityWithMembership[]>([])
  const [suggested,   setSuggested]   = useState<CommunityWithMembership[]>([])

  const abortRef = useRef<AbortController | null>(null)
  const latestRef = useRef(0)
  const PER_PAGE = 18
  const deferredSearch = useDeferredValue(search)

  // ── Fetch trending (real API) ──────────────────────────────
  useEffect(() => {
    clientGetJson<{ data: { data: TrendingCommunity[] } }>(
      '/api/communities/trending?per_page=6&page=1',
      { ttlMs: 60_000, scopeKey: cacheScopeKey },
    )
      .then((r) => setTrending(r.data.data ?? []))
      .catch(() => setTrending([]))
      .finally(() => setTrendingLoaded(true))
  }, [cacheScopeKey])

  useEffect(() => {
    if (!user) return
    clientGetJson<{ data: { data: CommunityWithMembership[] } }>(
      '/api/communities?recommended=true&per_page=6',
      { ttlMs: 120_000, scopeKey: cacheScopeKey },
    )
      .then((r) => setRecommended((r.data.data ?? []).filter((c) => !c.is_member)))
      .catch(() => {})
  }, [cacheScopeKey, user])

  useEffect(() => {
    clientGetJson<{ data: { data: CommunityWithMembership[] } }>(
      '/api/communities?per_page=8',
      { ttlMs: 120_000, scopeKey: cacheScopeKey },
    )
      .then((r) => setSuggested((r.data.data ?? []).filter((c) => !c.is_member).slice(0, 6)))
      .catch(() => {})
  }, [cacheScopeKey])

  // ── Fetch communities (real API, debounced) ────────────────
  const fetchCommunities = useCallback(
    async (p: number, lvl: CommunityLevel | 'all', q: string, memberOnly = false) => {
      const controller = new AbortController()
      abortRef.current?.abort()
      abortRef.current = controller
      const rid = ++latestRef.current
      setLoading(true)

      const sp = new URLSearchParams({ page: String(p), per_page: String(PER_PAGE) })
      if (lvl !== 'all') sp.set('level', lvl)
      if (q.trim()) sp.set('q', q.trim())
      if (memberOnly) sp.set('member_only', 'true')

      try {
        const json = await clientGetJson<{
          data: { data: CommunityWithMembership[]; has_more: boolean }
        }>(`/api/communities?${sp}`, {
          ttlMs: 45_000, scopeKey: cacheScopeKey, signal: controller.signal,
        })
        if (latestRef.current !== rid) return
        setCommunities((prev) => p === 1 ? json.data.data : [...prev, ...json.data.data])
        setHasMore(json.data.has_more)
        setPage(p)
      } catch (err) {
        console.error(err)
        if (controller.signal.aborted) return
        if (p === 1) { setCommunities([]); setHasMore(false) }
      } finally {
        if (latestRef.current === rid) setLoading(false)
      }
    },
    [cacheScopeKey],
  )

  useEffect(() => {
    const tid = setTimeout(
      () => fetchCommunities(1, level, deferredSearch, joinedOnly),
      deferredSearch ? 220 : 0,
    )
    return () => clearTimeout(tid)
  }, [level, deferredSearch, joinedOnly, fetchCommunities])

  useEffect(() => () => { abortRef.current?.abort() }, [])

  // ── Join from trending strip ───────────────────────────────
  async function joinTrending(community: TrendingCommunity) {
    setJoiningSlug(community.slug)
    try {
      await clientPostJson(`/api/communities/${community.slug}/join`, {})
      clientFetchInvalidate('/api/communities')
      setTrending((prev) => prev.filter((c) => c.slug !== community.slug))
      setCommunities((prev) =>
        prev.map((c) =>
          c.slug === community.slug
            ? { ...c, is_member: true, member_count: c.member_count + 1 }
            : c,
        ),
      )
    } catch { /* toast-handled */ }
    setJoiningSlug(null)
  }

  // ── Toggle membership in local state ──────────────────────
  function handleToggleMembership(slug: string, joined: boolean, memberCount?: number) {
    const applyUpdate = (c: CommunityWithMembership) =>
      c.slug !== slug ? c : {
        ...c,
        is_member: joined,
        member_count: memberCount ?? (joined ? c.member_count + 1 : Math.max(c.member_count - 1, 0)),
      }

    setCommunities((prev) =>
      prev.map(applyUpdate).filter((c) => !joinedOnly || c.is_member),
    )
    if (joined) {
      setRecommended((prev) => prev.filter((c) => c.slug !== slug))
      setSuggested((prev) => prev.filter((c) => c.slug !== slug))
    }
  }

  const levelLabels: Record<CommunityLevel | 'all', string> = {
    all:      t('comm.level_all'),
    micro:    t('comm.level.micro'),
    interest: t('comm.level.interest'),
    district: t('comm.level.district'),
    city:     t('comm.level.city'),
    country:  t('comm.level.country'),
  }

  return (
    <div className="page-dark">
      {/* ── Hero ── */}
      <section className="dark-hero">
        {/* Star pattern */}
        <div
          aria-hidden
          style={{
            position: 'absolute', inset: 0, pointerEvents: 'none',
            backgroundImage: `
              repeating-linear-gradient(0deg,   oklch(1 0 0 / 0.055) 0px, transparent 1px, transparent 39px, oklch(1 0 0 / 0.055) 40px),
              repeating-linear-gradient(90deg,  oklch(1 0 0 / 0.055) 0px, transparent 1px, transparent 39px, oklch(1 0 0 / 0.055) 40px),
              repeating-linear-gradient(45deg,  oklch(1 0 0 / 0.028) 0px, transparent 1px, transparent 27px, oklch(1 0 0 / 0.028) 28px),
              repeating-linear-gradient(-45deg, oklch(1 0 0 / 0.028) 0px, transparent 1px, transparent 27px, oklch(1 0 0 / 0.028) 28px)`,
          }}
        />
        <div className="dark-hero-glow-a" aria-hidden />
        <div className="dark-hero-glow-b" aria-hidden />

        <div
          className="relative max-w-7xl mx-auto px-4 sm:px-6"
          style={{ paddingTop: '3.5rem', paddingBottom: '2.5rem' }}
        >
          {/* Badge */}
          <div
            className="animate-badge-pop"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              background: 'oklch(0.78 0.18 72 / 0.10)',
              border: '1px solid oklch(0.78 0.18 72 / 0.28)',
              borderRadius: 40, padding: '5px 14px', marginBottom: 20,
            }}
          >
            <div style={{
              width: 6, height: 6, borderRadius: '50%',
              background: 'var(--c-gold)',
              boxShadow: '0 0 6px oklch(0.78 0.18 72 / 0.8)',
            }} />
            <span style={{
              fontSize: 10, fontWeight: 700, letterSpacing: '0.14em',
              textTransform: 'uppercase', color: 'var(--c-gold)', fontFamily: ff,
            }}>
              {t('comm.heading_eyebrow')}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16, marginBottom: 16 }}>
            <div>
              <h1
                className="animate-hero-in"
                style={{
                  fontFamily: ff, fontWeight: isAr ? 800 : 700,
                  fontSize: 'clamp(32px, 5vw, 56px)',
                  lineHeight: 1.08, letterSpacing: isAr ? '-0.01em' : '-0.025em',
                  color: 'oklch(0.94 0.01 82)',
                }}
              >
                {t('comm.heading_title')}{' '}
                <span style={{ color: 'var(--c-gold)' }}>
                  {isAr ? 'ناسك.' : 'people.'}
                </span>
              </h1>
              <p
                className="animate-hero-in"
                style={{
                  fontSize: 15, lineHeight: 1.75, color: 'oklch(0.62 0.015 75)',
                  fontFamily: fb, fontWeight: 300, maxWidth: 520, marginTop: 10,
                  animationDelay: '0.12s',
                }}
              >
                {t('comm.heading_sub')}
              </p>
            </div>

            {user && (
              <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
                <button
                  onClick={() => setJoinedOnly((o) => !o)}
                  style={{
                    background: joinedOnly ? 'var(--c-gold)' : 'transparent',
                    border: `1px solid ${joinedOnly ? 'var(--c-gold)' : 'oklch(0.78 0.18 72 / 0.35)'}`,
                    color: joinedOnly ? 'var(--c-ink)' : 'var(--c-gold)',
                    fontSize: 13, fontWeight: 700, padding: '8px 18px',
                    borderRadius: 40, cursor: 'pointer', fontFamily: ff,
                    transition: 'all 0.2s',
                  }}
                >
                  {joinedOnly ? '✓' : '◎'} {t('comm.my_communities')}
                </button>
                <button
                  onClick={() => router.push('/communities/new')}
                  style={{
                    background: 'oklch(0.78 0.18 72 / 0.12)',
                    border: '1px solid oklch(0.78 0.18 72 / 0.30)',
                    color: 'var(--c-gold)',
                    fontSize: 13, fontWeight: 700, padding: '8px 18px',
                    borderRadius: 40, cursor: 'pointer', fontFamily: ff,
                    transition: 'all 0.2s',
                  }}
                >
                  + {t('comm.create')}
                </button>
              </div>
            )}
          </div>

          {/* Trending strip */}
          {trendingLoaded && trending.length > 0 && !joinedOnly && !search && (
            <div className="animate-hero-in" style={{ animationDelay: '0.22s' }}>
              <div style={{
                fontSize: 9, fontWeight: 700, letterSpacing: '0.14em',
                textTransform: 'uppercase', color: 'oklch(0.78 0.18 72 / 0.6)',
                fontFamily: ff, marginBottom: 12,
              }}>
                {t('comm.trending')}
              </div>
              <HorizontalDragScroll
                ariaLabel={t('comm.trending')}
                contentStyle={{ gap: 10, paddingBottom: 6 }}
              >
                {trending.map((c) => (
                  <div key={c.id} style={{ flexShrink: 0 }}>
                    <TrendingPill
                      community={c}
                      onJoin={joinTrending}
                      joining={joiningSlug}
                      t={t}
                      locale={locale}
                    />
                  </div>
                ))}
              </HorizontalDragScroll>
            </div>
          )}
        </div>
      </section>

      {/* ── Sticky filter panel ── */}
      <div style={{
        position: 'sticky', top: 64, zIndex: 50,
        background: 'var(--c-ink-mid)', padding: '0 1.5rem',
      }}>
        <div style={{ maxWidth: '80rem', margin: '0 auto' }}>
          <div style={{
            borderRadius: '0 0 1.25rem 1.25rem',
            border: '1px solid oklch(0.78 0.18 72 / 0.22)',
            borderTop: 'none',
            boxShadow: '0 8px 32px oklch(0 0 0 / 0.28)',
            overflow: 'hidden',
          }}>
            {/* Filter header */}
            <div style={{
              background: 'var(--c-ink)', padding: '0.75rem 1.25rem',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              position: 'relative', overflow: 'hidden',
            }}>
              <div aria-hidden style={{
                position: 'absolute', inset: 0, opacity: 0.4,
                backgroundImage: `
                  repeating-linear-gradient(0deg, oklch(1 0 0 / 0.055) 0px, transparent 1px, transparent 39px, oklch(1 0 0 / 0.055) 40px),
                  repeating-linear-gradient(90deg, oklch(1 0 0 / 0.055) 0px, transparent 1px, transparent 39px, oklch(1 0 0 / 0.055) 40px)`,
              }} />
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'oklch(0.78 0.18 72 / 0.6)', fontFamily: ff }}>
                  {t('comm.filter_eyebrow')}
                </span>
                <span style={{ fontSize: 14, fontWeight: 700, color: 'oklch(0.94 0.01 82)', fontFamily: ff }}>
                  {t('comm.filter_title')}
                </span>
              </div>
              {(search || level !== 'all') && (
                <button
                  onClick={() => { setSearch(''); setLevel('all') }}
                  style={{
                    position: 'relative', fontSize: 11, fontWeight: 600,
                    color: 'oklch(0.52 0.015 72)', background: 'transparent',
                    border: '1px solid oklch(1 0 0 / 0.10)', padding: '3px 10px',
                    borderRadius: 20, cursor: 'pointer', fontFamily: ff,
                  }}
                >
                  {t('comm.filter_clear')}
                </button>
              )}
            </div>

            {/* Filter body */}
            <div style={{
              background: 'var(--c-ink-mid)', padding: '0.875rem 1.25rem',
              display: 'flex', flexDirection: 'column', gap: 12,
            }}>
              {/* Search */}
              <div className="dark-search-wrap">
                <SearchIcon />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t('comm.filter_search')}
                  className="dark-search-input"
                />
              </div>

              {/* Level pills */}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {(['all', ...ALL_LEVELS] as (CommunityLevel | 'all')[]).map((l) => (
                  <button
                    key={l}
                    onClick={() => setLevel(l)}
                    className={`dark-cat-pill${level === l ? ' dark-cat-pill--active' : ''}`}
                    style={{ fontFamily: ff }}
                  >
                    {levelLabels[l]}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Grid ── */}
      <div style={{ maxWidth: '80rem', margin: '0 auto', padding: '2.5rem 1.5rem 5rem' }}>
        {!search && level === 'all' && !joinedOnly && (
          <>
            <DarkCommRail
              communities={recommended}
              title={t('comm.recommended')}
              color="#8b6be8"
              onToggleMembership={handleToggleMembership}
            />
            <DarkCommRail
              communities={suggested}
              title={t('comm.popular')}
              color="#2ab8a0"
              onToggleMembership={handleToggleMembership}
            />
          </>
        )}

        {loading && communities.length === 0 ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '5rem 0' }}>
            <Spinner />
          </div>
        ) : communities.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '5rem 0' }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>🏘️</div>
            <div style={{ fontFamily: ff, fontSize: 20, fontWeight: 600, color: 'oklch(0.94 0.01 82)', marginBottom: 8 }}>
              {joinedOnly ? t('comm.empty_joined') : t('comm.empty_none')}
            </div>
            <div style={{ fontSize: 14, color: 'oklch(0.52 0.015 72)', fontFamily: fb }}>
              {joinedOnly ? t('comm.empty_joined_desc') : t('comm.empty_none_desc')}
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {communities.map((c) => (
                <CommunityCardDark
                  key={c.id}
                  community={c}
                  onToggleMembership={handleToggleMembership}
                />
              ))}
            </div>

            {hasMore && (
              <div style={{ textAlign: 'center', paddingTop: 32 }}>
                <button
                  onClick={() => fetchCommunities(page + 1, level, search, joinedOnly)}
                  disabled={loading}
                  style={{
                    background: 'oklch(0.14 0.022 68)',
                    border: '1px solid oklch(0.78 0.18 72 / 0.3)',
                    color: 'var(--c-gold)',
                    fontSize: 13, fontWeight: 700,
                    padding: '10px 28px', borderRadius: 40,
                    cursor: 'pointer', fontFamily: ff,
                    display: 'inline-flex', alignItems: 'center', gap: 8,
                    opacity: loading ? 0.6 : 1,
                  }}
                >
                  {loading ? <Spinner size="sm" /> : t('comm.load_more')}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
