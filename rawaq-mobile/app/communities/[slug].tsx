import { useEffect, useState, useRef } from 'react'
import {
  View, Text, ScrollView, StyleSheet, Modal,
  TouchableOpacity, ActivityIndicator, Image, Alert, TextInput,
  KeyboardAvoidingView, Platform, Linking,
} from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import * as Location from 'expo-location'
import { apiGet, apiPost, apiDelete } from '@/lib/api'
import { useAuth } from '@/contexts/auth-context'
import { useLocale } from '@/contexts/locale-context'
import { Spinner } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { formatDate } from '@/lib/utils'
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadow } from '@/theme'
import type { Community, CommunityLevel, Event, HappeningType, HappeningWithAuthor } from '@/types/database'

type CommunityDetail = Community & {
  is_member: boolean
  event_count: number
  ancestors: Pick<Community, 'id' | 'name' | 'name_ar' | 'slug' | 'level'>[]
  recent_events: Pick<Event, 'id' | 'title' | 'title_ar' | 'cover_image_url' | 'start_at' | 'city' | 'is_free' | 'price' | 'currency'>[]
  recent_members: Array<{ id: string; display_name: string; avatar_url: string | null; joined_at: string }>
  activity: Array<{ id: string; type: 'member_joined' | 'event_published'; title: string; subtitle: string; created_at: string; href: string | null }>
}
type MembershipMutationResponse = { is_member?: boolean; member_count?: number }
type EventItem = Pick<Event, 'id' | 'title' | 'title_ar' | 'cover_image_url' | 'start_at' | 'city' | 'is_free' | 'price' | 'currency'>

const LEVEL_META: Record<CommunityLevel, { label: string; icon: keyof typeof Ionicons.glyphMap; tint: string; bg: string; accent: string }> = {
  micro:    { label: 'Micro',    icon: 'home-outline',     tint: '#166534', bg: '#dcfce7', accent: '#16a34a' },
  interest: { label: 'Interest', icon: 'sparkles-outline', tint: '#6d28d9', bg: '#ede9fe', accent: '#7c3aed' },
  district: { label: 'District', icon: 'business-outline', tint: '#92400e', bg: '#fef3c7', accent: '#d97706' },
  city:     { label: 'City',     icon: 'location-outline', tint: '#1e40af', bg: '#dbeafe', accent: '#2563eb' },
  country:  { label: 'Country',  icon: 'earth-outline',    tint: '#9f1239', bg: '#ffe4e6', accent: '#e11d48' },
}

