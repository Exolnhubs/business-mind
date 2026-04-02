import { useEffect, useState } from 'react'
import {
  View, Text, FlatList, StyleSheet,
  TouchableOpacity, ScrollView, ActivityIndicator, Image, Alert,
} from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { apiGet, apiPost, apiDelete } from '@/lib/api'
import { useAuth } from '@/contexts/auth-context'
import { useLocale } from '@/contexts/locale-context'
import { Spinner } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { formatDate } from '@/lib/utils'
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadow } from '@/theme'
import type { Community, CommunityLevel, Event } from '@/types/database'

type CommunityDetail = Community & {
  is_member: boolean
  event_count: number
  ancestors: Pick<Community, 'id' | 'name' | 'name_ar' | 'slug' | 'level'>[]
  recent_events: Pick<Event, 'id' | 'title' | 'title_ar' | 'cover_image_url' | 'start_at' | 'city' | 'is_free' | 'price' | 'currency'>[]
}

type EventItem = Pick<Event, 'id' | 'title' | 'title_ar' | 'cover_image_url' | 'start_at' | 'city' | 'is_free' | 'price' | 'currency'>

const LEVEL_ICONS: Record<CommunityLevel, string> = {
  micro:    '🏘️',
  interest: '🎯',
  district: '🏙️',
  city:     '🌆',
  country:  '🌍',
}

