import { headers } from 'next/headers'
import { CommunitiesClient } from './CommunitiesClient'
import type { CommunitiesClientProps } from './CommunitiesClient'

// ── Server-side fetchers (cached, no auth, public data only) ─────────────────

async function getServerBaseUrl(): Promise<string> {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL
  const h = await headers()
  const host = h.get('host') ?? 'localhost:3000'
  const proto = process.env.NODE_ENV === 'production' ? 'https' : 'http'
  return `${proto}://${host}`
}

async function fetchServerCommunities(
  base: string,
): Promise<Pick<CommunitiesClientProps, 'initialCommunities' | 'initialHasMore' | 'initialLoadFailed'>> {
  try {
    const res = await fetch(
      `${base}/api/communities?page=1&per_page=18`,
      { next: { revalidate: 60 } },
    )
    if (!res.ok) {
      return { initialCommunities: [], initialHasMore: false, initialLoadFailed: true }
    }
    const json = await res.json()
    const data = json?.data ?? {}
    return {
      initialCommunities: (data.data ?? []).map((c: Record<string, unknown>) => ({
        ...c,
        is_member: false,   // anonymous server fetch — is_member updates client-side after auth
      })),
      initialHasMore: data.has_more ?? false,
      initialLoadFailed: false,
    }
  } catch {
    return { initialCommunities: [], initialHasMore: false, initialLoadFailed: true }
  }
}

async function fetchServerTrending(base: string): Promise<CommunitiesClientProps['initialTrending']> {
  try {
    const res = await fetch(
      `${base}/api/communities/trending?per_page=6&page=1`,
      { next: { revalidate: 300 } },
    )
    if (!res.ok) return []
    const json = await res.json()
    return (json?.data?.data ?? []).map((c: Record<string, unknown>) => ({
      ...c,
      is_member: false,
    }))
  } catch {
    return []
  }
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function CommunitiesPage() {
  const base = await getServerBaseUrl()

  const [{ initialCommunities, initialHasMore, initialLoadFailed }, initialTrending] = await Promise.all([
    fetchServerCommunities(base),
    fetchServerTrending(base),
  ])

  return (
    <CommunitiesClient
      initialCommunities={initialCommunities}
      initialHasMore={initialHasMore}
      initialLoadFailed={initialLoadFailed}
      initialTrending={initialTrending}
    />
  )
}
