import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { formatDate } from '@/lib/utils'
import { ReviewSection } from '@/components/social/ReviewSection'
import type { UserReviewWithReviewer } from '@/types/database'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const supabase = await createSupabaseServerClient()
  const { data } = await supabase.from('profiles').select('display_name').eq('id', id).single()
  return { title: data?.display_name ?? 'User Profile' }
}

function Stars({ rating, size = 'md' }: { rating: number; size?: 'sm' | 'md' | 'lg' }) {
  const sz = size === 'lg' ? 'text-2xl' : size === 'md' ? 'text-base' : 'text-xs'
  return (
    <span className={sz}>
      {[1, 2, 3, 4, 5].map((s) => (
        <span key={s} className={s <= Math.round(rating) ? 'text-amber-400' : 'text-gray-200'}>★</span>
      ))}
    </span>
  )
}

export default async function PublicUserProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createSupabaseServerClient()
  const { data: { user: viewer } } = await supabase.auth.getUser()

  const [
    { data: profile },
    { data: statsData },
    { data: reviews, count: reviewCount },
    viewerReviewRes,
  ] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, display_name, avatar_url, city, bio, role, created_at')
      .eq('id', id)
      .single(),

    // Stats: events attended, following count
    Promise.all([
      supabase.from('bookings').select('id', { count: 'exact', head: true })
        .eq('user_id', id).eq('status', 'confirmed'),
      supabase.from('organizer_follows').select('id', { count: 'exact', head: true })
        .eq('follower_id', id),
      supabase.from('event_reactions').select('id', { count: 'exact', head: true })
        .eq('user_id', id),
    ]),

    supabase
      .from('user_reviews')
      .select('*, reviewer:profiles!reviewer_id(id, display_name, avatar_url)', { count: 'exact' })
      .eq('reviewed_id', id)
      .order('created_at', { ascending: false })
      .limit(20),

    // Check if the viewer has already reviewed this user
    viewer && viewer.id !== id
      ? supabase.from('user_reviews').select('rating, content')
          .eq('reviewer_id', viewer.id).eq('reviewed_id', id).maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  if (!profile || profile.role === 'admin') notFound()

  const [attendedRes, followingRes, reactionsRes] = statsData
  const eventsAttended  = attendedRes.count  ?? 0
  const followingCount  = followingRes.count ?? 0
  const reactionsCount  = reactionsRes.count ?? 0
  const totalReviews    = reviewCount ?? 0
  const viewerReview    = (viewerReviewRes as { data: { rating: number; content: string | null } | null }).data

  const avgRating = totalReviews > 0
    ? (reviews ?? []).reduce((s, r) => s + r.rating, 0) / (reviews ?? []).length
    : null

  // Full average needs all reviews, not just first page — re-query aggregate
  const { data: allRatings } = await supabase
    .from('user_reviews').select('rating').eq('reviewed_id', id)
  const trueAvg = allRatings?.length
    ? allRatings.reduce((s, r) => s + r.rating, 0) / allRatings.length
    : null

  const initials = profile.display_name
    .split(' ').slice(0, 2).map((w: string) => w[0]).join('').toUpperCase()

  const isSelf = viewer?.id === id

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 space-y-6">

      {/* Profile card */}
      <div className="card p-6 flex items-start gap-5">
        {/* Avatar */}
        <div className="w-20 h-20 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-2xl font-bold shrink-0 overflow-hidden">
          {profile.avatar_url
            ? <img src={profile.avatar_url} alt={profile.display_name} className="w-full h-full object-cover" />
            : initials}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold text-gray-900">{profile.display_name}</h1>
            {profile.role === 'organizer' && (
              <span className="text-xs bg-brand-100 text-brand-700 font-semibold px-2 py-0.5 rounded-full">Organizer</span>
            )}
          </div>
          {profile.city && <p className="text-sm text-gray-500 mt-0.5">📍 {profile.city}</p>}
          <p className="text-xs text-gray-400 mt-1">Member since {formatDate(profile.created_at)}</p>
          {profile.bio && (
            <p className="text-sm text-gray-600 mt-2 leading-relaxed">{profile.bio}</p>
          )}
          {trueAvg !== null && (
            <div className="flex items-center gap-1.5 mt-2">
              <Stars rating={trueAvg} size="sm" />
              <span className="text-xs font-semibold text-amber-600">{trueAvg.toFixed(1)}</span>
              <span className="text-xs text-gray-400">({totalReviews} review{totalReviews !== 1 ? 's' : ''})</span>
            </div>
          )}
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { icon: '🎟️', label: 'Events Attended', value: eventsAttended },
          { icon: '👥', label: 'Following',        value: followingCount },
          { icon: '⭐', label: 'Reactions Given',  value: reactionsCount },
        ].map((s) => (
          <div key={s.label} className="card p-4 text-center">
            <div className="text-xl mb-0.5">{s.icon}</div>
            <div className="text-2xl font-bold text-gray-900">{s.value}</div>
            <div className="text-xs text-gray-400 mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Reviews */}
      <ReviewSection
        reviewedId={id}
        reviews={(reviews ?? []) as UserReviewWithReviewer[]}
        totalReviews={totalReviews}
        avgRating={trueAvg}
        viewerReview={viewerReview}
        isLoggedIn={!!viewer}
        isSelf={isSelf}
      />
    </div>
  )
}
