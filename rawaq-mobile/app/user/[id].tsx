import { useEffect, useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl, TextInput, Image, Alert,
} from 'react-native'
import { useRouter, useLocalSearchParams } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '@/lib/supabase'
import { apiPost, apiDelete } from '@/lib/api'
import { useAuth } from '@/contexts/auth-context'
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/theme'
import { formatDate, formatRelativeTime } from '@/lib/utils'

// ── Types ──────────────────────────────────────────────────────────────────
interface Profile {
  id: string
  display_name: string
  avatar_url: string | null
  city: string | null
  bio: string | null
  role: string
  created_at: string
}

interface Review {
  id: string
  reviewer_id: string
  rating: number
  content: string | null
  created_at: string
  reviewer: {
    id: string
    display_name: string
    avatar_url: string | null
  } | null
}

interface Stats {
  eventsAttended: number
  followingCount: number
  reactionsCount: number
}

// ── Star display ────────────────────────────────────────────────────────────
function Stars({ rating, size = 14 }: { rating: number; size?: number }) {
  return (
    <Text style={{ fontSize: size }}>
      {[1, 2, 3, 4, 5].map((s) =>
        s <= Math.round(rating) ? '⭐' : '☆'
      ).join('')}
    </Text>
  )
}

// ── Star picker ─────────────────────────────────────────────────────────────
function StarPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <View style={{ flexDirection: 'row', gap: 4 }}>
      {[1, 2, 3, 4, 5].map((s) => (
        <TouchableOpacity key={s} onPress={() => onChange(s)}>
          <Text style={{ fontSize: 28, color: s <= value ? '#f59e0b' : Colors.gray[200] }}>★</Text>
        </TouchableOpacity>
      ))}
    </View>
  )
}

