import { useEffect, useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, FlatList,
  ActivityIndicator, RefreshControl, TouchableOpacity,
} from 'react-native'
import { useRouter } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/auth-context'
import { EventCard } from '@/components/events/EventCard'
import { EmptyState } from '@/components/ui/EmptyState'
import { Colors, Spacing, FontSize, FontWeight } from '@/theme'
import type { EventWithOrganizer } from '@/types/database'

const PAGE_SIZE = 10

export default function FeedScreen() {
  const { user } = useAuth()
  const router   = useRouter()

  const [events,      setEvents]      = useState<EventWithOrganizer[]>([])
  const [savedIds,    setSavedIds]    = useState<Set<string>>(new Set())
  const [following,   setFollowing]   = useState(0)
  const [loading,     setLoading]     = useState(true)
  const [refreshing,  setRefreshing]  = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [page,        setPage]        = useState(1)
  const [hasMore,     setHasMore]     = useState(true)

  const load = useCallback(async (reset = false) => {
    if (!user) return
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
      .select(`
        *,
        organizer:profiles!organizer_id(
          id, display_name, avatar_url,
          organizer_profile:organizer_profiles!user_id(business_name, business_name_ar, logo_url, verified)
        ),
        category:event_categories(id, name_en, name_ar, icon)
      `, { count: 'exact' })
      .in('organizer_id', orgIds)
      .eq('is_published', true)
      .eq('is_cancelled', false)
      .gte('start_at', new Date().toISOString())
      .order('start_at', { ascending: true })
      .range(from, to)

    const newEvents = (data ?? []) as EventWithOrganizer[]

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

  useEffect(() => { load(true) }, [user]) // eslint-disable-line

  function onRefresh() {
    setRefreshing(true)
    setPage(1)
    load(true)
  }

  function onEndReached() {
    if (!loadingMore && hasMore) {
      setLoadingMore(true)
      load(false)
    }
  }

  if (loading) {
    return <View style={styles.centered}><ActivityIndicator size="large" color={Colors.brand[500]} /></View>
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
        <Text style={styles.headerTitle}>Following</Text>
        {following > 0 && (
          <Text style={styles.headerSub}>{following} organizer{following !== 1 ? 's' : ''}</Text>
        )}
      </View>

      {events.length === 0 && !loading ? (
        <EmptyState
          icon="👥"
          title="No upcoming events"
          description="The organizers you follow haven't posted upcoming events yet. Explore to find organizers to follow."
        />
      ) : (
        <FlatList
          data={events}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
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
            <EventCard event={item} isSaved={savedIds.has(item.id)} />
          )}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.gray[50] },
  centered:  { flex: 1, justifyContent: 'center', alignItems: 'center', padding: Spacing['2xl'] },
  header: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.md,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray[100],
  },
  headerTitle: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.gray[900] },
  headerSub:   { fontSize: FontSize.sm, color: Colors.gray[400] },
  list:        { padding: Spacing.md, gap: Spacing.md, paddingBottom: Spacing['4xl'] },
  signInBtn:   { marginTop: Spacing.lg, paddingHorizontal: Spacing['2xl'], paddingVertical: Spacing.md, backgroundColor: Colors.brand[500], borderRadius: 12 },
  signInBtnText: { color: Colors.white, fontSize: FontSize.base, fontWeight: FontWeight.semibold },
})
