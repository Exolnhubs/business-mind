import { useCallback, useState } from 'react'
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  RefreshControl, ActivityIndicator,
} from 'react-native'
import { useFocusEffect, useRouter } from 'expo-router'
import { useAuth } from '@/contexts/auth-context'
import { useNotifications } from '@/contexts/notification-context'
import { supabase } from '@/lib/supabase'
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadow } from '@/theme'

// ── Types ────────────────────────────────────────────────────────────────────

type NotifPayload = Record<string, unknown>

interface Notification {
  id: string
  type: string
  payload: NotifPayload
  is_read: boolean
  created_at: string
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function notifIcon(type: string): string {
  switch (type) {
    case 'booking_confirmed':    return '✅'
    case 'booking_cancelled':    return '❌'
    case 'event_reminder':       return '⏰'
    case 'comment_reply':
    case 'mention':
    case 'new_comment':          return '💬'
    case 'organizer_approved':   return '🏢'
    case 'organizer_rejected':
    case 'organizer_suspended':  return '⚠️'
    case 'event_cancelled':      return '🚫'
    case 'tip_received':         return '💰'
    case 'waitlist_promoted':    return '⬆️'
    case 'new_follower':         return '👤'
    case 'new_review':           return '⭐'
    case 'new_attendee':         return '🎟️'
    case 'event_updated':        return '📝'
    case 'new_event_published':  return '🎉'
    case 'event_sold_out':       return '🎊'
    case 'community_new_event':  return '🗓️'
    case 'community_happening':  return '📍'
    default:                     return '🔔'
  }
}

function notifText(type: string, payload: NotifPayload): string {
  const et = (payload.event_title as string) ?? 'an event'
  const an = (payload.actor_name  as string) ?? 'Someone'
  switch (type) {
    case 'booking_confirmed':   return `Your booking for "${et}" is confirmed`
    case 'booking_cancelled':   return `Your booking for "${et}" has been cancelled`
    case 'event_reminder':      return `"${et}" starts in ${payload.reminder ?? '1 hour'}`
    case 'comment_reply':       return `${an} replied to your comment`
    case 'mention':             return `${an} mentioned you in a comment`
    case 'organizer_approved':  return 'Your organizer account has been approved!'
    case 'organizer_rejected':  return 'Your organizer application was not approved'
    case 'organizer_suspended': return 'Your organizer account has been suspended'
    case 'event_cancelled':     return `"${et}" has been cancelled`
    case 'tip_received':        return `You received a ${payload.amount} ${payload.currency} donation for "${et}"`
    case 'waitlist_promoted':   return `You're off the waitlist for "${et}"!`
    case 'new_follower':        return `${an} started following you`
    case 'new_review':          return `${an} left you a ${payload.rating}★ review`
    case 'new_attendee':        return `${an} just booked "${et}"`
    case 'new_comment':         return `${an} commented on "${et}"`
    case 'event_updated':       return `"${et}" has been updated — check the new details`
    case 'new_event_published': return `${payload.organizer_name ?? 'An organizer'} published "${et}"`
    case 'event_sold_out':      return `Your event "${et}" just sold out! 🎊`
    case 'community_new_event':  return `New event in ${payload.community_name ?? 'your community'}: "${et}"`
    case 'community_happening':  return `${payload.community_name ?? 'Community'}: ${payload.body ?? 'Something\'s happening'}`
    default:                     return 'New notification'
  }
}

function notifRoute(type: string, payload: NotifPayload, profile: { role?: string } | null): string {
  const eventId = typeof payload.event_id === 'string' ? payload.event_id : null
  switch (type) {
    case 'booking_confirmed':
    case 'booking_cancelled':
    case 'waitlist_promoted':
    case 'event_reminder':
      return '/(tabs)/bookings'
    case 'community_new_event':
    case 'new_event_published':
    case 'event_updated':
      return eventId ? `/events/${eventId}` : '/(tabs)/home'
    case 'community_happening': {
      const communitySlug = typeof payload.community_slug === 'string' ? payload.community_slug : null
      return communitySlug ? `/communities/${communitySlug}` : '/communities'
    }
    case 'new_follower':
    case 'new_review':
    case 'organizer_approved':
    case 'organizer_rejected':
    case 'organizer_suspended':
      return '/(tabs)/profile'
    case 'tip_received':
    case 'new_attendee':
    case 'event_sold_out':
      return profile?.role === 'organizer' ? '/organizer/dashboard' : '/(tabs)/profile'
    default:
      return '/(tabs)/home'
  }
}

function relativeTime(dateStr: string): string {
  const mins = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000)
  if (mins < 1)   return 'Just now'
  if (mins < 60)  return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)   return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7)   return `${days}d ago`
  return new Date(dateStr).toLocaleDateString()
}

