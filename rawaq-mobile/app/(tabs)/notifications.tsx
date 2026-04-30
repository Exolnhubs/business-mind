import { useCallback, useState } from 'react'
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  RefreshControl, ActivityIndicator,
} from 'react-native'
import { useFocusEffect, useRouter } from 'expo-router'
import { useAuth } from '@/contexts/auth-context'
import { useNotifications } from '@/contexts/notification-context'
import { useLocale } from '@/contexts/locale-context'
import { supabase } from '@/lib/supabase'
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadow } from '@/theme'

type NotifPayload = Record<string, unknown>

interface Notification {
  id: string
  type: string
  payload: NotifPayload
  is_read: boolean
  created_at: string
}

function notifIcon(type: string): string {
  switch (type) {
    case 'booking_confirmed':    return '\u2705'
    case 'booking_cancelled':    return '\u274c'
    case 'event_reminder':       return '\u23f0'
    case 'comment_reply':
    case 'mention':
    case 'new_comment':          return '\ud83d\udcac'
    case 'organizer_approved':   return '\ud83c\udfe2'
    case 'organizer_rejected':
    case 'organizer_suspended':  return '\u26a0\ufe0f'
    case 'event_cancelled':      return '\ud83d\udeab'
    case 'tip_received':         return '\ud83d\udcb0'
    case 'waitlist_promoted':    return '\u2b06\ufe0f'
    case 'new_follower':         return '\ud83d\udc64'
    case 'new_review':           return '\u2b50'
    case 'new_attendee':         return '\ud83c\udf9f\ufe0f'
    case 'event_updated':        return '\ud83d\udcdd'
    case 'new_event_published':  return '\ud83c\udf89'
    case 'event_sold_out':       return '\ud83c\udf8a'
    case 'community_new_event':  return '\ud83d\uddd3\ufe0f'
    case 'community_happening':  return '\ud83d\udccd'
    default:                     return '\ud83d\udd14'
  }
}

function interpolate(template: string, values: Record<string, string>): string {
  return Object.entries(values).reduce(
    (text, [key, value]) => text.split(`{${key}}`).join(value),
    template,
  )
}

function payloadText(payload: NotifPayload, key: string, fallback: string): string {
  const value = payload[key]
  if (typeof value === 'string' || typeof value === 'number') return String(value)
  return fallback
}

function notifText(type: string, payload: NotifPayload, t: (key: string) => string): string {
  const et = payloadText(payload, 'event_title', t('notifications.fallback_event'))
  const an = payloadText(payload, 'actor_name', t('notifications.fallback_actor'))
  switch (type) {
    case 'booking_confirmed':   return interpolate(t('notifications.booking_confirmed'), { event: et })
    case 'booking_cancelled':   return interpolate(t('notifications.booking_cancelled'), { event: et })
    case 'event_reminder':      return interpolate(t('notifications.event_reminder'), { event: et, reminder: payloadText(payload, 'reminder', t('notifications.fallback_reminder')) })
    case 'comment_reply':       return interpolate(t('notifications.comment_reply'), { actor: an })
    case 'mention':             return interpolate(t('notifications.mention'), { actor: an })
    case 'organizer_approved':  return t('notifications.organizer_approved')
    case 'organizer_rejected':  return t('notifications.organizer_rejected')
    case 'organizer_suspended': return t('notifications.organizer_suspended')
    case 'event_cancelled':     return interpolate(t('notifications.event_cancelled'), { event: et })
    case 'tip_received':        return interpolate(t('notifications.tip_received'), { amount: payloadText(payload, 'amount', ''), currency: payloadText(payload, 'currency', ''), event: et })
    case 'waitlist_promoted':   return interpolate(t('notifications.waitlist_promoted'), { event: et })
    case 'new_follower':        return interpolate(t('notifications.new_follower'), { actor: an })
    case 'new_review':          return interpolate(t('notifications.new_review'), { actor: an, rating: payloadText(payload, 'rating', '') })
    case 'new_attendee':        return interpolate(t('notifications.new_attendee'), { actor: an, event: et })
    case 'new_comment':         return interpolate(t('notifications.new_comment'), { actor: an, event: et })
    case 'event_updated':       return interpolate(t('notifications.event_updated'), { event: et })
    case 'new_event_published': return interpolate(t('notifications.new_event_published'), { organizer: payloadText(payload, 'organizer_name', t('notifications.fallback_organizer')), event: et })
    case 'event_sold_out':      return interpolate(t('notifications.event_sold_out'), { event: et })
    case 'community_new_event':  return interpolate(t('notifications.community_new_event'), { community: payloadText(payload, 'community_name', t('notifications.fallback_community')), event: et })
    case 'community_happening':  return interpolate(t('notifications.community_happening'), { community: payloadText(payload, 'community_name', t('notifications.fallback_community_name')), body: payloadText(payload, 'body', t('notifications.fallback_body')) })
    default:                     return t('notifications.new')
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

function relativeTime(dateStr: string, locale: string, t: (key: string) => string): string {
  const mins = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000)
  if (mins < 1) return t('notifications.time.just_now')
  if (mins < 60) return interpolate(t('notifications.time.minutes_ago'), { count: String(mins) })
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return interpolate(t('notifications.time.hours_ago'), { count: String(hrs) })
  const days = Math.floor(hrs / 24)
  if (days < 7) return interpolate(t('notifications.time.days_ago'), { count: String(days) })
  return new Date(dateStr).toLocaleDateString(locale === 'ar' ? 'ar-EG' : 'en-US')
}

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

export default function NotificationsScreen() {
  const { user, profile } = useAuth()
  const { resetUnread } = useNotifications()
  const { t, locale, isRTL } = useLocale()
  const router = useRouter()
  const textDirStyle = isRTL ? styles.rtlText : styles.ltrText

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

  useFocusEffect(useCallback(() => { load() }, [user]))

  if (!user) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyIcon}>{'\ud83d\udd14'}</Text>
        <Text style={[styles.emptyTitle, textDirStyle]}>{t('notifications.sign_in_required')}</Text>
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
              <Text style={styles.emptyIcon}>{'\ud83d\udd14'}</Text>
              <Text style={[styles.emptyTitle, textDirStyle]}>{t('notifications.empty_title')}</Text>
              <Text style={[styles.emptySub, textDirStyle]}>{t('notifications.empty_sub')}</Text>
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
                <Text style={[styles.rowText, textDirStyle, !item.is_read && styles.rowTextBold]} numberOfLines={2}>
                  {notifText(item.type, item.payload, t)}
                </Text>
                <Text style={[styles.rowTime, textDirStyle]}>{relativeTime(item.created_at, locale, t)}</Text>
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
  rtlText: { textAlign: 'right', writingDirection: 'rtl' },
  ltrText: { textAlign: 'left', writingDirection: 'ltr' },
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
