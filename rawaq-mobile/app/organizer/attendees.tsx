import { useEffect, useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl, TextInput,
} from 'react-native'
import { useRouter, useLocalSearchParams } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/auth-context'
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/theme'

interface Attendee {
  id: string
  status: 'confirmed' | 'cancelled'
  created_at: string
  user: {
    display_name: string
    avatar_url: string | null
    city: string | null
  } | null
}

export default function AttendeesScreen() {
  const router = useRouter()
  const { user } = useAuth()
  const { eventId, title } = useLocalSearchParams<{ eventId: string; title: string }>()

  const [attendees, setAttendees]   = useState<Attendee[]>([])
  const [loading, setLoading]       = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [search, setSearch]         = useState('')

  const load = useCallback(async () => {
    if (!eventId || !user) return

    // Confirm event ownership first
    const { data: event } = await supabase
      .from('events')
      .select('id')
      .eq('id', eventId)
      .eq('organizer_id', user.id)
      .single()

    if (!event) {
      router.back()
      return
    }

    const { data } = await supabase
      .from('bookings')
      .select('id, status, created_at, user:profiles!user_id(display_name, avatar_url, city)')
      .eq('event_id', eventId)
      .order('created_at', { ascending: true })

    setAttendees((data ?? []) as Attendee[])
    setLoading(false)
    setRefreshing(false)
  }, [eventId, user, router])

  useEffect(() => { load() }, [load])

  const confirmed = attendees.filter((a) => a.status === 'confirmed')
  const filtered  = search.trim()
    ? confirmed.filter((a) =>
        a.user?.display_name.toLowerCase().includes(search.toLowerCase()) ||
        a.id.slice(-8).toLowerCase().includes(search.toLowerCase())
      )
    : confirmed

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={Colors.brand[500]} />
      </View>
    )
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle} numberOfLines={1}>{decodeURIComponent(title ?? 'Attendees')}</Text>
          <Text style={styles.headerSub}>
            {confirmed.length} confirmed attendee{confirmed.length !== 1 ? 's' : ''}
          </Text>
        </View>
      </View>

      {/* Search */}
      <View style={styles.searchWrap}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name or ref…"
          placeholderTextColor={Colors.gray[400]}
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
        />
      </View>

      {filtered.length === 0 ? (
        <View style={styles.centered}>
          <Text style={{ fontSize: 36, marginBottom: 8 }}>🎟</Text>
          <Text style={styles.emptyText}>
            {search ? 'No match found.' : 'No confirmed attendees yet.'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); load() }}
              tintColor={Colors.brand[500]}
            />
          }
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          renderItem={({ item }) => (
            <View style={styles.row}>
              {/* Avatar initial */}
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {(item.user?.display_name ?? '?')[0].toUpperCase()}
                </Text>
              </View>

              {/* Info */}
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{item.user?.display_name ?? 'Unknown'}</Text>
                {item.user?.city ? (
                  <Text style={styles.city}>{item.user.city}</Text>
                ) : null}
              </View>

              {/* Booking ref */}
              <View style={styles.refBadge}>
                <Text style={styles.refText}>{item.id.slice(-8).toUpperCase()}</Text>
              </View>
            </View>
          )}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.gray[50] },
  centered:  { flex: 1, justifyContent: 'center', alignItems: 'center', padding: Spacing['2xl'] },
  emptyText: { fontSize: FontSize.sm, color: Colors.gray[400], textAlign: 'center' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.white,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray[100],
  },
  backBtn:    { padding: 4 },
  backText:   { fontSize: 22, color: Colors.gray[600] },
  headerTitle:{ fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.gray[900] },
  headerSub:  { fontSize: FontSize.xs, color: Colors.gray[500], marginTop: 2 },

  searchWrap: {
    backgroundColor: Colors.white,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray[100],
  },
  searchInput: {
    backgroundColor: Colors.gray[50],
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    fontSize: FontSize.sm,
    color: Colors.gray[900],
    borderWidth: 1,
    borderColor: Colors.gray[200],
  },

  list:      { padding: Spacing.lg },
  separator: { height: 1, backgroundColor: Colors.gray[100] },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.white,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderRadius: Radius.md,
    marginBottom: 2,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.brand[100],
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  avatarText: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.bold,
    color: Colors.brand[700],
  },
  name: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.gray[900] },
  city: { fontSize: FontSize.xs, color: Colors.gray[400], marginTop: 2 },

  refBadge: {
    backgroundColor: Colors.gray[100],
    borderRadius: Radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 4,
    flexShrink: 0,
  },
  refText: {
    fontSize: 11,
    fontFamily: 'monospace',
    color: Colors.gray[600],
    letterSpacing: 0.5,
  },
})
