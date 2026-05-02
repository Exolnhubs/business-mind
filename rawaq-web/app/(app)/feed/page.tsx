import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import type { Metadata } from 'next'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { EventCard, EventCardSkeleton } from '@/components/events/EventCard'
import type { EventWithOrganizer } from '@/types/database'
import { applyResolvedEventWindow, compareEventsByResolvedStartAt } from '@/lib/events/recurrence'
import { FeedPageHeader, FeedEmptyNoFollows, FeedEmptyNoEvents, FeedFollowingLabel, FeedPagination } from '@/components/feed/FeedStrings'

export const metadata: Metadata = { title: 'Following Feed' }

const PAGE_SIZE = 12

async function FeedGrid({ userId, page }: { userId: string; page: number }) {
  const supabase = await createSupabaseServerClient()
  const from = (page - 1) * PAGE_SIZE

  // Organizers the user follows
  const { data: follows } = await supabase
    .from('organizer_follows')
    .select('organizer_id, organizer:profiles!organizer_id(id, display_name, organizer_profile:organizer_profiles!user_id(business_name, logo_url))')
    .eq('follower_id', userId)

  const orgIds = (follows ?? []).map((f) => f.organizer_id)

  if (orgIds.length === 0) {
    return <FeedEmptyNoFollows />
  }

  const [{ data: events }, { data: saves }] = await Promise.all([
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
      .eq('is_cancelled', false),
    supabase
      .from('saved_events')
      .select('event_id')
      .eq('user_id', userId),
  ])

  const resolvedEvents = ((events ?? []) as unknown as EventWithOrganizer[])
    .map((event) => applyResolvedEventWindow(event))
    .filter((event) => new Date(event.start_at).getTime() >= Date.now())
    .sort((left, right) => compareEventsByResolvedStartAt(left, right))
  const pagedEvents = resolvedEvents.slice(from, from + PAGE_SIZE)
  const savedIds    = new Set((saves ?? []).map((s) => s.event_id))
  const totalPages  = Math.ceil(resolvedEvents.length / PAGE_SIZE)

  const followChips = (follows ?? []).slice(0, 8).map((f) => {
    const op = (f.organizer as unknown as { id: string; display_name: string; organizer_profile: { business_name: string } | null } | null)
    return { id: f.organizer_id, name: op?.organizer_profile?.business_name ?? op?.display_name ?? '?', href: `/organizer/${f.organizer_id}` }
  })

  return (
    <div className="space-y-6">
      <FeedFollowingLabel follows={followChips} total={follows?.length ?? 0} />
      {!pagedEvents.length ? (
        <FeedEmptyNoEvents />
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {pagedEvents.map((event) => (
              <EventCard key={event.id} event={event} isSaved={savedIds.has(event.id)} showSave />
            ))}
          </div>
          {totalPages > 1 && <FeedPagination page={page} totalPages={totalPages} />}
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
      <FeedPageHeader />

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
