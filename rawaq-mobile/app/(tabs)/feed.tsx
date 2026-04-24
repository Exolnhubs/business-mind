import { useEffect, useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, FlatList,
  ActivityIndicator, RefreshControl, TouchableOpacity,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/auth-context'
import { EventCard, EventCardSkeleton } from '@/components/events/EventCard'
import { EmptyState } from '@/components/ui/EmptyState'
import { TicketFlipLoader } from '@/components/ui/TicketFlipLoader'
import { Colors, Spacing, FontSize, FontWeight, Radius } from '@/theme'
import type { Event, EventCategory, EventWithOrganizer, OrganizerProfile, Profile } from '@/types/database'
import { applyResolvedEventWindow, compareEventsByResolvedStartAt } from '@/lib/event-recurrence'

const PAGE_SIZE = 10

interface Props { onExplore?: () => void }

type FeedOrganizer = Pick<Profile, 'id' | 'display_name' | 'avatar_url'> & {
  organizer_profile: Pick<OrganizerProfile, 'business_name' | 'business_name_ar' | 'logo_url' | 'verified'> | null
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

export default function FeedScreen({ onExplore }: Props = {}) {
  const { user } = useAuth()
  const router   = useRouter()

  const [events,      setEvents]      = useState<EventWithOrganizer[]>([])
  const [savedEvents, setSavedEvents] = useState<EventWithOrganizer[]>([])
  const [savedIds,    setSavedIds]    = useState<Set<string>>(new Set())
  const [following,   setFollowing]   = useState(0)
  const [loading,     setLoading]     = useState(true)
  const [savedLoading, setSavedLoading] = useState(true)
  const [refreshing,  setRefreshing]  = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [page,        setPage]        = useState(1)
  const [hasMore,     setHasMore]     = useState(true)

  const fetchSavedRail = useCallback(async () => {
    if (!user) {
      setSavedEvents([])
      setSavedLoading(false)
      return
    }

    const { data } = await supabase
      .from('saved_events')
      .select('event_id')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(6)

    const eventIds = (data ?? []).map((saved) => saved.event_id)
    if (eventIds.length === 0) {
      setSavedEvents([])
      setSavedLoading(false)
      return
    }

    const { data: eventRows } = await supabase
      .from('events')
      .select('*')
      .in('id', eventIds)

    const hydratedEvents = await hydrateEvents((eventRows ?? []) as Event[])
    const eventById = new Map(hydratedEvents.map((event) => [event.id, event]))
    const railItems = eventIds
      .map((eventId) => eventById.get(eventId))
      .filter((event): event is EventWithOrganizer => Boolean(event))

    setSavedEvents(railItems)
    setSavedLoading(false)
  }, [user])

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
      return
    }

    const from = (currentPage - 1) * PAGE_SIZE
    const to   = from + PAGE_SIZE - 1

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

    if (newEvents.length > 0) {
      const { data: saves } = await supabase
        .from('saved_events')
        .select('event_id')
        .eq('user_id', user.id)
        .in('event_id', newEvents.map((e) => e.id))
      setSavedIds((prev) => {
        const next = reset ? new Set<string>() : new Set(prev)
        ;(saves ?? []).forEach((s) => next.add(s.event_id))
        return next
      })
    }

    setEvents(reset ? newEvents : (prev) => [...prev, ...newEvents])
    setHasMore((count ?? 0) > (from + newEvents.length))
    setPage(currentPage + 1)
    setLoading(false)
    setRefreshing(false)
    setLoadingMore(false)
  }, [user, page])

  useEffect(() => {
    void load(true)
    void fetchSavedRail()
  }, [user]) // eslint-disable-line

  function onRefresh() {
    setRefreshing(true)
    setPage(1)
    void Promise.all([load(true), fetchSavedRail()])
  }

  function onEndReached() {
    if (!loadingMore && hasMore) {
      setLoadingMore(true)
      load(false)
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
      const event = events.find((item) => item.id === id)
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
              onUnsave={(id) => handleSaveChange(id, false)}
              onSaveChange={handleSaveChange}
            />
          )}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.savedRail}
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
      {/* Header */}
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
          /* Not following anyone yet → prompt to explore */
          <View style={styles.emptyWrap}>
            {renderSavedRail()}
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
              <Text style={styles.exploreBtnText}>🌍  Explore events</Text>
            </TouchableOpacity>
            </View>
          </View>
        ) : (
          /* Following someone but no upcoming events */
          <View style={styles.emptyWrap}>
            {renderSavedRail()}
            <EmptyState
            icon="📅"
            title="Nothing upcoming"
            description="The organizers you follow haven't posted upcoming events yet."
            />
          </View>
        )
      ) : (
        <FlatList
          data={events}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListHeaderComponent={renderSavedRail()}
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
    </View>
  )
}


const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.gray[50] },
  emptyWrap: { flex: 1 },
  centered:  { flex: 1, justifyContent: 'center', alignItems: 'center', padding: Spacing['2xl'] },
  header: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.md,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray[100],
  },
  headerTitle: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.gray[900] },
  headerSub:   { fontSize: FontSize.sm, color: Colors.gray[400] },
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
  list:        { padding: Spacing.md, gap: Spacing.md, paddingBottom: Spacing['4xl'] },
  signInBtn:   { marginTop: Spacing.lg, paddingHorizontal: Spacing['2xl'], paddingVertical: Spacing.md, backgroundColor: Colors.brand[500], borderRadius: 12 },
  signInBtnText: { color: Colors.white, fontSize: FontSize.base, fontWeight: FontWeight.semibold },
  exploreBtn:  { marginTop: Spacing.lg, paddingHorizontal: Spacing['2xl'], paddingVertical: Spacing.md, backgroundColor: Colors.brand[500], borderRadius: 12 },
  exploreBtnText: { color: Colors.white, fontSize: FontSize.base, fontWeight: FontWeight.semibold },
})