// ── Skeleton ─────────────────────────────────────────────────────────────────

function NotifSkeleton() {
  return (
    <View style={styles.row}>
      <View style={[styles.iconWrap, { backgroundColor: Colors.gray[100] }]} />
      <View style={{ flex: 1, gap: 6 }}>
        <View style={{ height: 13, width: '80%', backgroundColor: Colors.gray[100], borderRadius: 4 }} />
        <View style={{ height: 11, width: '50%', backgroundColor: Colors.gray[100], borderRadius: 4 }} />
      </View>
    </View>
  )
}

// ── Screen ───────────────────────────────────────────────────────────────────

export default function NotificationsScreen() {
  const { user, profile } = useAuth()
  const { resetUnread } = useNotifications()
  const router = useRouter()

  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading]             = useState(true)
  const [refreshing, setRefreshing]       = useState(false)

  async function load(isRefresh = false) {
    if (!user) return
    if (isRefresh) setRefreshing(true)
    else           setLoading(true)

    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50)

    setNotifications((data ?? []) as Notification[])

    // Mark all unread as read
    const hasUnread = (data ?? []).some((n: { is_read: boolean }) => !n.is_read)
    if (hasUnread) {
      await supabase
        .from('notifications')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq('user_id', user.id)
        .eq('is_read', false)
      resetUnread()
    }

    if (isRefresh) setRefreshing(false)
    else           setLoading(false)
  }

  // Reload every time this screen comes into focus
  useFocusEffect(useCallback(() => { load() }, [user]))

  if (!user) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyIcon}>🔔</Text>
        <Text style={styles.emptyTitle}>Sign in to see notifications</Text>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      {loading ? (
        <View style={styles.list}>
          {[1, 2, 3, 4, 5].map((i) => <NotifSkeleton key={i} />)}
        </View>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(item) => item.id}
          contentContainerStyle={notifications.length === 0 ? styles.centered : styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyIcon}>🔔</Text>
              <Text style={styles.emptyTitle}>No notifications yet</Text>
              <Text style={styles.emptySub}>We'll let you know when something happens</Text>
            </View>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.row, !item.is_read && styles.rowUnread]}
              onPress={() => router.push(notifRoute(item.type, item.payload, profile) as any)}
              activeOpacity={0.7}
            >
              <View style={styles.iconWrap}>
                <Text style={styles.iconText}>{notifIcon(item.type)}</Text>
              </View>
              <View style={styles.rowContent}>
                <Text style={[styles.rowText, !item.is_read && styles.rowTextBold]} numberOfLines={2}>
                  {notifText(item.type, item.payload)}
                </Text>
                <Text style={styles.rowTime}>{relativeTime(item.created_at)}</Text>
              </View>
              {!item.is_read && <View style={styles.unreadDot} />}
            </TouchableOpacity>
          )}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: Colors.gray[50] },
  list:         { paddingTop: Spacing.sm, paddingBottom: Spacing['4xl'] },
  centered:     { flex: 1, justifyContent: 'center', alignItems: 'center', padding: Spacing['3xl'] },
  emptyWrap:    { alignItems: 'center', paddingTop: Spacing['4xl'] },
  emptyIcon:    { fontSize: 48, marginBottom: Spacing.md },
  emptyTitle:   { fontSize: FontSize.lg, fontWeight: FontWeight.semibold, color: Colors.gray[800], textAlign: 'center' },
  emptySub:     { fontSize: FontSize.sm, color: Colors.gray[400], marginTop: Spacing.xs, textAlign: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.white,
    gap: Spacing.md,
  },
  rowUnread:    { backgroundColor: Colors.brand[50] },
  iconWrap:     { width: 42, height: 42, borderRadius: 21, backgroundColor: Colors.gray[100], justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  iconText:     { fontSize: 20 },
  rowContent:   { flex: 1 },
  rowText:      { fontSize: FontSize.sm, color: Colors.gray[700], lineHeight: 18 },
  rowTextBold:  { fontWeight: FontWeight.semibold, color: Colors.gray[900] },
  rowTime:      { fontSize: FontSize.xs, color: Colors.gray[400], marginTop: 3 },
  unreadDot:    { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.brand[500], flexShrink: 0 },
  separator:    { height: 1, backgroundColor: Colors.gray[50] },
})

