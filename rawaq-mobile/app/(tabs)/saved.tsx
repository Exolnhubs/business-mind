import { useEffect, useState, useCallback } from 'react'
import { View, FlatList, StyleSheet, RefreshControl } from 'react-native'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/auth-context'
import { EventCard, EventCardSkeleton } from '@/components/events/EventCard'
import { EmptyState } from '@/components/ui/EmptyState'
import { Colors, Spacing } from '@/theme'
import type { EventWithOrganizer } from '@/types/database'

export default function SavedScreen() {
  const { user } = useAuth()
  const [events, setEvents]         = useState<EventWithOrganizer[]>([])
  const [loading, setLoading]       = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const fetchSaved = useCallback(async () => {
    if (!user) { setLoading(false); return }

    const { data } = await supabase
      .from('saved_events')
      .select(`
        event_id,
        event:events!event_id(
          *,
          organizer:profiles!organizer_id(
            id, display_name, avatar_url,
            organizer_profile:organizer_profiles!user_id(business_name, business_name_ar, logo_url, verified)
          ),
          category:event_categories(id, name_en, name_ar, icon)
        )
      `)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    const list = (data ?? [])
      .map((s) => s.event)
      .filter(Boolean) as EventWithOrganizer[]

    setEvents(list)
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
