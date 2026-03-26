import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { EventCard, EventCardSkeleton } from '@/components/events/EventCard'
import { EmptyState } from '@/components/ui/EmptyState'
import type { EventWithOrganizer } from '@/types/database'

export const metadata: Metadata = { title: 'Following Feed' }

const PAGE_SIZE = 12

async function FeedGrid({ userId, page }: { userId: string; page: number }) {
  const supabase = await createSupabaseServerClient()
  const from = (page - 1) * PAGE_SIZE
  const to   = from + PAGE_SIZE - 1

  // Organizers the user follows
  const { data: follows } = await supabase
    .from('organizer_follows')
    .select('organizer_id, organizer:profiles!organizer_id(id, display_name, organizer_profile:organizer_profiles!user_id(business_name, logo_url))')
    .eq('follower_id', userId)

  const orgIds = (follows ?? []).map((f) => f.organizer_id)

  if (orgIds.length === 0) {
    return (
      <EmptyState
        icon="👥"
        title="You're not following anyone yet"
        description="Follow organizers to see their upcoming events here."
        action={<Link href="/events" className="btn-primary mt-4 inline-flex">Browse Events</Link>}
      />
    )
  }

  const [{ data: events, count }, { data: saves }] = await Promise.all([
    supabase
      .from('events')
      .select(`
        *,
        organizer:profiles!organizer_id(
          id, display_name, avatar_url,
          organizer_profile:organizer_profiles!user_id(business_name, business_name_ar, logo_url, verified)
        ),
        category:event_categories(id, name_en, name_ar, icon)
      `, { count: 'exact' })
      .in('organizer_id', orgIds)
      .eq('is_published', true)
      .eq('is_cancelled', false)
      .gte('start_at', new Date().toISOString())
      .order('start_at', { ascending: true })
      .range(from, to),
    supabase
      .from('saved_events')
      .select('event_id')
      .eq('user_id', userId),
  ])

  const savedIds    = new Set((saves ?? []).map((s) => s.event_id))
  const totalPages  = Math.ceil((count ?? 0) / PAGE_SIZE)

  return (
    <div className="space-y-6">
      {/* Following chips */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-gray-400">Following:</span>
        {(follows ?? []).slice(0, 8).map((f) => {
          const op = (f.organizer as unknown as { id: string; display_name: string; organizer_profile: { business_name: string; logo_url: string | null } | null } | null)
          return (
            <Link
              key={f.organizer_id}
              href={`/organizer/${f.organizer_id}`}
              className="text-xs bg-brand-50 text-brand-700 border border-brand-100 px-2.5 py-1 rounded-full hover:bg-brand-100 transition-colors"
            >
              {op?.organizer_profile?.business_name ?? op?.display_name ?? '?'}
            </Link>
          )
        })}
        {(follows?.length ?? 0) > 8 && (
          <span className="text-xs text-gray-400">+{(follows?.length ?? 0) - 8} more</span>
        )}
      </div>

      {!events?.length ? (
        <EmptyState
          icon="📭"
          title="No upcoming events from people you follow"
          description="The organizers you follow haven't posted any upcoming events yet."
        />
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {(events as unknown as EventWithOrganizer[]).map((event) => (
              <EventCard
                key={event.id}
                event={event}
                isSaved={savedIds.has(event.id)}
                showSave
              />
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-4">
              {page > 1 && (
                <Link href={`/feed?page=${page - 1}`} className="btn-secondary text-sm">← Prev</Link>
              )}
              <span className="text-sm text-gray-400">Page {page} of {totalPages}</span>
              {page < totalPages && (
                <Link href={`/feed?page=${page + 1}`} className="btn-secondary text-sm">Next →</Link>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default async function FeedPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>
}) {
  const { page: pageParam } = await searchParams
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const page = Math.max(1, Number(pageParam ?? 1))

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Following</h1>
        <p className="text-sm text-gray-500 mt-0.5">Upcoming events from organizers you follow</p>
      </div>

      <Suspense fallback={
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <EventCardSkeleton key={i} />)}
        </div>
      }>
        <FeedGrid userId={user.id} page={page} />
      </Suspense>
    </div>
  )
}
