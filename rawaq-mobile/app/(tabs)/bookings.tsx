import { useEffect, useState, useCallback } from 'react'
import {
  View, Text, FlatList, StyleSheet,
  TouchableOpacity, RefreshControl,
} from 'react-native'
import { useRouter } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/auth-context'
import { useLocale } from '@/contexts/locale-context'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { Spinner } from '@/components/ui/Spinner'
import { formatDate } from '@/lib/utils'
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadow } from '@/theme'
import type { BookingWithEvent } from '@/types/database'

export default function BookingsScreen() {
  const { user } = useAuth()
  const { t, locale } = useLocale()
  const router = useRouter()
  const [bookings, setBookings]     = useState<BookingWithEvent[]>([])
  const [loading, setLoading]       = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const fetch = useCallback(async () => {
    if (!user) { setLoading(false); return }
    const { data } = await supabase
      .from('bookings')
      .select(`*, event:events!event_id(id, title, title_ar, start_at, cover_image_url, city, is_free, price, is_cancelled)`)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
    setBookings((data ?? []) as BookingWithEvent[])
    setLoading(false)
    setRefreshing(false)
  }, [user])

  useEffect(() => { fetch() }, [fetch])

  if (!user) {
    return (
      <View style={styles.container}>
        <EmptyState icon="🔐" title={t('bookings.sign_in')} />
      </View>
    )
  }

  if (loading) return <Spinner fullScreen />

  const upcoming = bookings.filter(
    (b) => b.status === 'confirmed' && b.event && new Date(b.event.start_at) > new Date(),
  )
  const past = bookings.filter(
    (b) => b.event && new Date(b.event.start_at) <= new Date(),
  )

  const all = [
    ...(upcoming.length ? [{ type: 'header', id: 'h1', label: `${t('bookings.upcoming')} (${upcoming.length})` }] : []),
    ...upcoming.map((b) => ({ type: 'item', id: b.id, booking: b })),
    ...(past.length ? [{ type: 'header', id: 'h2', label: `${t('bookings.past')} (${past.length})` }] : []),
    ...past.map((b) => ({ type: 'item', id: b.id, booking: b })),
  ]

  return (
    <FlatList
      style={styles.container}
      data={all}
      keyExtractor={(item) => item.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetch() }} tintColor={Colors.brand[500]} />}
      contentContainerStyle={styles.content}
      ListEmptyComponent={<EmptyState icon="🎟️" title={t('bookings.empty')} description={t('bookings.join_hint')} />}
      renderItem={({ item }) => {
        if (item.type === 'header') {
          return <Text style={styles.sectionHeader}>{item.label}</Text>
        }
        const b = item.booking!
        const title = locale === 'ar' && b.event?.title_ar ? b.event.title_ar : b.event?.title ?? 'Event'
        return (
          <TouchableOpacity
            style={styles.card}
            activeOpacity={0.8}
            onPress={() => b.event && router.push(`/events/${b.event.id}`)}
          >
            <View style={styles.cardIcon}>
              <Text style={{ fontSize: 24 }}>📅</Text>
            </View>
            <View style={styles.cardBody}>
              <Text style={styles.cardTitle} numberOfLines={1}>{title}</Text>
              <Text style={styles.cardMeta}>
                {b.event ? `${formatDate(b.event.start_at, locale)} · ${b.event.city}` : ''}
              </Text>
            </View>
            <Badge
              label={b.event?.is_cancelled || b.status === 'cancelled' ? t('bookings.cancelled') : t('bookings.confirmed')}
              variant={b.event?.is_cancelled || b.status === 'cancelled' ? 'red' : 'green'}
            />
          </TouchableOpacity>
        )
      }}
    />
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.gray[50] },
  content: { padding: Spacing.lg },
  sectionHeader: {
    fontSize: FontSize.xs, fontWeight: FontWeight.semibold,
    color: Colors.gray[500], textTransform: 'uppercase',
    letterSpacing: 0.8, marginTop: Spacing.xl, marginBottom: Spacing.sm,
  },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: Colors.white, borderRadius: Radius.lg,
    padding: Spacing.md, marginBottom: Spacing.sm, ...Shadow.card,
  },
  cardIcon: {
    width: 44, height: 44, borderRadius: Radius.md,
    backgroundColor: Colors.brand[50], justifyContent: 'center', alignItems: 'center',
  },
  cardBody: { flex: 1, minWidth: 0 },
  cardTitle: { fontSize: FontSize.base, fontWeight: FontWeight.semibold, color: Colors.gray[900] },
  cardMeta: { fontSize: FontSize.xs, color: Colors.gray[500], marginTop: 2 },
})