export default function CommunityDetailScreen() {
  const { slug }   = useLocalSearchParams<{ slug: string }>()
  const { user }   = useAuth()
  const { locale } = useLocale()
  const router     = useRouter()
  const isRTL      = locale === 'ar'

  const [community, setCommunity] = useState<CommunityDetail | null>(null)
  const [loading, setLoading]     = useState(true)
  const [joining, setJoining]     = useState(false)
  const [events, setEvents]       = useState<EventItem[]>([])
  const [eventsLoading, setEventsLoading] = useState(false)
  const [nextCursor, setNextCursor]       = useState<string | null>(null)

  // Happenings state
  const [happenings, setHappenings]       = useState<HappeningWithAuthor[]>([])
  const [happeningsLoading, setHappeningsLoading] = useState(false)
  const [showPostModal, setShowPostModal] = useState(false)
  const [postType, setPostType]           = useState<HappeningType>('open_invite')
  const [postBody, setPostBody]           = useState('')
  const [postExpiry, setPostExpiry]       = useState(6)
  const [posting, setPosting]             = useState(false)
  const [postCoords, setPostCoords]       = useState<{ lat: number; lng: number } | null>(null)
  const [locState, setLocState]           = useState<'idle' | 'loading' | 'attached' | 'denied'>('idle')

  useEffect(() => {
    apiGet<CommunityDetail>(`/api/communities/${slug}`)
      .then(({ data }) => { if (data) setCommunity(data); else router.back() })
      .finally(() => setLoading(false))
  }, [slug])

  async function loadEvents(cursor?: string) {
    if (eventsLoading) return
    setEventsLoading(true)
    const params = new URLSearchParams({ per_page: '10' })
    if (cursor) params.set('cursor', cursor)
    const { data } = await apiGet<{ events: EventItem[]; next_cursor: string | null }>(`/api/communities/${slug}/events?${params}`)
    if (data) {
      setEvents((prev) => cursor ? [...prev, ...data.events] : data.events)
      setNextCursor(data.next_cursor)
    }
    setEventsLoading(false)
  }

  useEffect(() => { if (community) loadEvents() }, [community?.id])

  async function loadHappenings() {
    setHappeningsLoading(true)
    const { data } = await apiGet<{ happenings: HappeningWithAuthor[] }>(`/api/communities/${slug}/happenings?per_page=20`)
    if (data) setHappenings(data.happenings ?? [])
    setHappeningsLoading(false)
  }

  useEffect(() => { if (community) loadHappenings() }, [community?.id])

  async function attachLocation() {
    setLocState('loading')
    const { status } = await Location.requestForegroundPermissionsAsync()
    if (status !== 'granted') { setLocState('denied'); return }
    const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
    setPostCoords({ lat: loc.coords.latitude, lng: loc.coords.longitude })
    setLocState('attached')
  }

  async function submitHappening() {
    if (!postBody.trim()) return
    setPosting(true)
    const { data, error } = await apiPost<HappeningWithAuthor>(`/api/communities/${slug}/happenings`, {
      type: postType, body: postBody.trim(), expires_in_hours: postExpiry,
      ...(postCoords ?? {}),
    })
    if (error) {
      Alert.alert('Error', error)
    } else if (data) {
      setHappenings((prev) => [data, ...prev])
      setShowPostModal(false)
      setPostBody('')
      setPostType('open_invite')
      setPostExpiry(6)
      setPostCoords(null)
      setLocState('idle')
    }
    setPosting(false)
  }

  async function toggleHappeningRsvp(h: HappeningWithAuthor) {
    if (!user) { router.push('/auth/login' as any); return }
    const { data } = h.user_has_rsvp
      ? await apiDelete<{ rsvp: boolean; rsvp_count: number }>(`/api/happenings/${h.id}/rsvp`)
      : await apiPost<{ rsvp: boolean; rsvp_count: number }>(`/api/happenings/${h.id}/rsvp`, {})
    if (data) {
      setHappenings((prev) => prev.map((item) =>
        item.id === h.id ? { ...item, user_has_rsvp: data.rsvp, rsvp_count: data.rsvp_count } : item
      ))
    }
  }

  async function toggleHappeningReact(h: HappeningWithAuthor) {
    if (!user) { router.push('/auth/login' as any); return }
    const { data } = h.user_has_reacted
      ? await apiDelete<{ reacted: boolean; reaction_count: number }>(`/api/happenings/${h.id}/react`)
      : await apiPost<{ reacted: boolean; reaction_count: number }>(`/api/happenings/${h.id}/react`, { emoji: '👍' })
    if (data) {
      setHappenings((prev) => prev.map((item) =>
        item.id === h.id ? { ...item, user_has_reacted: data.reacted, reaction_count: data.reaction_count } : item
      ))
    }
  }

  async function toggleMembership() {
    if (!user) { router.push('/auth/login' as any); return }
    if (!community) return
    setJoining(true)
    const { data, error } = community.is_member
      ? await apiDelete<MembershipMutationResponse>(`/api/communities/${slug}/leave`)
      : await apiPost<MembershipMutationResponse>(`/api/communities/${slug}/join`, {})
    if (error) {
      Alert.alert('Error', error)
    } else {
      setCommunity((prev) => prev
        ? { ...prev, is_member: data?.is_member ?? !prev.is_member, member_count: data?.member_count ?? (!prev.is_member ? prev.member_count + 1 : Math.max(prev.member_count - 1, 0)) }
        : prev
      )
    }
    setJoining(false)
  }

  if (loading) return <View style={styles.center}><Spinner /></View>
  if (!community) return null

  const name        = isRTL && community.name_ar ? community.name_ar : community.name
  const description = isRTL && community.description_ar ? community.description_ar : community.description
  const meta        = LEVEL_META[community.level]

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

      {/* ── Hero ─────────────────────────────────────────────── */}
      <View style={styles.hero}>
        {community.cover_url
          ? <Image source={{ uri: community.cover_url }} style={styles.heroImg} />
          : (
            <View style={[styles.heroPlaceholder, { backgroundColor: meta.bg }]}>
              <Ionicons name={meta.icon} size={56} color={meta.tint} />
            </View>
          )
        }
        {/* Gradient-ish bottom overlay for breadcrumb */}
        {community.ancestors.length > 0 && (
          <View style={styles.breadcrumbBar}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {community.ancestors.map((a, i) => (
                <View key={a.id} style={styles.bcItem}>
                  {i > 0 && <Text style={styles.bcSep}>›</Text>}
                  <TouchableOpacity onPress={() => router.push(`/communities/${a.slug}` as any)}>
                    <Text style={styles.bcText}>{LEVEL_META[a.level].label} · {a.name}</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
          </View>
        )}
      </View>

      {/* ── Identity card ────────────────────────────────────── */}
      <View style={styles.identityCard}>
        {/* Top: icon + name + verified */}
        <View style={styles.identityTop}>
          <View style={[styles.identityIcon, { backgroundColor: meta.bg }]}>
            <Ionicons name={meta.icon} size={24} color={meta.tint} />
          </View>
          <View style={styles.identityText}>
            <View style={styles.nameRow}>
              <Text style={styles.name}>{name}</Text>
              {community.is_verified && <Ionicons name="checkmark-circle" size={18} color={Colors.brand[500]} />}
            </View>
            <View style={styles.tagRow}>
              <View style={[styles.levelTag, { backgroundColor: meta.bg }]}>
                <Text style={[styles.levelTagText, { color: meta.tint }]}>{meta.label}</Text>
              </View>
              {community.city && <Text style={styles.cityText}>📍 {community.city}</Text>}
            </View>
          </View>
        </View>

        {/* Stats row */}
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{community.member_count.toLocaleString()}</Text>
            <Text style={styles.statLabel}>Members</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{community.event_count}</Text>
            <Text style={styles.statLabel}>Events</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{community.recent_members.length}</Text>
            <Text style={styles.statLabel}>Recent joins</Text>
          </View>
        </View>

        {/* Description */}
        {description ? <Text style={styles.description}>{description}</Text> : null}

        {/* Join / Leave */}
        <TouchableOpacity
          onPress={toggleMembership}
          disabled={joining}
          style={[styles.joinBtn, community.is_member ? styles.joinBtnJoined : styles.joinBtnDefault]}
          activeOpacity={0.85}
        >
          {joining
            ? <ActivityIndicator size="small" color={community.is_member ? '#15803d' : '#fff'} />
            : (
              <View style={styles.joinBtnInner}>
                <Ionicons
                  name={community.is_member ? 'checkmark-circle' : 'add-circle-outline'}
                  size={18}
                  color={community.is_member ? '#15803d' : '#fff'}
                />
                <Text style={[styles.joinBtnText, community.is_member && styles.joinBtnTextJoined]}>
                  {community.is_member ? 'Joined · Tap to leave' : 'Join community'}
                </Text>
              </View>
            )
          }
        </TouchableOpacity>
      </View>

      {/* ── Members ──────────────────────────────────────────── */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Members</Text>
        {community.recent_members.length === 0
          ? <EmptyState icon="👥" title="No members yet" description="Be the first to join" />
          : (
            <View style={styles.membersList}>
              {community.recent_members.map((m, i) => (
                <View key={m.id} style={[styles.memberRow, i < community.recent_members.length - 1 && styles.memberRowBorder]}>
                  <View style={styles.avatar}>
                    {m.avatar_url
                      ? <Image source={{ uri: m.avatar_url }} style={styles.avatarImg} />
                      : <Text style={styles.avatarInitial}>{m.display_name.slice(0, 1).toUpperCase()}</Text>
                    }
                  </View>
                  <View style={styles.memberInfo}>
                    <Text style={styles.memberName}>{m.display_name}</Text>
                    <Text style={styles.memberMeta}>Joined {formatDate(m.joined_at)}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={14} color={Colors.gray[300]} />
                </View>
              ))}
            </View>
          )
        }
      </View>

      {/* ── Activity feed ────────────────────────────────────── */}
      {community.activity.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recent Activity</Text>
          <View style={styles.activityList}>
            {community.activity.map((item, i) => {
              const isEvent = item.type === 'event_published'
              return (
                <TouchableOpacity
                  key={item.id}
                  style={[styles.activityItem, i < community.activity.length - 1 && styles.activityItemBorder]}
                  activeOpacity={item.href ? 0.8 : 1}
                  onPress={item.href ? () => router.push(item.href as any) : undefined}
                >
                  <View style={[styles.activityDot, { backgroundColor: isEvent ? Colors.brand[100] : '#dcfce7' }]}>
                    <Ionicons name={isEvent ? 'calendar-outline' : 'person-add-outline'} size={14} color={isEvent ? Colors.brand[600] : '#15803d'} />
                  </View>
                  <View style={styles.activityBody}>
                    <Text style={styles.activityTitle}>{item.title}</Text>
                    <Text style={styles.activitySub}>{item.subtitle}</Text>
                  </View>
                  <Text style={styles.activityDate}>{formatDate(item.created_at)}</Text>
                </TouchableOpacity>
              )
            })}
          </View>
        </View>
      )}

      {/* ── Happenings ───────────────────────────────────────── */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <View>
            <Text style={[styles.sectionTitle, { marginBottom: 2 }]}>What&apos;s Happening Now</Text>
            <Text style={styles.sectionSub}>Spontaneous, time-limited posts</Text>
          </View>
          {community.is_member && (
            <TouchableOpacity
              onPress={() => setShowPostModal(true)}
              style={styles.postHappeningBtn}
            >
              <Ionicons name="add" size={14} color="#fff" />
              <Text style={styles.postHappeningBtnText}>Post</Text>
            </TouchableOpacity>
          )}
        </View>

        {happeningsLoading ? (
          <View style={styles.centerSmall}><Spinner /></View>
        ) : happenings.length === 0 ? (
          <View style={styles.happeningsEmpty}>
            <Text style={styles.happeningsEmptyIcon}>📍</Text>
            <Text style={styles.happeningsEmptyText}>Nothing happening right now</Text>
            {community.is_member && (
              <Text style={styles.happeningsEmptyHint}>Be the first — post a happening!</Text>
            )}
          </View>
        ) : (
          <View style={styles.happeningsList}>
            {happenings.map((h, i) => {
              const ttlMs  = new Date(h.expires_at).getTime() - Date.now()
              const ttlH   = Math.floor(ttlMs / 3_600_000)
              const ttlM   = Math.floor((ttlMs % 3_600_000) / 60_000)
              const ttl    = ttlMs <= 0 ? 'Expired' : ttlH > 0 ? `${ttlH}h ${ttlM}m left` : `${ttlM}m left`
              const TYPE_EMOJI: Record<HappeningType, string> = { open_invite: '🙋', info: 'ℹ️', question: '❓', alert: '🚨' }
              const isLast = i === happenings.length - 1

              return (
                <View key={h.id} style={[styles.happeningCard, !isLast && styles.happeningCardBorder]}>
                  <View style={styles.happeningHeader}>
                    <View style={styles.happeningAuthorRow}>
                      <View style={styles.avatar}>
                        {h.author.avatar_url
                          ? <Image source={{ uri: h.author.avatar_url }} style={styles.avatarImg} />
                          : <Text style={styles.avatarInitial}>{h.author.display_name.slice(0, 1).toUpperCase()}</Text>
                        }
                      </View>
                      <View>
                        <Text style={styles.happeningAuthor}>{h.author.display_name}</Text>
                        <Text style={styles.happeningTtl}>{ttl}</Text>
                      </View>
                    </View>
                    <View style={styles.happeningTypeBadge}>
                      <Text style={styles.happeningTypeText}>{TYPE_EMOJI[h.type]}</Text>
                    </View>
                  </View>
                  <Text style={styles.happeningBody}>{h.body}</Text>
                  {h.lat && h.lng && (
                    <TouchableOpacity
                      onPress={() => Linking.openURL(`https://maps.google.com/?q=${h.lat},${h.lng}`)}
                      style={styles.happeningLocBtn}
                    >
                      <Ionicons name="location-outline" size={12} color={Colors.brand[600]} />
                      <Text style={styles.happeningLocText}>View on map</Text>
                    </TouchableOpacity>
                  )}
                  {user && ttlMs > 0 && (
                    <View style={styles.happeningActions}>
                      <TouchableOpacity
                        onPress={() => toggleHappeningRsvp(h)}
                        style={[styles.happeningActionBtn, h.user_has_rsvp && styles.happeningActionBtnActive]}
                      >
                        <Text style={[styles.happeningActionText, h.user_has_rsvp && styles.happeningActionTextActive]}>
                          🙋 {h.user_has_rsvp ? "I'm in" : 'Join'} · {h.rsvp_count}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => toggleHappeningReact(h)}
                        style={[styles.happeningActionBtn, h.user_has_reacted && styles.happeningReactActive]}
                      >
                        <Text style={[styles.happeningActionText, h.user_has_reacted && styles.happeningReactTextActive]}>
                          👍 {h.reaction_count}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              )
            })}
          </View>
        )}
      </View>

      {/* ── Events ───────────────────────────────────────────── */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Upcoming Events</Text>
          <TouchableOpacity onPress={() => router.push({ pathname: '/(tabs)/home', params: { community: slug } } as any)}>
            <Text style={styles.sectionLink}>View all →</Text>
          </TouchableOpacity>
        </View>

        {eventsLoading && events.length === 0
          ? <View style={styles.centerSmall}><Spinner /></View>
          : events.length === 0
            ? <EmptyState icon="📅" title="No upcoming events" description="Check back soon" />
            : (
              <>
                {events.map((ev) => {
                  const title = isRTL && ev.title_ar ? ev.title_ar : ev.title
                  return (
                    <TouchableOpacity
                      key={ev.id}
                      style={styles.eventCard}
                      onPress={() => router.push(`/events/${ev.id}` as any)}
                      activeOpacity={0.85}
                    >
                      {ev.cover_image_url
                        ? <Image source={{ uri: ev.cover_image_url }} style={styles.eventThumb} />
                        : (
                          <View style={[styles.eventThumb, styles.eventThumbEmpty]}>
                            <Ionicons name="calendar-outline" size={22} color={Colors.brand[300]} />
                          </View>
                        )
                      }
                      <View style={styles.eventDetails}>
                        <Text style={styles.eventTitle} numberOfLines={1}>{title}</Text>
                        <Text style={styles.eventMeta}>
                          <Ionicons name="time-outline" size={11} color={Colors.gray[400]} /> {formatDate(ev.start_at)}
                        </Text>
                        <Text style={styles.eventMeta}>📍 {ev.city}</Text>
                      </View>
                      <View style={[styles.priceBadge, ev.is_free && styles.priceBadgeFree]}>
                        <Text style={[styles.priceText, ev.is_free && styles.priceTextFree]}>
                          {ev.is_free ? 'Free' : `${ev.price} ${ev.currency}`}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  )
                })}
                {nextCursor && (
                  <TouchableOpacity style={styles.loadMoreBtn} onPress={() => loadEvents(nextCursor)} disabled={eventsLoading}>
                    {eventsLoading
                      ? <ActivityIndicator size="small" color={Colors.brand[500]} />
                      : <Text style={styles.loadMoreText}>Load more events</Text>
                    }
                  </TouchableOpacity>
                )}
              </>
            )
        }
      </View>
    </ScrollView>

      {/* ── Post Happening Modal ──────────────────────────────── */}
      <Modal visible={showPostModal} animationType="slide" transparent onRequestClose={() => setShowPostModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Post a Happening</Text>

            {/* Type chips */}
            <View style={styles.typeChips}>
              {(['open_invite', 'info', 'question', 'alert'] as HappeningType[]).map((t) => {
                const labels: Record<HappeningType, string> = { open_invite: '🙋 Invite', info: 'ℹ️ Info', question: '❓ Question', alert: '🚨 Alert' }
                return (
                  <TouchableOpacity
                    key={t}
                    onPress={() => setPostType(t)}
                    style={[styles.typeChip, postType === t && styles.typeChipActive]}
                  >
                    <Text style={[styles.typeChipText, postType === t && styles.typeChipTextActive]}>
                      {labels[t]}
                    </Text>
                  </TouchableOpacity>
                )
              })}
            </View>

            <TextInput
              value={postBody}
              onChangeText={(v) => setPostBody(v.slice(0, 280))}
              placeholder="What's happening? (e.g. Anyone for padel in 30 min?)"
              placeholderTextColor={Colors.gray[400]}
              multiline
              maxLength={280}
              style={styles.postInput}
            />
            <Text style={styles.charCount}>{postBody.length}/280</Text>

            {/* Location */}
            <View style={styles.locRow}>
              {locState === 'idle' && (
                <TouchableOpacity onPress={attachLocation} style={styles.locBtn}>
                  <Ionicons name="location-outline" size={13} color={Colors.gray[500]} />
                  <Text style={styles.locBtnText}>Add location</Text>
                </TouchableOpacity>
              )}
              {locState === 'loading' && (
                <View style={styles.locBtn}>
                  <ActivityIndicator size="small" color={Colors.gray[400]} />
                  <Text style={styles.locBtnText}>Getting location…</Text>
                </View>
              )}
              {locState === 'attached' && postCoords && (
                <TouchableOpacity onPress={() => { setPostCoords(null); setLocState('idle') }} style={[styles.locBtn, styles.locBtnAttached]}>
                  <Ionicons name="location" size={13} color="#15803d" />
                  <Text style={[styles.locBtnText, { color: '#15803d' }]}>
                    {postCoords.lat.toFixed(4)}, {postCoords.lng.toFixed(4)}  ✕
                  </Text>
                </TouchableOpacity>
              )}
              {locState === 'denied' && (
                <Text style={styles.locDenied}>Location permission denied</Text>
              )}
            </View>

            {/* Expiry */}
            <View style={styles.expiryRow}>
              <Text style={styles.expiryLabel}>Expires in:</Text>
              {[1, 3, 6, 12, 24].map((h) => (
                <TouchableOpacity
                  key={h}
                  onPress={() => setPostExpiry(h)}
                  style={[styles.expiryChip, postExpiry === h && styles.expiryChipActive]}
                >
                  <Text style={[styles.expiryChipText, postExpiry === h && styles.expiryChipTextActive]}>{h}h</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity onPress={() => setShowPostModal(false)} style={styles.modalCancelBtn}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={submitHappening}
                disabled={posting || !postBody.trim()}
                style={[styles.modalPostBtn, (posting || !postBody.trim()) && styles.modalPostBtnDisabled]}
              >
                {posting
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={styles.modalPostText}>Post</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
  )
}

const styles = StyleSheet.create({
  container:  { flex: 1, backgroundColor: '#f4f5f9' },
  content:    { paddingBottom: Spacing[12] },
  center:     { flex: 1, alignItems: 'center', justifyContent: 'center' },
  centerSmall:{ alignItems: 'center', paddingVertical: Spacing[6] },

  // Hero
  hero:              { position: 'relative' },
  heroImg:           { width: '100%', height: 200, resizeMode: 'cover' },
  heroPlaceholder:   { width: '100%', height: 200, alignItems: 'center', justifyContent: 'center' },
  breadcrumbBar:     { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.48)', paddingHorizontal: Spacing[4], paddingVertical: Spacing[2] + 2 },
  bcItem:            { flexDirection: 'row', alignItems: 'center' },
  bcSep:             { color: 'rgba(255,255,255,0.5)', marginHorizontal: 5, fontSize: 12 },
  bcText:            { color: 'rgba(255,255,255,0.9)', fontSize: FontSize.xs, fontWeight: FontWeight.medium },

  // Identity card
  identityCard:  { backgroundColor: '#fff', marginHorizontal: Spacing[4], marginTop: -Spacing[3], borderRadius: Radius['2xl'], padding: Spacing[4], ...Shadow.md ?? Shadow.sm, zIndex: 10, marginBottom: Spacing[4] },
  identityTop:   { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing[3], marginBottom: Spacing[4] },
  identityIcon:  { width: 52, height: 52, borderRadius: Radius.xl, alignItems: 'center', justifyContent: 'center' },
  identityText:  { flex: 1 },
  nameRow:       { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name:          { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.gray[900], flex: 1 },
  tagRow:        { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 6 },
  levelTag:      { paddingHorizontal: Spacing[2], paddingVertical: 3, borderRadius: Radius.full },
  levelTagText:  { fontSize: 11, fontWeight: FontWeight.semibold },
  cityText:      { fontSize: FontSize.xs, color: Colors.gray[500] },

  statsRow:     { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.gray[50], borderRadius: Radius.xl, padding: Spacing[4], marginBottom: Spacing[4] },
  statItem:     { flex: 1, alignItems: 'center' },
  statValue:    { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.gray[900] },
  statLabel:    { fontSize: 11, color: Colors.gray[500], marginTop: 2 },
  statDivider:  { width: 1, height: 32, backgroundColor: Colors.gray[200] },

  description:  { fontSize: FontSize.sm, color: Colors.gray[600], lineHeight: 22, marginBottom: Spacing[4] },

  joinBtn:          { borderRadius: Radius.xl, paddingVertical: Spacing[3] + 2, alignItems: 'center' },
  joinBtnDefault:   { backgroundColor: Colors.brand[600] },
  joinBtnJoined:    { backgroundColor: '#f0fdf4', borderWidth: 1.5, borderColor: '#86efac' },
  joinBtnInner:     { flexDirection: 'row', alignItems: 'center', gap: 8 },
  joinBtnText:      { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: '#fff' },
  joinBtnTextJoined:{ color: '#15803d' },

  // Sections
  section:       { paddingHorizontal: Spacing[4], marginBottom: Spacing[5] },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing[3] },
  sectionTitle:  { fontSize: FontSize.base, fontWeight: FontWeight.bold, color: Colors.gray[900], marginBottom: Spacing[3] },
  sectionLink:   { fontSize: FontSize.sm, color: Colors.brand[600], fontWeight: FontWeight.medium },

  // Members
  membersList:   { backgroundColor: '#fff', borderRadius: Radius.xl, overflow: 'hidden', borderWidth: 1, borderColor: Colors.gray[200], ...Shadow.sm },
  memberRow:     { flexDirection: 'row', alignItems: 'center', gap: Spacing[3], padding: Spacing[3] },
  memberRowBorder: { borderBottomWidth: 1, borderBottomColor: Colors.gray[100] },
  avatar:        { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.brand[100], alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarImg:     { width: '100%', height: '100%' },
  avatarInitial: { fontSize: FontSize.base, fontWeight: FontWeight.bold, color: Colors.brand[700] },
  memberInfo:    { flex: 1 },
  memberName:    { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.gray[900] },
  memberMeta:    { fontSize: FontSize.xs, color: Colors.gray[400], marginTop: 2 },

  // Activity
  activityList:      { backgroundColor: '#fff', borderRadius: Radius.xl, overflow: 'hidden', borderWidth: 1, borderColor: Colors.gray[200], ...Shadow.sm },
  activityItem:      { flexDirection: 'row', alignItems: 'center', gap: Spacing[3], padding: Spacing[3] },
  activityItemBorder:{ borderBottomWidth: 1, borderBottomColor: Colors.gray[100] },
  activityDot:       { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  activityBody:      { flex: 1 },
  activityTitle:     { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.gray[900] },
  activitySub:       { fontSize: FontSize.xs, color: Colors.gray[500], marginTop: 1 },
  activityDate:      { fontSize: 11, color: Colors.gray[400] },

  // Events
  eventCard:         { backgroundColor: '#fff', borderRadius: Radius.xl, padding: Spacing[3], marginBottom: Spacing[2], flexDirection: 'row', alignItems: 'center', gap: Spacing[3], borderWidth: 1, borderColor: Colors.gray[200], ...Shadow.sm },
  eventThumb:        { width: 68, height: 56, borderRadius: Radius.lg, resizeMode: 'cover' },
  eventThumbEmpty:   { backgroundColor: Colors.brand[50], alignItems: 'center', justifyContent: 'center' },
  eventDetails:      { flex: 1 },
  eventTitle:        { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.gray[900] },
  eventMeta:         { fontSize: FontSize.xs, color: Colors.gray[500], marginTop: 3 },
  priceBadge:        { backgroundColor: Colors.brand[50], borderRadius: Radius.full, paddingHorizontal: Spacing[2], paddingVertical: 5 },
  priceBadgeFree:    { backgroundColor: '#f0fdf4' },
  priceText:         { fontSize: 11, fontWeight: FontWeight.bold, color: Colors.brand[700] },
  priceTextFree:     { color: '#15803d' },
  loadMoreBtn:       { alignItems: 'center', paddingVertical: Spacing[4] },
  loadMoreText:      { fontSize: FontSize.sm, color: Colors.brand[600], fontWeight: FontWeight.medium },

  // Section subtitle
  sectionSub:        { fontSize: FontSize.xs, color: Colors.gray[400], marginBottom: Spacing[3] },

  // Post happening button
  postHappeningBtn:      { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.brand[600], borderRadius: Radius.lg, paddingHorizontal: Spacing[3], paddingVertical: Spacing[2] },
  postHappeningBtnText:  { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: '#fff' },

  // Happenings empty
  happeningsEmpty:     { alignItems: 'center', paddingVertical: Spacing[8], backgroundColor: '#fff', borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.gray[200], borderStyle: 'dashed' },
  happeningsEmptyIcon: { fontSize: 28, marginBottom: Spacing[2] },
  happeningsEmptyText: { fontSize: FontSize.sm, fontWeight: FontWeight.medium, color: Colors.gray[600] },
  happeningsEmptyHint: { fontSize: FontSize.xs, color: Colors.gray[400], marginTop: 4 },

  // Happening cards
  happeningsList:    { backgroundColor: '#fff', borderRadius: Radius.xl, overflow: 'hidden', borderWidth: 1, borderColor: Colors.gray[200], ...Shadow.sm },
  happeningCard:     { padding: Spacing[3] },
  happeningCardBorder: { borderBottomWidth: 1, borderBottomColor: Colors.gray[100] },
  happeningHeader:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing[2] },
  happeningAuthorRow:{ flexDirection: 'row', alignItems: 'center', gap: Spacing[2] },
  happeningAuthor:   { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.gray[900] },
  happeningTtl:      { fontSize: 11, color: Colors.gray[400], marginTop: 1 },
  happeningTypeBadge:{ width: 30, height: 30, borderRadius: 15, backgroundColor: Colors.gray[100], alignItems: 'center', justifyContent: 'center' },
  happeningTypeText: { fontSize: 14 },
  happeningBody:     { fontSize: FontSize.sm, color: Colors.gray[800], lineHeight: 20, marginBottom: Spacing[3] },
  happeningActions:  { flexDirection: 'row', gap: Spacing[2] },
  happeningActionBtn:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing[3], paddingVertical: 6, borderRadius: Radius.lg, backgroundColor: Colors.gray[100] },
  happeningActionBtnActive:{ backgroundColor: Colors.brand[600] },
  happeningReactActive:    { backgroundColor: '#fef9c3' },
  happeningActionText:     { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, color: Colors.gray[700] },
  happeningActionTextActive:   { color: '#fff' },
  happeningReactTextActive:    { color: '#713f12' },
  happeningLocBtn:  { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: Spacing[2] },
  happeningLocText: { fontSize: 11, color: Colors.brand[600] },

  // Post Happening Modal
  modalOverlay:   { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  modalSheet:     { backgroundColor: '#fff', borderTopLeftRadius: Radius['2xl'], borderTopRightRadius: Radius['2xl'], padding: Spacing[5], paddingBottom: Spacing[8] },
  modalHandle:    { width: 36, height: 4, borderRadius: 2, backgroundColor: Colors.gray[300], alignSelf: 'center', marginBottom: Spacing[4] },
  modalTitle:     { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.gray[900], marginBottom: Spacing[4] },
  typeChips:      { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing[2], marginBottom: Spacing[4] },
  typeChip:       { paddingHorizontal: Spacing[3], paddingVertical: Spacing[2], borderRadius: Radius.full, backgroundColor: Colors.gray[100], borderWidth: 1, borderColor: Colors.gray[200] },
  typeChipActive: { backgroundColor: Colors.brand[600], borderColor: Colors.brand[600] },
  typeChipText:   { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, color: Colors.gray[700] },
  typeChipTextActive: { color: '#fff' },
  postInput:      { borderWidth: 1, borderColor: Colors.gray[200], borderRadius: Radius.xl, padding: Spacing[3], fontSize: FontSize.sm, color: Colors.gray[900], minHeight: 100, textAlignVertical: 'top', marginBottom: Spacing[1] },
  charCount:      { fontSize: 11, color: Colors.gray[400], textAlign: 'right', marginBottom: Spacing[2] },
  locRow:         { marginBottom: Spacing[3] },
  locBtn:         { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: Spacing[2] + 2, paddingVertical: 6, borderRadius: Radius.lg, backgroundColor: Colors.gray[100], borderWidth: 1, borderColor: Colors.gray[200], alignSelf: 'flex-start' },
  locBtnAttached: { backgroundColor: '#f0fdf4', borderColor: '#86efac' },
  locBtnText:     { fontSize: 11, color: Colors.gray[600] },
  locDenied:      { fontSize: 11, color: '#ef4444' },
  expiryRow:      { flexDirection: 'row', alignItems: 'center', gap: Spacing[2], marginBottom: Spacing[5], flexWrap: 'wrap' },
  expiryLabel:    { fontSize: FontSize.xs, color: Colors.gray[500] },
  expiryChip:     { paddingHorizontal: Spacing[2] + 2, paddingVertical: 5, borderRadius: Radius.full, backgroundColor: Colors.gray[100], borderWidth: 1, borderColor: Colors.gray[200] },
  expiryChipActive:     { backgroundColor: Colors.brand[100], borderColor: Colors.brand[300] },
  expiryChipText:       { fontSize: 11, fontWeight: FontWeight.semibold, color: Colors.gray[600] },
  expiryChipTextActive: { color: Colors.brand[700] },
  modalActions:   { flexDirection: 'row', gap: Spacing[3] },
  modalCancelBtn: { flex: 1, alignItems: 'center', paddingVertical: Spacing[3], borderRadius: Radius.xl, backgroundColor: Colors.gray[100] },
  modalCancelText:{ fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.gray[700] },
  modalPostBtn:   { flex: 2, alignItems: 'center', paddingVertical: Spacing[3], borderRadius: Radius.xl, backgroundColor: Colors.brand[600] },
  modalPostBtnDisabled: { opacity: 0.5 },
  modalPostText:  { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: '#fff' },
})
