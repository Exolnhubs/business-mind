import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import Link from 'next/link'
import { Redis } from '@upstash/redis'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { formatDate } from '@/lib/utils'
import { ReviewSection } from '@/components/social/ReviewSection'
import { PlanBadge } from '@/components/ui/PlanBadge'
import { UserFollowButton } from '@/components/social/UserFollowButton'
import { SayHiButton } from '@/components/social/SayHiButton'
import { UserProfileTabs } from '@/components/social/UserProfileTabs'
import type { UserReviewWithReviewer } from '@/types/database'
import type { FollowState } from '@/components/social/UserFollowButton'

const redis = Redis.fromEnv()

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const supabase = await createSupabaseServerClient()
  const { data } = await supabase.from('profiles').select('display_name').eq('id', id).single()
  return { title: data?.display_name ?? 'User Profile' }
}

function Stars({ rating }: { rating: number }) {
  return (
    <span className="text-xs">
      {[1, 2, 3, 4, 5].map((s) => (
        <span key={s} className={s <= Math.round(rating) ? 'text-amber-400' : 'text-gray-200'}>★</span>
      ))}
    </span>
  )
}

export default async function PublicUserProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const admin   = createSupabaseAdminClient()
  const supabase = await createSupabaseServerClient()

  // Viewer identity (optional)
  const { data: { user: viewer } } = await supabase.auth.getUser()
  const viewerId = viewer?.id ?? null

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

  const [
    profileRes,
    viewerRowRes,
    targetRowRes,
    statsRes,
    viewerMembershipsRes,
    targetMembershipsRes,
    allRatingsRes,
    reviewsRes,
    viewerReviewRes,
    sayHiAlready,
  ] = await Promise.all([
    // 1. Profile
    admin.from('profiles').select('id, display_name, avatar_url, city, bio, role, plan_id, created_at').eq('id', id).single(),

    // 2a. Viewer → target follow row
    viewerId
      ? (admin as any).from('user_follows').select('status').eq('follower_id', viewerId).eq('following_id', id).maybeSingle()
      : Promise.resolve({ data: null }),

    // 2b. Target → viewer follow row
    viewerId
      ? (admin as any).from('user_follows').select('status').eq('follower_id', id).eq('following_id', viewerId).maybeSingle()
      : Promise.resolve({ data: null }),

    // 3. Stats
    Promise.all([
      (admin as any).from('happenings').select('id', { count: 'exact', head: true })
        .eq('author_id', id)
        .or(`expires_at.gt.${new Date().toISOString()},created_at.gt.${thirtyDaysAgo}`),
      admin.from('bookings').select('id', { count: 'exact', head: true }).eq('user_id', id).eq('status', 'confirmed'),
      admin.from('community_memberships').select('id', { count: 'exact', head: true }).eq('user_id', id).eq('status', 'active'),
    ]),

    // 4a. Viewer memberships (for shared communities)
    viewerId
      ? admin.from('community_memberships').select('community_id').eq('user_id', viewerId).eq('status', 'active')
      : Promise.resolve({ data: [] }),

    // 4b. Target memberships
    admin.from('community_memberships').select('community_id, communities(id, name, slug, member_count)').eq('user_id', id).eq('status', 'active'),

    // 5. All ratings for true average
    admin.from('user_reviews').select('rating').eq('reviewed_id', id),

    // 6. Reviews (first page)
    admin.from('user_reviews').select('*, reviewer:profiles!reviewer_id(id, display_name, avatar_url)', { count: 'exact' })
      .eq('reviewed_id', id).order('created_at', { ascending: false }).limit(20),

    // 7. Viewer's own review
    viewerId && viewerId !== id
      ? admin.from('user_reviews').select('rating, content').eq('reviewer_id', viewerId).eq('reviewed_id', id).maybeSingle()
      : Promise.resolve({ data: null }),

    // 8. Say-hi rate limit check (Redis read-only — no token consumed)
    viewerId && viewerId !== id
      ? redis.exists(`say-hi:${viewerId}:${id}`)
      : Promise.resolve(0),
  ])

  const profile = profileRes.data
  if (!profile || profile.role === 'admin') notFound()

  // Compute FollowState
  const viewerRow = (viewerRowRes as any).data as { status: string } | null
  const targetRow = (targetRowRes as any).data as { status: string } | null

  let followState: FollowState = 'none'
  if (viewerId === id) {
    followState = 'self'
  } else if (viewerRow?.status === 'accepted') {
    followState = 'accepted'
  } else if (viewerRow?.status === 'pending') {
    followState = 'pending_sent'
  } else if (targetRow?.status === 'pending') {
    followState = 'pending_received'
  }

  const isMutual = viewerRow?.status === 'accepted' && targetRow?.status === 'accepted'

  // Stats
  const [happeningsRes, bookingsRes, membershipsCountRes] = statsRes
  const happeningsCount  = happeningsRes.count  ?? 0
  const eventsAttended   = bookingsRes.count    ?? 0
  const communitiesCount = membershipsCountRes.count ?? 0

  // Shared communities
  const viewerCommunityIds = new Set(
    ((viewerMembershipsRes as any).data ?? []).map((m: any) => m.community_id)
  )
  const targetMemberships = (targetMembershipsRes as any).data ?? []
  const sharedCommunities = targetMemberships
    .filter((m: any) => viewerCommunityIds.has(m.community_id) && m.communities)
    .map((m: any) => ({
      id: m.community_id,
      name: m.communities.name,
      slug: m.communities.slug,
      member_count: m.communities.member_count ?? 0,
      viewer_is_member: true,
    }))

  // Ratings
  const allRatings = allRatingsRes.data ?? []
  const avgRating  = allRatings.length > 0
    ? allRatings.reduce((s: number, r: any) => s + r.rating, 0) / allRatings.length
    : null
  const totalReviews   = reviewsRes.count ?? 0
  const reviews        = (reviewsRes.data ?? []) as unknown as UserReviewWithReviewer[]
  const viewerReview   = (viewerReviewRes as any).data as { rating: number; content: string | null } | null

  const sayHiAvailable = !sayHiAlready
  const isLoggedIn     = !!viewerId
  const isSelf         = followState === 'self'

  const initials = profile.display_name
    .split(' ').slice(0, 2).map((w: string) => w[0]).join('').toUpperCase()

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 space-y-6">

      {/* Profile card */}
      <div className="card p-6 flex items-start gap-5">
        <div className="w-20 h-20 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-2xl font-bold shrink-0 overflow-hidden">
          {profile.avatar_url
            ? <img src={profile.avatar_url} alt={profile.display_name} className="w-full h-full object-cover" />
            : initials}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold text-gray-900 flex items-center gap-1.5">
              {profile.display_name}
              <PlanBadge planId={profile.plan_id} size={18} />
            </h1>
            {profile.role === 'organizer' && (
              <span className="text-xs bg-brand-100 text-brand-700 font-semibold px-2 py-0.5 rounded-full">Organizer</span>
            )}
          </div>
          {profile.city && <p className="text-sm text-gray-500 mt-0.5">📍 {profile.city}</p>}
          <p className="text-xs text-gray-400 mt-1">Member since {formatDate(profile.created_at)}</p>
          {profile.bio && (
            <p className="text-sm text-gray-600 mt-2 leading-relaxed">{profile.bio}</p>
          )}
          {avgRating !== null && (
            <div className="flex items-center gap-1.5 mt-2">
              <Stars rating={avgRating} />
              <span className="text-xs font-semibold text-amber-600">{avgRating.toFixed(1)}</span>
              <span className="text-xs text-gray-400">({totalReviews} review{totalReviews !== 1 ? 's' : ''})</span>
            </div>
          )}

          {/* Action buttons */}
          {isLoggedIn && (
            <div className="flex items-center gap-2 mt-4 flex-wrap">
              <UserFollowButton targetId={id} initialState={followState} />
              {!isSelf && (
                <SayHiButton targetId={id} initialAvailable={sayHiAvailable} />
              )}
              {isSelf && (
                <Link href="/profile" className="btn-secondary text-sm">Edit Profile →</Link>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { icon: '📣', label: 'Happenings',       value: happeningsCount },
          { icon: '🎟️', label: 'Events Attended',  value: eventsAttended },
          { icon: '🏘️', label: 'Communities',      value: communitiesCount },
        ].map((s) => (
          <div key={s.label} className="card p-4 text-center">
            <div className="text-xl mb-0.5">{s.icon}</div>
            <div className="text-2xl font-bold text-gray-900">{s.value}</div>
            <div className="text-xs text-gray-400 mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Tabbed feed */}
      <UserProfileTabs
        targetId={id}
        followState={followState}
        isMutual={!!isMutual}
        sharedCommunities={sharedCommunities}
      />

      {/* Reviews */}
      <ReviewSection
        reviewedId={id}
        reviews={reviews}
        totalReviews={totalReviews}
        avgRating={avgRating}
        viewerReview={viewerReview}
        isLoggedIn={isLoggedIn}
        isSelf={isSelf}
      />
    </div>
  )
}
