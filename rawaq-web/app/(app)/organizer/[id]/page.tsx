import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { EventCard } from '@/components/events/EventCard'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { FollowButton } from '@/components/social/FollowButton'
import { BlockButton } from '@/components/social/BlockButton'
import { formatDate } from '@/lib/utils'
import type { EventWithOrganizer } from '@/types/database'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const supabase = await createSupabaseServerClient()
  const { data } = await supabase
    .from('organizer_profiles')
    .select('business_name')
    .eq('user_id', id)
    .single()
  return { title: data?.business_name ?? 'Organizer' }
}

export default async function OrganizerProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createSupabaseServerClient()

  const [
    { data: profile },
    { data: orgProfile },
    { data: events },
    { data: { user } },
    { data: communityMemberships },
  ] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, display_name, avatar_url, city, bio, created_at')
      .eq('id', id)
      .single(),
    supabase
      .from('organizer_profiles')
      .select('business_name, business_name_ar, description, description_ar, logo_url, website, phone, verified, status, followers_count')
      .eq('user_id', id)
      .single(),
    supabase
      .from('events')
      .select(`
        *,
        organizer:profiles!organizer_id(
          id, display_name, avatar_url,
          organizer_profile:organizer_profiles!user_id(business_name, business_name_ar, logo_url, verified)
        ),
        category:event_categories(id, name_en, name_ar, icon)
      `)
      .eq('organizer_id', id)
      .eq('is_published', true)
      .eq('is_cancelled', false)
      .gte('start_at', new Date().toISOString())
      .order('start_at', { ascending: true })
      .limit(12),
    supabase.auth.getUser(),
    supabase
      .from('community_memberships')
      .select('community:communities(id, name, slug, level, member_count)')
      .eq('user_id', id)
      .eq('status', 'active')
      .limit(12),
  ])

  if (!profile || !orgProfile || orgProfile.status !== 'approved') notFound()

  // Viewer-specific state: saved events, is following, is blocking
  let savedIds      = new Set<string>()
  let isFollowing   = false
  let isBlocking    = false

  if (user && user.id !== id) {
    const [savesRes, followRes, blockRes] = await Promise.all([
      events?.length
        ? supabase
            .from('saved_events')
            .select('event_id')
            .eq('user_id', user.id)
            .in('event_id', events.map((e) => e.id))
        : Promise.resolve({ data: [] }),
      supabase
        .from('organizer_follows')
        .select('id')
        .eq('follower_id', user.id)
        .eq('organizer_id', id)
        .maybeSingle(),
      supabase
        .from('user_blocks')
        .select('id')
        .eq('blocker_id', user.id)
        .eq('blocked_id', id)
        .maybeSingle(),
    ])
    savedIds    = new Set(((savesRes as { data: { event_id: string }[] | null }).data ?? []).map((s) => s.event_id))
    isFollowing = !!followRes.data
    isBlocking  = !!blockRes.data
  } else if (user && events?.length) {
    const { data: saves } = await supabase
      .from('saved_events')
      .select('event_id')
      .eq('user_id', user.id)
      .in('event_id', events.map((e) => e.id))
    savedIds = new Set((saves ?? []).map((s) => s.event_id))
  }

  const displayName = orgProfile.business_name ?? profile.display_name
  const initials    = displayName.split(' ').slice(0, 2).map((w: string) => w[0]).join('').toUpperCase()

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-8">
      {/* Header card */}
      <div className="card p-6 flex flex-col sm:flex-row items-start sm:items-center gap-5">
        <div className="w-20 h-20 rounded-2xl bg-brand-100 flex items-center justify-center text-2xl font-bold text-brand-700 shrink-0 overflow-hidden">
          {orgProfile.logo_url
            ? <img src={orgProfile.logo_url} alt={displayName} className="w-full h-full object-cover" />
            : initials
          }
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <h1 className="text-xl font-bold text-gray-900">{displayName}</h1>
            {orgProfile.verified && <Badge variant="green">✅ Verified</Badge>}
          </div>
          {orgProfile.business_name_ar && (
            <p className="text-sm text-gray-500 mb-1" dir="rtl">{orgProfile.business_name_ar}</p>
          )}
          {profile.city && <p className="text-sm text-gray-500">📍 {profile.city}</p>}
          <p className="text-xs text-gray-400 mt-1">Member since {formatDate(profile.created_at)}</p>
        </div>

        <div className="flex flex-col items-end gap-3 shrink-0">
          {/* Contact links */}
          <div className="flex flex-col gap-1.5 text-sm">
            {orgProfile.website && (
              <a href={orgProfile.website} target="_blank" rel="noopener noreferrer"
                className="text-brand-600 hover:underline flex items-center gap-1">
                🌐 Website
              </a>
            )}
            {orgProfile.phone && (
              <a href={`tel:${orgProfile.phone}`} className="text-gray-600 flex items-center gap-1">
                📞 {orgProfile.phone}
              </a>
            )}
          </div>

          {/* Social actions — only for logged-in users viewing someone else's profile */}
          {user && user.id !== id && (
            <div className="flex items-center gap-2">
              <FollowButton
                organizerId={id}
                initialFollowing={isFollowing}
                followersCount={orgProfile.followers_count ?? 0}
              />
              <BlockButton
                userId={id}
                initialBlocking={isBlocking}
              />
            </div>
          )}
        </div>
      </div>

      {/* Description */}
      {orgProfile.description && (
        <div className="card p-5">
          <h2 className="font-semibold text-gray-900 mb-2">About</h2>
          <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">{orgProfile.description}</p>
          {orgProfile.description_ar && (
            <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line mt-3" dir="rtl">
              {orgProfile.description_ar}
            </p>
          )}
        </div>
      )}

      {/* Communities */}
      {communityMemberships && communityMemberships.length > 0 && (
        <div>
          <h2 className="font-semibold text-gray-900 mb-3">Communities</h2>
          <div className="flex flex-wrap gap-2">
            {(communityMemberships as { community: { id: string; name: string; slug: string; level: string; member_count: number } | null }[])
              .filter((m) => m.community)
              .map(({ community: c }) => (
                <a
                  key={c!.id}
                  href={`/communities/${c!.slug}`}
                  className="flex items-center gap-1.5 rounded-full border border-brand-100 bg-brand-50 px-3 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-100 transition-colors"
                >
                  <span>{c!.name}</span>
                  <span className="text-brand-400">· {c!.member_count.toLocaleString()}</span>
                </a>
              ))}
          </div>
        </div>
      )}

      {/* Upcoming events */}
      <div>
        <h2 className="font-semibold text-gray-900 mb-4">
          Upcoming Events {events?.length ? `(${events.length})` : ''}
        </h2>
        {!events?.length ? (
          <EmptyState icon="📭" title="No upcoming events" description="Check back soon" />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {(events as unknown as EventWithOrganizer[]).map((event) => (
              <EventCard
                key={event.id}
                event={event}
                isSaved={savedIds.has(event.id)}
                showSave={!!user}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
