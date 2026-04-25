import { useEffect, useState, useCallback, useMemo } from 'react'
import {
  View, Text, StyleSheet, FlatList, ScrollView,
  ActivityIndicator, RefreshControl, TouchableOpacity, Alert,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { apiDelete, apiGet, apiPost } from '@/lib/api'
import { useAuth } from '@/contexts/auth-context'
import { EventCard, EventCardSkeleton } from '@/components/events/EventCard'
import { HappeningDiscoveryCard, type HappeningDiscoveryItem } from '@/components/happenings/HappeningDiscoveryCard'
import { HappeningCommentsSheet } from '@/components/happenings/HappeningCommentsSheet'
import { EmptyState } from '@/components/ui/EmptyState'
import { TicketFlipLoader } from '@/components/ui/TicketFlipLoader'
import { Colors, Spacing, FontSize, FontWeight, Radius } from '@/theme'
import type {
  Community,
  Event,
  EventCategory,
  EventWithOrganizer,
  OrganizerProfile,
  Profile,
} from '@/types/database'
import { applyResolvedEventWindow, compareEventsByResolvedStartAt } from '@/lib/event-recurrence'

const PAGE_SIZE = 10

interface Props { onExplore?: () => void }

type FeedOrganizer = Pick<Profile, 'id' | 'display_name' | 'avatar_url'> & {
  organizer_profile: Pick<OrganizerProfile, 'business_name' | 'business_name_ar' | 'logo_url' | 'verified'> | null
}

type JoinedCommunity = Pick<Community, 'id' | 'name' | 'name_ar' | 'slug' | 'level'>
type HappeningsDiscoverResponse = {
  happenings: HappeningDiscoveryItem[]
}
type DiscoveryRailItem =
  | { kind: 'event'; id: string; event: EventWithOrganizer }
  | { kind: 'happening'; id: string; happening: HappeningDiscoveryItem }

interface SavedSignalEvent {
  id: string
  category_id: string | null
  city: string
  organizer_id: string
}

async function hydrateEvents(rows: Event[]): Promise<EventWithOrganizer[]> {
  const organizerIds = [...new Set(rows.map((row) => row.organizer_id))]
  const categoryIds = [...new Set(rows.map((row) => row.category_id).filter((id): id is string => Boolean(id)))]
  const eventIds = rows.map((row) => row.id)

  const [{ data: organizers }, { data: organizerProfiles }, { data: categories }, { data: hotTickets }] = await Promise.all([
    organizerIds.length
      ? supabase.from('profiles').select('id, display_name, avatar_url').in('id', organizerIds)
      : Promise.resolve({ data: [] as Pick<Profile, 'id' | 'display_name' | 'avatar_url'>[] }),
    organizerIds.length
      ? supabase.from('organizer_profiles').select('user_id, business_name, business_name_ar, logo_url, verified').in('user_id', organizerIds)
      : Promise.resolve({ data: [] as Array<Pick<OrganizerProfile, 'user_id' | 'business_name' | 'business_name_ar' | 'logo_url' | 'verified'>> }),
    categoryIds.length
      ? supabase.from('event_categories').select('id, name_en, name_ar, icon').in('id', categoryIds)
      : Promise.resolve({ data: [] as Pick<EventCategory, 'id' | 'name_en' | 'name_ar' | 'icon'>[] }),
    eventIds.length
      ? supabase.from('ticket_types').select('id, event_id, price, is_free, is_active, is_hot_offer, hot_offer_price, hot_offer_ends_at').in('event_id', eventIds).eq('is_active', true)
      : Promise.resolve({ data: [] as Array<{ id: string; event_id: string; price: number; is_free: boolean; is_active: boolean; is_hot_offer: boolean; hot_offer_price: number | null; hot_offer_ends_at: string | null }> }),
  ])

  const ticketsByEventId = new Map<string, typeof hotTickets>()
  for (const tt of hotTickets ?? []) {
    if (!ticketsByEventId.has(tt.event_id)) ticketsByEventId.set(tt.event_id, [])
    ticketsByEventId.get(tt.event_id)!.push(tt)
  }

  const organizerProfileByUserId = new Map(
    (organizerProfiles ?? []).map((entry) => [entry.user_id, entry]),
  )
  const organizerById = new Map<string, FeedOrganizer>(
    (organizers ?? []).map((organizer) => [
      organizer.id,
      {
        ...organizer,
        organizer_profile: organizerProfileByUserId.get(organizer.id)
          ? {
            business_name: organizerProfileByUserId.get(organizer.id)!.business_name,
            business_name_ar: organizerProfileByUserId.get(organizer.id)!.business_name_ar,
            logo_url: organizerProfileByUserId.get(organizer.id)!.logo_url,
            verified: organizerProfileByUserId.get(organizer.id)!.verified,
          }
          : null,
      },
    ]),
  )
  const categoryById = new Map(
    (categories ?? []).map((category) => [category.id, category]),
  )

  return rows
    .map((row) => ({
      ...row,
      organizer: organizerById.get(row.organizer_id) ?? {
        id: row.organizer_id,
        display_name: '',
        avatar_url: null,
        organizer_profile: null,
      },
      category: row.category_id ? categoryById.get(row.category_id) ?? null : null,
      ticket_types: ticketsByEventId.get(row.id) ?? [],
    }))
    .map((row) => applyResolvedEventWindow(row))
}

function resolveUpcomingEvents(rows: EventWithOrganizer[]) {
  return rows
    .map((event) => applyResolvedEventWindow(event))
    .filter((event) => new Date(event.start_at).getTime() >= Date.now())
    .sort((left, right) => compareEventsByResolvedStartAt(left, right))
}

function interleaveDiscoveryItems(
  events: EventWithOrganizer[],
  happenings: HappeningDiscoveryItem[],
  maxItems = 8,
): DiscoveryRailItem[] {
  const result: DiscoveryRailItem[] = []
  let eventIndex = 0
  let happeningIndex = 0
  let nextKind: 'event' | 'happening' =
    happenings.length > events.length ? 'happening' : 'event'

  while (result.length < maxItems && (eventIndex < events.length || happeningIndex < happenings.length)) {
    if (nextKind === 'event' && eventIndex < events.length) {
      const event = events[eventIndex++]
      result.push({ kind: 'event', id: `event:${event.id}`, event })
      nextKind = 'happening'
      continue
    }

    if (nextKind === 'happening' && happeningIndex < happenings.length) {
      const happening = happenings[happeningIndex++]
      result.push({ kind: 'happening', id: `happening:${happening.id}`, happening })
      nextKind = 'event'
      continue
    }

    if (eventIndex < events.length) {
      const event = events[eventIndex++]
      result.push({ kind: 'event', id: `event:${event.id}`, event })
    } else if (happeningIndex < happenings.length) {
      const happening = happenings[happeningIndex++]
      result.push({ kind: 'happening', id: `happening:${happening.id}`, happening })
    }
  }

  return result
}

function dedupeHappeningItems(items: HappeningDiscoveryItem[]) {
  const seen = new Set<string>()
  return items.filter((item) => {
    if (seen.has(item.id)) return false
    seen.add(item.id)
    return true
  })
}

function claimUniqueHappenings(
  items: HappeningDiscoveryItem[],
  claimedIds: Set<string>,
) {
  return dedupeHappeningItems(items).filter((item) => {
    if (claimedIds.has(item.id)) return false
    claimedIds.add(item.id)
    return true
  })
}

export default function FeedScreen({ onExplore }: Props = {}) {
  const { user } = useAuth()
  const router = useRouter()

  const [events, setEvents] = useState<EventWithOrganizer[]>([])
  const [savedEvents, setSavedEvents] = useState<EventWithOrganizer[]>([])
  const [savedInspiredEvents, setSavedInspiredEvents] = useState<EventWithOrganizer[]>([])
  const [myCommunityEvents, setMyCommunityEvents] = useState<EventWithOrganizer[]>([])
  const [myCommunityHappenings, setMyCommunityHappenings] = useState<HappeningDiscoveryItem[]>([])
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set())
  const [selectedHappening, setSelectedHappening] = useState<HappeningDiscoveryItem | null>(null)
  const [following, setFollowing] = useState(0)
  const [loading, setLoading] = useState(true)
  const [savedLoading, setSavedLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)

  const loadJoinedCommunities = useCallback(async (force = false) => {
    if (!user) {
      return [] as JoinedCommunity[]
    }

    const { data, error } = await apiGet<{ data: JoinedCommunity[] }>(
      '/api/communities?member_only=true&per_page=20',
      { force },
    )

    if (error) {
      return [] as JoinedCommunity[]
    }

    const nextCommunities = data?.data ?? []
    return nextCommunities
  }, [user])

  const fetchSavedRail = useCallback(async () => {
    if (!user) {
      setSavedEvents([])
      setSavedIds(new Set())
      setSavedLoading(false)
      return
    }

    const { data } = await supabase
      .from('saved_events')
      .select('event_id')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    const orderedEventIds = (data ?? []).map((saved) => saved.event_id)
    setSavedIds(new Set(orderedEventIds))

    const railEventIds = orderedEventIds.slice(0, 6)
    if (railEventIds.length === 0) {
      setSavedEvents([])
      setSavedLoading(false)
      return
    }

    const { data: eventRows } = await supabase
      .from('events')
      .select('*')
      .in('id', railEventIds)

    const hydratedEvents = await hydrateEvents((eventRows ?? []) as Event[])
    const eventById = new Map(hydratedEvents.map((event) => [event.id, event]))
    const railItems = railEventIds
      .map((eventId) => eventById.get(eventId))
      .filter((event): event is EventWithOrganizer => Boolean(event))

    setSavedEvents(railItems)
    setSavedLoading(false)
  }, [user])

  const fetchDiscoverHappenings = useCallback(async (
    query: Record<string, string | number | boolean | undefined>,
    force = false,
  ) => {
    const params = new URLSearchParams()
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== false) {
        params.set(key, String(value))
      }
    })
    const { data, error } = await apiGet<HappeningsDiscoverResponse>(`/api/happenings/discover?${params.toString()}`, { force })
    return error ? [] : (data?.happenings ?? [])
  }, [])

  const fetchRecommendationRails = useCallback(async (force = false) => {
    if (!user) {
      setSavedInspiredEvents([])
      setMyCommunityEvents([])
      setMyCommunityHappenings([])
      return
    }

    const joined = await loadJoinedCommunities(force)

    const [savedSignalsRes, myCommunityHappeningResults, communityLinksRes] = await Promise.all([
      supabase
        .from('saved_events')
        .select(`
          event_id,
          event:events!event_id(id, category_id, city, organizer_id)
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(12),
      joined.length > 0
        ? fetchDiscoverHappenings({
          joined_only: true,
          limit: 8,
        }, force)
        : Promise.resolve([]),
      joined.length > 0
        ? supabase
          .from('event_communities')
          .select('event_id')
          .in('community_id', joined.slice(0, 6).map((community) => community.id))
          .limit(30)
        : Promise.resolve({ data: null }),
    ])

    const savedSignals = ((savedSignalsRes.data ?? []) as unknown as Array<{ event_id: string; event: SavedSignalEvent | null }>)
      .map((row) => row.event)
      .filter(Boolean) as SavedSignalEvent[]

    let rankedSavedEvents: EventWithOrganizer[] = []

    if (savedSignals.length > 0) {
      const savedEventIds = new Set(((savedSignalsRes.data ?? []) as unknown as Array<{ event_id: string }>).map((row) => row.event_id))
      const savedCategories = [...new Set(savedSignals.map((event) => event.category_id).filter(Boolean))] as string[]
      const savedCities = [...new Set(savedSignals.map((event) => event.city).filter(Boolean))]
      const savedOrganizers = new Set(savedSignals.map((event) => event.organizer_id))

      let candidateQuery = supabase
        .from('events')
        .select('*')
        .eq('is_published', true)
        .eq('is_cancelled', false)
        .limit(40)

      if (savedCategories.length > 0) {
        candidateQuery = candidateQuery.in('category_id', savedCategories)
      } else if (savedCities.length > 0) {
        candidateQuery = candidateQuery.in('city', savedCities)
      }

      const { data: candidateData } = await candidateQuery
      const candidateList = resolveUpcomingEvents(await hydrateEvents((candidateData ?? []) as Event[]))

      rankedSavedEvents = candidateList
        .filter((event) => !savedEventIds.has(event.id))
        .map((event) => {
          let score = 0
          if (event.category_id && savedCategories.includes(event.category_id)) score += 3
          if (savedCities.includes(event.city)) score += 2
          if (savedOrganizers.has(event.organizer_id)) score += 1
          return { event, score }
        })
        .filter((item) => item.score > 0)
        .sort((a, b) => {
          if (b.score !== a.score) return b.score - a.score
          return compareEventsByResolvedStartAt(a.event, b.event)
        })
        .slice(0, 6)
        .map((item) => item.event)
    }

    const communityEventIds = [...new Set(((communityLinksRes.data ?? []) as { event_id: string }[]).map((entry) => entry.event_id))]
    if (communityEventIds.length > 0) {
      const { data: railEventRows } = await supabase
        .from('events')
        .select('*')
        .in('id', communityEventIds)
        .eq('is_published', true)
        .eq('is_cancelled', false)

      const hydratedCommunityEvents = resolveUpcomingEvents(await hydrateEvents((railEventRows ?? []) as Event[]))
      const eventMap = new Map(hydratedCommunityEvents.map((event) => [event.id, event]))
      setMyCommunityEvents(
        communityEventIds
          .map((id) => eventMap.get(id))
          .filter((event): event is EventWithOrganizer => Boolean(event))
          .slice(0, 8),
      )
    } else {
      setMyCommunityEvents([])
    }

    setMyCommunityHappenings(myCommunityHappeningResults)
    setSavedInspiredEvents(rankedSavedEvents)
  }, [fetchDiscoverHappenings, loadJoinedCommunities, user])

  const load = useCallback(async (reset = false) => {
    if (!user) {
      setLoading(false)
      setRefreshing(false)
      setLoadingMore(false)
      setSavedLoading(false)
      return
    }
    const currentPage = reset ? 1 : page

    const { data: follows } = await supabase
      .from('organizer_follows')
      .select('organizer_id')
      .eq('follower_id', user.id)

    const orgIds = (follows ?? []).map((f) => f.organizer_id)
    setFollowing(orgIds.length)

    if (orgIds.length === 0) {
      setEvents([])
      setLoading(false)
      setRefreshing(false)
      setLoadingMore(false)
      return
    }

    const from = (currentPage - 1) * PAGE_SIZE
    const to = from + PAGE_SIZE - 1

    const { data, count } = await supabase
      .from('events')
      .select('*', { count: 'exact' })
      .in('organizer_id', orgIds)
      .eq('is_published', true)
      .eq('is_cancelled', false)
      .range(from, to)

    const newEvents = (await hydrateEvents((data ?? []) as Event[]))
      .filter((event) => new Date(event.start_at).getTime() >= Date.now())
      .sort((left, right) => compareEventsByResolvedStartAt(left, right))

    setEvents(reset ? newEvents : (prev) => [...prev, ...newEvents])
    setHasMore((count ?? 0) > (from + newEvents.length))
    setPage(currentPage + 1)
    setLoading(false)
    setRefreshing(false)
    setLoadingMore(false)
  }, [page, user])

  const patchCommunityHappenings = useCallback((
    happeningId: string,
    updater: (happening: HappeningDiscoveryItem) => HappeningDiscoveryItem,
  ) => {
    setMyCommunityHappenings((items) =>
      items.map((item) => (item.id === happeningId ? updater(item) : item)),
    )
    setSelectedHappening((current) => (
      current?.id === happeningId ? updater(current) : current
    ))
  }, [])

  async function toggleCommunityHappeningRsvp(happening: HappeningDiscoveryItem) {
    if (!user) {
      router.push('/(auth)/login')
      return
    }

    const { data, error } = happening.user_has_rsvp
      ? await apiDelete<{ rsvp: boolean; rsvp_count: number }>(`/api/happenings/${happening.id}/rsvp`)
      : await apiPost<{ rsvp: boolean; rsvp_count: number }>(`/api/happenings/${happening.id}/rsvp`, {})

    if (error) {
      Alert.alert('Happenings unavailable', error)
      return
    }
    if (!data) return

    patchCommunityHappenings(happening.id, (item) => ({
      ...item,
      user_has_rsvp: data.rsvp,
      rsvp_count: data.rsvp_count,
    }))
  }

  async function toggleCommunityHappeningReact(happening: HappeningDiscoveryItem) {
    if (!user) {
      router.push('/(auth)/login')
      return
    }

    const { data, error } = happening.user_has_reacted
      ? await apiDelete<{ reacted: boolean; reaction_count: number }>(`/api/happenings/${happening.id}/react`)
      : await apiPost<{ reacted: boolean; reaction_count: number }>(`/api/happenings/${happening.id}/react`, {})

    if (error) {
      Alert.alert('Happenings unavailable', error)
      return
    }
    if (!data) return

    patchCommunityHappenings(happening.id, (item) => ({
      ...item,
      user_has_reacted: data.reacted,
      reaction_count: data.reaction_count,
    }))
  }

  const communityDiscoveryItems = useMemo(() => {
    const claimedIds = new Set<string>()
    return interleaveDiscoveryItems(
      myCommunityEvents,
      claimUniqueHappenings(myCommunityHappenings, claimedIds),
      8,
    )
  }, [myCommunityEvents, myCommunityHappenings])

  useEffect(() => {
    void Promise.all([
      load(true),
      fetchSavedRail(),
      fetchRecommendationRails(),
    ])
  }, [fetchRecommendationRails, fetchSavedRail, load])

  function onRefresh() {
    setRefreshing(true)
    setPage(1)
    void Promise.all([
      load(true),
      fetchSavedRail(),
      fetchRecommendationRails(true),
    ])
  }

  function onEndReached() {
    if (!loadingMore && hasMore) {
      setLoadingMore(true)
      void load(false)
    }
  }

  function handleSaveChange(id: string, saved: boolean) {
    setSavedIds((prev) => {
      const next = new Set(prev)
      if (saved) next.add(id)
      else next.delete(id)
      return next
    })

    if (saved) {
      const event = [...events, ...savedInspiredEvents, ...myCommunityEvents, ...savedEvents]
        .find((item, index, items) => item.id === id && items.findIndex((candidate) => candidate.id === item.id) === index)
      if (!event) return
      setSavedEvents((prev) => prev.some((item) => item.id === id) ? prev : [event, ...prev].slice(0, 6))
      return
    }

    setSavedEvents((prev) => prev.filter((item) => item.id !== id))
  }

  function renderSavedRail() {
    if (savedLoading) {
      return (
        <View style={styles.savedSection}>
          <View style={styles.savedHeader}>
            <View>
              <Text style={styles.savedEyebrow}>Quick access</Text>
              <Text style={styles.savedTitle}>Saved events</Text>
            </View>
          </View>
          <FlatList
            data={[1, 2]}
            horizontal
            keyExtractor={(item) => String(item)}
            renderItem={() => (
              <View style={styles.savedSkeletonWrap}>
                <EventCardSkeleton />
              </View>
            )}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.savedRail}
          />
        </View>
      )
    }

    if (savedEvents.length === 0) return null

    return (
      <View style={styles.savedSection}>
        <View style={styles.savedHeader}>
          <View>
            <Text style={styles.savedEyebrow}>Quick access</Text>
            <Text style={styles.savedTitle}>Saved events</Text>
          </View>
          <TouchableOpacity
            style={styles.savedLink}
            activeOpacity={0.8}
            onPress={() => router.push('/(tabs)/saved')}
          >
            <Text style={styles.savedLinkText}>See all</Text>
            <Ionicons name="arrow-forward" size={14} color={Colors.brand[700]} />
          </TouchableOpacity>
        </View>
        <FlatList
          data={savedEvents}
          horizontal
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <EventCard
              event={item}
              isSaved
              variant="rail"
              onUnsave={(eventId) => handleSaveChange(eventId, false)}
              onSaveChange={handleSaveChange}
            />
          )}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.savedRail}
        />
      </View>
    )
  }

  function renderTopRails() {
    return (
      <View>
        {renderSavedRail()}
        <MixedDiscoveryRail
          title="In Your Communities"
          subtitle="Events and happenings from the communities you have joined."
          items={communityDiscoveryItems}
          savedIds={savedIds}
          onSaveChange={handleSaveChange}
          onToggleHappeningRsvp={toggleCommunityHappeningRsvp}
          onToggleHappeningReact={toggleCommunityHappeningReact}
          onOpenHappeningComments={setSelectedHappening}
        />
        <RecommendationRail
          title="Because You Saved..."
          subtitle="Fresh picks that match the events you bookmarked."
          events={savedInspiredEvents}
          savedIds={savedIds}
          onSaveChange={handleSaveChange}
        />
      </View>
    )
  }

  if (loading) {
    return <View style={styles.centered}><TicketFlipLoader size="md" /></View>
  }

  if (!user) {
    return (
      <View style={styles.centered}>
        <EmptyState icon="🔒" title="Sign in to see your feed" description="Follow organizers to see their upcoming events here." />
        <TouchableOpacity style={styles.signInBtn} onPress={() => router.push('/(auth)/login')}>
          <Text style={styles.signInBtnText}>Sign In</Text>
        </TouchableOpacity>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Following</Text>
          {following > 0 && (
            <Text style={styles.headerSub}>{following} organizer{following !== 1 ? 's' : ''}</Text>
          )}
        </View>
      </View>

      {events.length === 0 && !loading ? (
        following === 0 ? (
          <View style={styles.emptyWrap}>
            {renderTopRails()}
            <View style={styles.centered}>
              <EmptyState
                icon="🔭"
                title="No one followed yet"
                description="Follow your favourite organizers to see their upcoming events here."
              />
              <TouchableOpacity
                style={styles.exploreBtn}
                onPress={onExplore ?? (() => router.push('/(tabs)/events'))}
              >
                <Text style={styles.exploreBtnText}>🌍 Explore events</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={styles.emptyWrap}>
            {renderTopRails()}
            <EmptyState
              icon="📆"
              title="Nothing upcoming"
              description="The organizers you follow have not posted upcoming events yet."
            />
          </View>
        )
      ) : (
        <FlatList
          data={events}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListHeaderComponent={renderTopRails()}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.brand[500]} />
          }
          onEndReached={onEndReached}
          onEndReachedThreshold={0.4}
          ListFooterComponent={
            loadingMore
              ? <ActivityIndicator color={Colors.brand[500]} style={{ paddingVertical: Spacing.lg }} />
              : null
          }
          renderItem={({ item }) => (
            <EventCard event={item} isSaved={savedIds.has(item.id)} onSaveChange={handleSaveChange} />
          )}
        />
      )}

      <HappeningCommentsSheet
        visible={!!selectedHappening}
        happening={selectedHappening}
        currentUserId={user.id}
        onClose={() => setSelectedHappening(null)}
      />
    </View>
  )
}

function RecommendationRail({
  title,
  subtitle,
  events,
  savedIds,
  onSaveChange,
}: {
  title: string
  subtitle: string
  events: EventWithOrganizer[]
  savedIds: Set<string>
  onSaveChange: (id: string, saved: boolean) => void
}) {
  if (events.length === 0) return null

  return (
    <View style={styles.railSection}>
      <View style={styles.railHeader}>
        <Text style={styles.railTitle}>{title}</Text>
        <Text style={styles.railSubtitle}>{subtitle}</Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.railScroller}
      >
        {events.map((event) => (
          <EventCard
            key={event.id}
            event={event}
            isSaved={savedIds.has(event.id)}
            onSaveChange={onSaveChange}
            variant="rail"
          />
        ))}
      </ScrollView>
    </View>
  )
}

function MixedDiscoveryRail({
  title,
  subtitle,
  items,
  savedIds,
  onSaveChange,
  onToggleHappeningRsvp,
  onToggleHappeningReact,
  onOpenHappeningComments,
}: {
  title: string
  subtitle: string
  items: DiscoveryRailItem[]
  savedIds: Set<string>
  onSaveChange: (id: string, saved: boolean) => void
  onToggleHappeningRsvp: (happening: HappeningDiscoveryItem) => void
  onToggleHappeningReact: (happening: HappeningDiscoveryItem) => void
  onOpenHappeningComments?: (happening: HappeningDiscoveryItem) => void
}) {
  if (items.length === 0) return null

  return (
    <View style={styles.railSection}>
      <View style={styles.railHeader}>
        <Text style={styles.railTitle}>{title}</Text>
        <Text style={styles.railSubtitle}>{subtitle}</Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.railScroller}
      >
        {items.map((item) => (
          item.kind === 'event' ? (
            <EventCard
              key={item.id}
              event={item.event}
              isSaved={savedIds.has(item.event.id)}
              onSaveChange={onSaveChange}
              variant="rail"
            />
          ) : (
            <HappeningDiscoveryCard
              key={item.id}
              happening={item.happening}
              variant="rail"
              onToggleRsvp={onToggleHappeningRsvp}
              onToggleReact={onToggleHappeningReact}
              onOpenComments={onOpenHappeningComments}
            />
          )
        ))}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.gray[50] },
  emptyWrap: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: Spacing['2xl'] },
  header: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.md,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray[100],
  },
  headerTitle: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.gray[900] },
  headerSub: { fontSize: FontSize.sm, color: Colors.gray[400] },
  savedSection: {
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
    backgroundColor: Colors.gray[50],
  },
  savedHeader: {
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
  savedEyebrow: {
    fontSize: FontSize.xs,
    color: Colors.brand[600],
    fontWeight: FontWeight.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 2,
  },
  savedTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.gray[900] },
  savedLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.full,
    backgroundColor: Colors.brand[100],
  },
  savedLinkText: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.brand[700] },
  savedRail: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xs },
  savedSkeletonWrap: { width: 268, marginRight: Spacing.md },
  railSection: {
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.md,
  },
  railHeader: {
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
    gap: 4,
  },
  railTitle: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.gray[900],
  },
  railSubtitle: {
    fontSize: FontSize.sm,
    color: Colors.gray[500],
    lineHeight: 20,
  },
  railScroller: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xs,
  },
  railEmptyCard: {
    marginHorizontal: Spacing.lg,
    borderRadius: Radius.xl,
    padding: Spacing.lg,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.gray[200],
  },
  railEmptyTitle: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.semibold,
    color: Colors.gray[900],
    marginBottom: Spacing.xs,
  },
  railEmptyDescription: {
    fontSize: FontSize.sm,
    color: Colors.gray[500],
    lineHeight: 20,
  },
  list: { padding: Spacing.md, gap: Spacing.md, paddingBottom: Spacing['4xl'] },
  signInBtn: {
    marginTop: Spacing.lg,
    paddingHorizontal: Spacing['2xl'],
    paddingVertical: Spacing.md,
    backgroundColor: Colors.brand[500],
    borderRadius: 12,
  },
  signInBtnText: { color: Colors.white, fontSize: FontSize.base, fontWeight: FontWeight.semibold },
  exploreBtn: {
    marginTop: Spacing.lg,
    paddingHorizontal: Spacing['2xl'],
    paddingVertical: Spacing.md,
    backgroundColor: Colors.brand[500],
    borderRadius: 12,
  },
  exploreBtnText: { color: Colors.white, fontSize: FontSize.base, fontWeight: FontWeight.semibold },
})