export default function CommunityDetailScreen() {
  const { slug }    = useLocalSearchParams<{ slug: string }>()
  const { user }    = useAuth()
  const { locale }  = useLocale()
  const router      = useRouter()
  const isRTL       = locale === 'ar'

  const [community, setCommunity] = useState<CommunityDetail | null>(null)
  const [loading, setLoading]     = useState(true)
  const [joining, setJoining]     = useState(false)
  const [events, setEvents]       = useState<EventItem[]>([])
  const [eventsLoading, setEventsLoading] = useState(false)
  const [nextCursor, setNextCursor]       = useState<string | null>(null)

  useEffect(() => {
    apiGet<CommunityDetail>(`/api/communities/${slug}`)
      .then(({ data }) => {
        if (data) setCommunity(data)
        else router.back()
      })
      .finally(() => setLoading(false))
  }, [slug])

  async function loadEvents(cursor?: string) {
    if (eventsLoading) return
    setEventsLoading(true)
    const params = new URLSearchParams({ per_page: '10' })
    if (cursor) params.set('cursor', cursor)

    const { data } = await apiGet<{ events: EventItem[]; next_cursor: string | null }>(
      `/api/communities/${slug}/events?${params}`
    )
    if (data) {
      setEvents((prev) => cursor ? [...prev, ...data.events] : data.events)
      setNextCursor(data.next_cursor)
    }
    setEventsLoading(false)
  }

  useEffect(() => {
    if (community) loadEvents()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [community?.id])

  async function toggleMembership() {
    if (!user) { router.push('/auth/login' as any); return }
    if (!community) return
    setJoining(true)
    const { error } = community.is_member
      ? await apiDelete(`/api/communities/${slug}/leave`)
      : await apiPost(`/api/communities/${slug}/join`, {})

    if (error) {
      Alert.alert('Error', error)
    } else {
      setCommunity((prev) =>
        prev
          ? {
              ...prev,
              is_member: !prev.is_member,
              member_count: !prev.is_member ? prev.member_count + 1 : Math.max(prev.member_count - 1, 0),
            }
          : prev
      )
    }
    setJoining(false)
  }

  if (loading) {
    return <View style={styles.center}><Spinner /></View>
  }

  if (!community) return null

  const name = isRTL && community.name_ar ? community.name_ar : community.name
  const description = isRTL && community.description_ar ? community.description_ar : community.description

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Hero */}
      <View style={styles.hero}>
        {community.cover_url ? (
          <Image source={{ uri: community.cover_url }} style={styles.heroImage} />
        ) : (
          <View style={styles.heroPlaceholder}>
            <Text style={styles.heroIcon}>{LEVEL_ICONS[community.level]}</Text>
          </View>
        )}

        {/* Ancestors breadcrumb */}
        {community.ancestors.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.breadcrumb}>
            {community.ancestors.map((a, i) => (
              <View key={a.id} style={styles.breadcrumbItem}>
                {i > 0 && <Text style={styles.breadcrumbSep}>›</Text>}
                <TouchableOpacity onPress={() => router.push(`/communities/${a.slug}` as any)}>
                  <Text style={styles.breadcrumbText}>{LEVEL_ICONS[a.level]} {a.name}</Text>
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>
        )}
      </View>

      {/* Info card */}
      <View style={styles.infoCard}>
        <View style={styles.nameRow}>
          <Text style={styles.name}>{name}</Text>
          {community.is_verified && (
            <Ionicons name="checkmark-circle" size={18} color={Colors.brand[500]} />
          )}
        </View>

        <View style={styles.metaRow}>
          <Text style={styles.metaText}>📍 {community.city ?? community.country}</Text>
          <Text style={styles.metaDot}>·</Text>
          <Text style={styles.metaText}>👥 {community.member_count.toLocaleString()} members</Text>
          <Text style={styles.metaDot}>·</Text>
          <Text style={styles.metaText}>📅 {community.event_count} events</Text>
        </View>

        {description ? (
          <Text style={styles.description}>{description}</Text>
        ) : null}

        <TouchableOpacity
          onPress={toggleMembership}
          disabled={joining}
          style={[styles.joinBtn, community.is_member && styles.joinBtnJoined]}
        >
          {joining ? (
            <ActivityIndicator size="small" color={community.is_member ? Colors.gray[700] : '#fff'} />
          ) : (
            <Text style={[styles.joinBtnText, community.is_member && styles.joinBtnTextJoined]}>
              {community.is_member ? '✓ Joined — Leave community' : 'Join community'}
            </Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Events */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Upcoming Events</Text>
          <TouchableOpacity onPress={() => router.push({ pathname: '/', params: { community: slug } } as any)}>
            <Text style={styles.sectionLink}>View all</Text>
          </TouchableOpacity>
        </View>

        {eventsLoading && events.length === 0 ? (
          <View style={styles.centerSmall}><Spinner /></View>
        ) : events.length === 0 ? (
          <EmptyState icon="📅" title="No upcoming events" description="Check back soon" />
        ) : (
          <>
            {events.map((ev) => {
              const evTitle = isRTL && ev.title_ar ? ev.title_ar : ev.title
              return (
                <TouchableOpacity
                  key={ev.id}
                  style={styles.eventCard}
                  onPress={() => router.push(`/events/${ev.id}` as any)}
                  activeOpacity={0.85}
                >
                  {ev.cover_image_url ? (
                    <Image source={{ uri: ev.cover_image_url }} style={styles.eventThumb} />
                  ) : (
                    <View style={[styles.eventThumb, styles.eventThumbPlaceholder]}>
                      <Text style={{ fontSize: 22 }}>📅</Text>
                    </View>
                  )}
                  <View style={styles.eventInfo}>
                    <Text style={styles.eventTitle} numberOfLines={1}>{evTitle}</Text>
                    <Text style={styles.eventMeta}>{formatDate(ev.start_at)}</Text>
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
              <TouchableOpacity
                onPress={() => loadEvents(nextCursor)}
                style={styles.loadMoreBtn}
                disabled={eventsLoading}
              >
                {eventsLoading
                  ? <ActivityIndicator size="small" color={Colors.brand[600]} />
                  : <Text style={styles.loadMoreText}>Load more events</Text>
                }
              </TouchableOpacity>
            )}
          </>
        )}
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: Colors.gray[50] },
  content:      { paddingBottom: Spacing[10] },
  center:       { flex: 1, alignItems: 'center', justifyContent: 'center' },
  centerSmall:  { alignItems: 'center', paddingVertical: Spacing[6] },

  hero:           { position: 'relative' },
  heroImage:      { width: '100%', height: 180 },
  heroPlaceholder:{ width: '100%', height: 180, backgroundColor: Colors.brand[50], alignItems: 'center', justifyContent: 'center' },
  heroIcon:       { fontSize: 56 },
  breadcrumb:     { backgroundColor: 'rgba(0,0,0,0.45)', position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: Spacing[4], paddingVertical: Spacing[2] },
  breadcrumbItem: { flexDirection: 'row', alignItems: 'center' },
  breadcrumbSep:  { color: 'rgba(255,255,255,0.6)', marginHorizontal: 4, fontSize: 12 },
  breadcrumbText: { color: '#fff', fontSize: FontSize.xs },

  infoCard:    { backgroundColor: '#fff', margin: Spacing[4], borderRadius: Radius['2xl'], padding: Spacing[4], ...Shadow.sm },
  nameRow:     { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: Spacing[2] },
  name:        { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.gray[900], flex: 1 },
  metaRow:     { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: Spacing[1], marginBottom: Spacing[3] },
  metaText:    { fontSize: FontSize.xs, color: Colors.gray[500] },
  metaDot:     { fontSize: FontSize.xs, color: Colors.gray[300] },
  description: { fontSize: FontSize.sm, color: Colors.gray[600], lineHeight: 22, marginBottom: Spacing[4] },

  joinBtn:          { backgroundColor: Colors.brand[600], borderRadius: Radius.xl, paddingVertical: Spacing[3], alignItems: 'center' },
  joinBtnJoined:    { backgroundColor: Colors.gray[100] },
  joinBtnText:      { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: '#fff' },
  joinBtnTextJoined:{ color: Colors.gray[700] },

  section:       { paddingHorizontal: Spacing[4] },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing[3] },
  sectionTitle:  { fontSize: FontSize.base, fontWeight: FontWeight.bold, color: Colors.gray[900] },
  sectionLink:   { fontSize: FontSize.sm, color: Colors.brand[600] },

  eventCard:           { backgroundColor: '#fff', borderRadius: Radius.xl, padding: Spacing[3], marginBottom: Spacing[2], flexDirection: 'row', alignItems: 'center', gap: Spacing[3], ...Shadow.sm },
  eventThumb:          { width: 64, height: 52, borderRadius: Radius.lg, resizeMode: 'cover' },
  eventThumbPlaceholder:{ backgroundColor: Colors.brand[50], alignItems: 'center', justifyContent: 'center' },
  eventInfo:           { flex: 1 },
  eventTitle:          { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.gray[900] },
  eventMeta:           { fontSize: FontSize.xs, color: Colors.gray[500], marginTop: 2 },
  priceBadge:          { backgroundColor: Colors.brand[50], borderRadius: Radius.full, paddingHorizontal: Spacing[2], paddingVertical: 4 },
  priceBadgeFree:      { backgroundColor: '#f0fdf4' },
  priceText:           { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, color: Colors.brand[700] },
  priceTextFree:       { color: '#15803d' },

  loadMoreBtn:  { alignItems: 'center', paddingVertical: Spacing[4] },
  loadMoreText: { fontSize: FontSize.sm, color: Colors.brand[600], fontWeight: FontWeight.medium },
})
