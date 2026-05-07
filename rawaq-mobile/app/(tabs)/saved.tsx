import { useEffect, useState, useCallback, useRef } from 'react'
import { View, FlatList, StyleSheet, RefreshControl } from 'react-native'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/auth-context'
import { EventCard, EventCardSkeleton } from '@/components/events/EventCard'
import { EmptyState } from '@/components/ui/EmptyState'
import { Colors, Spacing } from '@/theme'
import type { Event, EventCategory, EventWithOrganizer, OrganizerProfile, Profile } from '@/types/database'

type SavedOrganizer = Pick<Profile, 'id' | 'display_name' | 'avatar_url'> & {
  organizer_profile: Pick<OrganizerProfile, 'business_name' | 'business_name_ar' | 'logo_url' | 'verified' | 'organizer_type'> | null
}

async function hydrateEvents(rows: Event[]): Promise<EventWithOrganizer[]> {
  const organizerIds = [...new Set(rows.map((row) => row.organizer_id))]
  const categoryIds = [...new Set(rows.map((row) => row.category_id).filter((id): id is string => Boolean(id)))]

  const [{ data: organizers }, { data: organizerProfiles }, { data: categories }] = await Promise.all([
    organizerIds.length
      ? supabase.from('profiles').select('id, display_name, avatar_url').in('id', organizerIds)
      : Promise.resolve({ data: [] as Pick<Profile, 'id' | 'display_name' | 'avatar_url'>[] }),
    organizerIds.length
      ? supabase.from('organizer_profiles').select('user_id, business_name, business_name_ar, logo_url, verified, organizer_type').in('user_id', organizerIds)
      : Promise.resolve({ data: [] as Array<Pick<OrganizerProfile, 'user_id' | 'business_name' | 'business_name_ar' | 'logo_url' | 'verified' | 'organizer_type'>> }),
    categoryIds.length
      ? supabase.from('event_categories').select('id, name_en, name_ar, icon').in('id', categoryIds)
      : Promise.resolve({ data: [] as Pick<EventCategory, 'id' | 'name_en' | 'name_ar' | 'icon'>[] }),
  ])

  const organizerProfileByUserId = new Map(
    (organizerProfiles ?? []).map((entry) => [entry.user_id, entry]),
  )
  const organizerById = new Map<string, SavedOrganizer>(
    (organizers ?? []).map((organizer) => {
      const organizerProfile = organizerProfileByUserId.get(organizer.id)
      return [
        organizer.id,
        {
          ...organizer,
          organizer_profile: organizerProfile
            ? {
              business_name: organizerProfile.business_name,
              business_name_ar: organizerProfile.business_name_ar,
              logo_url: organizerProfile.logo_url,
              verified: organizerProfile.verified,
              organizer_type: organizerProfile.organizer_type,
            }
            : null,
        },
      ]
    }),
  )
  const categoryById = new Map(
    (categories ?? []).map((category) => [category.id, category]),
  )

  return rows.map((row) => ({
    ...row,
    organizer: organizerById.get(row.organizer_id) ?? {
      id: row.organizer_id,
      display_name: '',
      avatar_url: null,
      organizer_profile: null,
    },
    category: row.category_id ? categoryById.get(row.category_id) ?? null : null,
  }))
}

export default function SavedScreen() {
  const { user } = useAuth()
  const [events, setEvents]         = useState<EventWithOrganizer[]>([])
  const [loading, setLoading]       = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const hasLoadedOnce = useRef(false)

  const fetchSaved = useCallback(async () => {
    if (!user) {
      setEvents([])
      setLoading(false)
      setRefreshing(false)
      return
    }
    if (!hasLoadedOnce.current) setLoading(true)

    const { data } = await supabase
      .from('saved_events')
      .select('event_id')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    const eventIds = (data ?? []).map((saved) => saved.event_id)
    if (eventIds.length === 0) {
      setEvents([])
      hasLoadedOnce.current = true
      setLoading(false)
      setRefreshing(false)
      return
    }

    const { data: eventRows } = await supabase
      .from('events')
      .select('*')
      .in('id', eventIds)

    const hydratedEvents = await hydrateEvents((eventRows ?? []) as Event[])
    const eventById = new Map(hydratedEvents.map((event) => [event.id, event]))
    const list = eventIds
      .map((eventId) => eventById.get(eventId))
      .filter((event): event is EventWithOrganizer => Boolean(event))

    setEvents(list)
    hasLoadedOnce.current = true
    setLoading(false)
    setRefreshing(false)
  }, [user])

  useEffect(() => { fetchSaved() }, [fetchSaved])

  function onRefresh() { setRefreshing(true); fetchSaved() }

  if (loading) {
    return (
      <View style={styles.list}>
        {[1, 2, 3].map((i) => <EventCardSkeleton key={i} />)}
      </View>
    )
  }

  return (
    <FlatList
      data={events}
      keyExtractor={(e) => e.id}
      renderItem={({ item }) => <EventCard event={item} isSaved onUnsave={(id) => setEvents((prev) => prev.filter((e) => e.id !== id))} />}
      contentContainerStyle={styles.list}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.brand[500]} />}
      ListEmptyComponent={
        <EmptyState icon="🤍" title="No saved events" description="Tap the heart on any event to save it here" />
      }
    />
  )
}

const styles = StyleSheet.create({
  list: { padding: Spacing.lg, flexGrow: 1, backgroundColor: Colors.gray[50] },
})