// ── Main screen ─────────────────────────────────────────────────────────────
export default function PublicUserProfileScreen() {
  const router = useRouter()
  const { user } = useAuth()
  const { id } = useLocalSearchParams<{ id: string }>()

  const [profile, setProfile]           = useState<Profile | null>(null)
  const [stats, setStats]               = useState<Stats>({ eventsAttended: 0, followingCount: 0, reactionsCount: 0 })
  const [reviews, setReviews]           = useState<Review[]>([])
  const [totalReviews, setTotalReviews] = useState(0)
  const [avgRating, setAvgRating]       = useState<number | null>(null)
  const [viewerReview, setViewerReview] = useState<{ rating: number; content: string | null } | null>(null)
  const [loading, setLoading]           = useState(true)
  const [refreshing, setRefreshing]     = useState(false)
  const [page, setPage]                 = useState(1)
  const [hasMore, setHasMore]           = useState(false)
  const [loadingMore, setLoadingMore]   = useState(false)

  // review form state
  const [showForm, setShowForm]     = useState(false)
  const [editing, setEditing]       = useState(false)
  const [formRating, setFormRating] = useState(0)
  const [formContent, setFormContent] = useState('')
  const [formLoading, setFormLoading] = useState(false)
  const [formError, setFormError]   = useState('')

  const isSelf      = user?.id === id
  const isLoggedIn  = !!user
  const PER_PAGE    = 20

  const load = useCallback(async (pg = 1, append = false) => {
    if (!id) return

    const [
      { data: profileData },
      { count: attended },
      { count: following },
      { count: reactions },
      { data: reviewData, count: reviewCount },
    ] = await Promise.all([
      supabase.from('profiles').select('id, display_name, avatar_url, city, bio, role, created_at').eq('id', id).single(),
      supabase.from('bookings').select('id', { count: 'exact', head: true }).eq('user_id', id).eq('status', 'confirmed'),
      supabase.from('organizer_follows').select('id', { count: 'exact', head: true }).eq('follower_id', id),
      supabase.from('event_reactions').select('id', { count: 'exact', head: true }).eq('user_id', id),
      supabase.from('user_reviews')
        .select('id, reviewer_id, rating, content, created_at, reviewer:profiles!reviewer_id(id, display_name, avatar_url)', { count: 'exact' })
        .eq('reviewed_id', id)
        .order('created_at', { ascending: false })
        .range((pg - 1) * PER_PAGE, pg * PER_PAGE - 1),
    ])

    if (!profileData || profileData.role === 'admin') {
      router.back()
      return
    }

    setProfile(profileData)
    setStats({
      eventsAttended: attended ?? 0,
      followingCount: following ?? 0,
      reactionsCount: reactions ?? 0,
    })

    const newReviews = (reviewData ?? []) as Review[]
    if (append) {
      setReviews((prev) => [...prev, ...newReviews])
    } else {
      setReviews(newReviews)
    }

    const total = reviewCount ?? 0
    setTotalReviews(total)
    setHasMore(pg * PER_PAGE < total)

    // Compute avg from all ratings
    const { data: allRatings } = await supabase
      .from('user_reviews').select('rating').eq('reviewed_id', id)
    const avg = allRatings?.length
      ? allRatings.reduce((s: number, r: { rating: number }) => s + r.rating, 0) / allRatings.length
      : null
    setAvgRating(avg)

    // Load viewer's own review
    if (user && user.id !== id) {
      const { data: vr } = await supabase
        .from('user_reviews').select('rating, content')
        .eq('reviewer_id', user.id).eq('reviewed_id', id).maybeSingle()
      setViewerReview(vr ?? null)
    }

    setLoading(false)
    setRefreshing(false)
    setLoadingMore(false)
  }, [id, user, router])

  useEffect(() => { load(1, false) }, [load])

  function onRefresh() {
    setRefreshing(true)
    setPage(1)
    load(1, false)
  }

  function loadMore() {
    if (loadingMore || !hasMore) return
    const next = page + 1
    setPage(next)
    setLoadingMore(true)
    load(next, true)
  }

  // ── Review form actions ────────────────────────────────────────────────
  function openWriteForm() {
    setFormRating(0)
    setFormContent('')
    setFormError('')
    setShowForm(true)
    setEditing(false)
  }

  function openEditForm() {
    if (!viewerReview) return
    setFormRating(viewerReview.rating)
    setFormContent(viewerReview.content ?? '')
    setFormError('')
    setEditing(true)
    setShowForm(true)
  }

  async function submitReview() {
    if (formRating === 0) { setFormError('Please choose a star rating.'); return }
    if (!user) return
    setFormLoading(true)
    setFormError('')
    const { error } = await apiPost(`/api/users/${id}/reviews`, {
      rating:  formRating,
      content: formContent.trim() || null,
    })
    setFormLoading(false)
    if (error) { setFormError(error); return }
    setShowForm(false)
    setEditing(false)
    load(1, false)
  }

  async function deleteReview() {
    if (!user) return
    Alert.alert('Delete review', 'Are you sure you want to delete your review?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          await apiDelete(`/api/users/${id}/reviews`)
          setViewerReview(null)
          load(1, false)
        },
      },
    ])
  }

  // ── Render ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={Colors.brand[500]} />
      </View>
    )
  }

  if (!profile) return null

  const initials = profile.display_name
    .split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase()

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.brand[500]} />}
    >
      {/* Back button */}
      <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
        <Ionicons name="chevron-back" size={22} color={Colors.gray[700]} />
        <Text style={styles.backText}>Back</Text>
      </TouchableOpacity>

      {/* Profile card */}
      <View style={styles.card}>
        <View style={styles.profileRow}>
          <View style={styles.avatar}>
            {profile.avatar_url ? (
              <Image source={{ uri: profile.avatar_url }} style={styles.avatarImage} />
            ) : (
              <Text style={styles.avatarText}>{initials}</Text>
            )}
          </View>
          <View style={styles.profileInfo}>
            <View style={styles.nameRow}>
              <Text style={styles.displayName}>{profile.display_name}</Text>
              {profile.role === 'organizer' && (
                <View style={styles.orgBadge}>
                  <Text style={styles.orgBadgeText}>Organizer</Text>
                </View>
              )}
            </View>
            {profile.city ? (
              <Text style={styles.city}>📍 {profile.city}</Text>
            ) : null}
            <Text style={styles.memberSince}>Member since {formatDate(profile.created_at)}</Text>
            {avgRating !== null && (
              <View style={styles.ratingRow}>
                <Stars rating={avgRating} size={12} />
                <Text style={styles.ratingNum}>{avgRating.toFixed(1)}</Text>
                <Text style={styles.ratingCount}>({totalReviews} review{totalReviews !== 1 ? 's' : ''})</Text>
              </View>
            )}
          </View>
        </View>
        {profile.bio ? <Text style={styles.bio}>{profile.bio}</Text> : null}
      </View>

      {/* Stats */}
      <View style={styles.statsRow}>
        {[
          { icon: '🎟️', label: 'Attended', value: stats.eventsAttended },
          { icon: '👥', label: 'Following', value: stats.followingCount },
          { icon: '⭐', label: 'Reactions', value: stats.reactionsCount },
        ].map((s) => (
          <View key={s.label} style={styles.statCard}>
            <Text style={styles.statIcon}>{s.icon}</Text>
            <Text style={styles.statValue}>{s.value}</Text>
            <Text style={styles.statLabel}>{s.label}</Text>
          </View>
        ))}
      </View>

      {/* Reviews section */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>
            Reviews{totalReviews > 0 ? ` (${totalReviews})` : ''}
          </Text>
          {isLoggedIn && !isSelf && !viewerReview && !showForm && (
            <TouchableOpacity onPress={openWriteForm}>
              <Text style={styles.writeBtn}>+ Write a review</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Avg summary */}
        {avgRating !== null && totalReviews > 0 && (
          <View style={styles.avgCard}>
            <View style={styles.avgLeft}>
              <Text style={styles.avgNum}>{avgRating.toFixed(1)}</Text>
              <Stars rating={avgRating} size={14} />
              <Text style={styles.avgCount}>{totalReviews} review{totalReviews !== 1 ? 's' : ''}</Text>
            </View>
            <View style={styles.avgBars}>
              {[5, 4, 3, 2, 1].map((s) => {
                const count = reviews.filter((r) => r.rating === s).length
                const pct = reviews.length ? count / reviews.length : 0
                return (
                  <View key={s} style={styles.barRow}>
                    <Text style={styles.barLabel}>{s}</Text>
                    <Text style={styles.barStar}>★</Text>
                    <View style={styles.barTrack}>
                      <View style={[styles.barFill, { width: `${pct * 100}%` as any }]} />
                    </View>
                    <Text style={styles.barCount}>{count}</Text>
                  </View>
                )
              })}
            </View>
          </View>
        )}

        {/* Viewer's own review */}
        {viewerReview && !editing && (
          <View style={styles.ownReviewCard}>
            <Text style={styles.ownReviewLabel}>Your review</Text>
            <View style={styles.ownReviewContent}>
              <Stars rating={viewerReview.rating} size={14} />
              {viewerReview.content ? (
                <Text style={styles.reviewText}>{viewerReview.content}</Text>
              ) : null}
              <View style={styles.reviewActions}>
                <TouchableOpacity onPress={openEditForm}>
                  <Text style={styles.editBtn}>Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={deleteReview}>
                  <Text style={styles.deleteBtn}>Delete</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}

        {/* Write/edit form */}
        {showForm && (
          <View style={styles.formCard}>
            <Text style={styles.formLabel}>Your rating</Text>
            <StarPicker value={formRating} onChange={setFormRating} />
            <Text style={[styles.formLabel, { marginTop: 12 }]}>Comment (optional)</Text>
            <TextInput
              value={formContent}
              onChangeText={setFormContent}
              placeholder="Share your experience…"
              placeholderTextColor={Colors.gray[400]}
              multiline
              numberOfLines={3}
              maxLength={1000}
              style={styles.textarea}
            />
            {formError ? <Text style={styles.formError}>{formError}</Text> : null}
            <View style={styles.formButtons}>
              <TouchableOpacity
                onPress={submitReview}
                disabled={formLoading}
                style={[styles.submitBtn, formLoading && { opacity: 0.6 }]}
              >
                <Text style={styles.submitBtnText}>{formLoading ? 'Saving…' : editing ? 'Update' : 'Submit'}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { setShowForm(false); setEditing(false) }}>
                <Text style={styles.cancelBtn}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Not logged in */}
        {!isLoggedIn && (
          <Text style={styles.loginPrompt}>Sign in to leave a review.</Text>
        )}

        {/* Reviews list */}
        {reviews.length > 0 ? (
          <View style={styles.reviewList}>
            {reviews.map((review) => {
              const initials2 = (review.reviewer?.display_name ?? '?')
                .split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase()
              return (
                <View key={review.id} style={styles.reviewItem}>
                  <View style={styles.reviewAvatar}>
                    {review.reviewer?.avatar_url ? (
                      <Image source={{ uri: review.reviewer.avatar_url }} style={styles.reviewAvatarImg} />
                    ) : (
                      <Text style={styles.reviewAvatarText}>{initials2}</Text>
                    )}
                  </View>
                  <View style={styles.reviewBody}>
                    <View style={styles.reviewHeader}>
                      <TouchableOpacity onPress={() => review.reviewer?.id && router.push(`/user/${review.reviewer.id}`)}>
                        <Text style={styles.reviewerName}>{review.reviewer?.display_name ?? 'Unknown'}</Text>
                      </TouchableOpacity>
                      <Text style={styles.reviewDate}>{formatRelativeTime(review.created_at)}</Text>
                    </View>
                    <View style={styles.ratingRow}>
                      <Stars rating={review.rating} size={12} />
                      <Text style={styles.ratingNum}>{review.rating}/5</Text>
                    </View>
                    {review.content ? <Text style={styles.reviewText}>{review.content}</Text> : null}
                  </View>
                </View>
              )
            })}

            {hasMore && (
              <TouchableOpacity onPress={loadMore} disabled={loadingMore} style={styles.loadMoreBtn}>
                {loadingMore
                  ? <ActivityIndicator size="small" color={Colors.brand[500]} />
                  : <Text style={styles.loadMoreText}>Load more ({totalReviews - reviews.length} remaining)</Text>
                }
              </TouchableOpacity>
            )}
          </View>
        ) : (
          !showForm && (
            <Text style={styles.emptyReviews}>
              No reviews yet.{isLoggedIn && !isSelf ? ' Be the first!' : ''}
            </Text>
          )
        )}
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: Colors.gray[50] },
  container: { padding: Spacing.md, paddingBottom: 40 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  backBtn: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.md, gap: 4 },
  backText: { fontSize: FontSize.sm, color: Colors.gray[700], fontWeight: FontWeight.medium },

  // Profile card
  card: { backgroundColor: Colors.white, borderRadius: Radius.lg, padding: Spacing.md, marginBottom: Spacing.md, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, elevation: 1 },
  profileRow: { flexDirection: 'row', gap: Spacing.md, alignItems: 'flex-start' },
  avatar: { width: 72, height: 72, borderRadius: 36, backgroundColor: Colors.brand[100], justifyContent: 'center', alignItems: 'center', overflow: 'hidden', flexShrink: 0 },
  avatarImage: { width: 72, height: 72, borderRadius: 36 },
  avatarText: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.brand[700] },
  profileInfo: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flexWrap: 'wrap' },
  displayName: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.gray[900] },
  orgBadge: { backgroundColor: Colors.brand[100], borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 2 },
  orgBadgeText: { fontSize: 10, fontWeight: FontWeight.semibold, color: Colors.brand[700] },
  city: { fontSize: FontSize.sm, color: Colors.gray[500], marginTop: 2 },
  memberSince: { fontSize: FontSize.xs, color: Colors.gray[400], marginTop: 2 },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  ratingNum: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, color: '#d97706' },
  ratingCount: { fontSize: FontSize.xs, color: Colors.gray[400] },
  bio: { fontSize: FontSize.sm, color: Colors.gray[600], marginTop: Spacing.sm, lineHeight: 20 },

  // Stats
  statsRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.md },
  statCard: { flex: 1, backgroundColor: Colors.white, borderRadius: Radius.lg, padding: Spacing.sm, alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, elevation: 1 },
  statIcon: { fontSize: 20, marginBottom: 2 },
  statValue: { fontSize: 22, fontWeight: FontWeight.bold, color: Colors.gray[900] },
  statLabel: { fontSize: 10, color: Colors.gray[400], marginTop: 2, textAlign: 'center' },

  // Section
  section: { gap: Spacing.sm },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: { fontSize: FontSize.base, fontWeight: FontWeight.bold, color: Colors.gray[900] },
  writeBtn: { fontSize: FontSize.sm, color: Colors.brand[600], fontWeight: FontWeight.medium },

  // Avg summary
  avgCard: { backgroundColor: Colors.white, borderRadius: Radius.lg, padding: Spacing.md, flexDirection: 'row', gap: Spacing.lg, alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, elevation: 1 },
  avgLeft: { alignItems: 'center', flexShrink: 0 },
  avgNum: { fontSize: 32, fontWeight: FontWeight.bold, color: Colors.gray[900] },
  avgCount: { fontSize: FontSize.xs, color: Colors.gray[400], marginTop: 2 },
  avgBars: { flex: 1, gap: 4 },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  barLabel: { fontSize: 10, color: Colors.gray[500], width: 8, textAlign: 'right' },
  barStar: { fontSize: 10, color: '#f59e0b' },
  barTrack: { flex: 1, height: 6, backgroundColor: Colors.gray[100], borderRadius: 3, overflow: 'hidden' },
  barFill: { height: 6, backgroundColor: '#f59e0b', borderRadius: 3 },
  barCount: { fontSize: 10, color: Colors.gray[400], width: 14, textAlign: 'right' },

  // Own review
  ownReviewCard: { backgroundColor: '#eff6ff', borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: '#bfdbfe' },
  ownReviewLabel: { fontSize: FontSize.xs, color: Colors.brand[600], fontWeight: FontWeight.medium, marginBottom: 6 },
  ownReviewContent: { gap: 4 },
  reviewActions: { flexDirection: 'row', gap: Spacing.md, marginTop: 4 },
  editBtn: { fontSize: FontSize.xs, color: Colors.brand[600] },
  deleteBtn: { fontSize: FontSize.xs, color: '#ef4444' },

  // Form
  formCard: { backgroundColor: Colors.white, borderRadius: Radius.lg, padding: Spacing.md, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, elevation: 1, gap: 4 },
  formLabel: { fontSize: FontSize.xs, fontWeight: FontWeight.medium, color: Colors.gray[600] },
  textarea: { borderWidth: 1, borderColor: Colors.gray[200], borderRadius: Radius.md, padding: Spacing.sm, fontSize: FontSize.sm, color: Colors.gray[800], minHeight: 80, textAlignVertical: 'top', marginTop: 4 },
  formError: { fontSize: FontSize.xs, color: '#ef4444' },
  formButtons: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'center', marginTop: 4 },
  submitBtn: { backgroundColor: Colors.brand[500], borderRadius: Radius.md, paddingHorizontal: 16, paddingVertical: 8 },
  submitBtnText: { color: Colors.white, fontSize: FontSize.sm, fontWeight: FontWeight.semibold },
  cancelBtn: { fontSize: FontSize.sm, color: Colors.gray[500], paddingVertical: 8, paddingHorizontal: 4 },

  loginPrompt: { fontSize: FontSize.sm, color: Colors.gray[400], textAlign: 'center', paddingVertical: 8 },

  // Reviews list
  reviewList: { gap: Spacing.md },
  reviewItem: { flexDirection: 'row', gap: Spacing.sm, backgroundColor: Colors.white, borderRadius: Radius.lg, padding: Spacing.md, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, elevation: 1 },
  reviewAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.brand[100], justifyContent: 'center', alignItems: 'center', overflow: 'hidden', flexShrink: 0 },
  reviewAvatarImg: { width: 36, height: 36, borderRadius: 18 },
  reviewAvatarText: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.brand[700] },
  reviewBody: { flex: 1, gap: 2 },
  reviewHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  reviewerName: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.gray[900] },
  reviewDate: { fontSize: FontSize.xs, color: Colors.gray[400] },
  reviewText: { fontSize: FontSize.sm, color: Colors.gray[600], lineHeight: 20, marginTop: 2 },

  loadMoreBtn: { alignItems: 'center', paddingVertical: Spacing.md },
  loadMoreText: { fontSize: FontSize.sm, color: Colors.brand[600] },

  emptyReviews: { fontSize: FontSize.sm, color: Colors.gray[400], textAlign: 'center', paddingVertical: 24 },
})
