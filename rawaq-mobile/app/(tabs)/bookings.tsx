import { useEffect, useState, useCallback } from 'react'
import {
  View, Text, FlatList, StyleSheet,
  TouchableOpacity, RefreshControl, Alert, Modal,
  KeyboardAvoidingView, Platform, TextInput, ActivityIndicator,
} from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '@/lib/supabase'
import { apiPost } from '@/lib/api'
import { useAuth } from '@/contexts/auth-context'
import { useLocale } from '@/contexts/locale-context'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { Spinner } from '@/components/ui/Spinner'
import { formatDate } from '@/lib/utils'
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadow } from '@/theme'
import type { Booking, Event } from '@/types/database'

type BookingListRow = Pick<
  Booking,
  'id' | 'status' | 'ticket_id' | 'seat' | 'scanned_at' | 'created_at' | 'updated_at' | 'user_id' | 'event_id' | 'notes'
> & {
  occurrence: {
    starts_at: string
    ends_at: string | null
  } | null
  event: Pick<Event, 'id' | 'title' | 'title_ar' | 'start_at' | 'end_at' | 'event_frequency' | 'cover_image_url' | 'city' | 'is_free' | 'price' | 'is_cancelled'> | null
}

type BookingListItem =
  | { type: 'header'; id: string; label: string }
  | { type: 'item'; id: string; booking: BookingListRow }

function getBookingStartAt(booking: BookingListRow) {
  return booking.occurrence?.starts_at ?? booking.event?.start_at ?? null
}

export default function BookingsScreen() {
  const { user } = useAuth()
  const { t, locale } = useLocale()
  const router = useRouter()
  const { refundBookingId } = useLocalSearchParams<{ refundBookingId?: string }>()
  const [bookings,    setBookings]    = useState<BookingListRow[]>([])
  const [loading,     setLoading]     = useState(true)
  const [refreshing,  setRefreshing]  = useState(false)

  // Refund modal state
  const [refundTarget, setRefundTarget] = useState<BookingListRow | null>(null)
  const [userNote,     setUserNote]     = useState('')
  const [submitting,   setSubmitting]   = useState(false)

  const loadBookings = useCallback(async () => {
    if (!user) { setLoading(false); return }
    const { data } = await supabase
      .from('bookings')
      .select(`id, status, ticket_id, seat, scanned_at, created_at, updated_at, user_id, event_id, notes, occurrence:event_occurrences!occurrence_id(starts_at, ends_at), event:events!event_id(id, title, title_ar, start_at, end_at, event_frequency, cover_image_url, city, is_free, price, is_cancelled)`)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
    const nextBookings = (data ?? []) as unknown as BookingListRow[]
    setBookings(nextBookings)
    setLoading(false)
    setRefreshing(false)
  }, [user])

  useEffect(() => { loadBookings() }, [loadBookings])

  useEffect(() => {
    if (!refundBookingId || bookings.length === 0) return

    const target = bookings.find((booking) => booking.id === refundBookingId) ?? null
    if (target && canRefundBooking(target)) {
      openRefundModal(target)
    } else {
      Alert.alert('Manage booking', 'This booking cannot be cancelled or refunded from here right now.')
    }

    router.replace('/(tabs)/bookings' as any)
  }, [bookings, refundBookingId, router])

  function openRefundModal(b: BookingListRow) {
    setUserNote('')
    setRefundTarget(b)
  }

  async function submitRefund() {
    if (!refundTarget) return
    setSubmitting(true)

    const { data, error } = await apiPost(`/api/bookings/${refundTarget.id}/refund`, {
      user_note: userNote.trim() || undefined,
    })

    setSubmitting(false)
    setRefundTarget(null)
    setUserNote('')

    if (error) {
      Alert.alert('Error', error)
      return
    }

    const autoRefunded = (data as any)?.auto_refunded === true
    Alert.alert(
      'Ticket cancelled',
      autoRefunded
        ? 'Your ticket has been cancelled and the refund has been sent to your original payment method. It may take 3-5 business days to appear.'
        : 'Your ticket has been cancelled. The refund is being reviewed and will be processed within 1-3 business days.',
    )
    loadBookings()
  }

  if (!user) {
    return (
      <View style={styles.container}>
        <EmptyState icon="🔐" title={t('bookings.sign_in')} />
      </View>
    )
  }

  if (loading) return <Spinner fullScreen />

  const upcoming = bookings.filter((b) => {
    const startAt = getBookingStartAt(b)
    return b.status === 'confirmed' && !!b.event && !!startAt && new Date(startAt) > new Date()
  })
  const past = bookings.filter((b) => {
    const startAt = getBookingStartAt(b)
    return !!b.event && !!startAt && new Date(startAt) <= new Date()
  })

  const all: BookingListItem[] = []
  if (upcoming.length) {
    all.push({ type: 'header', id: 'h1', label: `${t('bookings.upcoming')} (${upcoming.length})` })
    all.push(...upcoming.map((booking): BookingListItem => ({ type: 'item', id: booking.id, booking })))
  }
  if (past.length) {
    all.push({ type: 'header', id: 'h2', label: `${t('bookings.past')} (${past.length})` })
    all.push(...past.map((booking): BookingListItem => ({ type: 'item', id: booking.id, booking })))
  }

  return (
    <>
      <FlatList
        style={styles.container}
        data={all}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadBookings() }} tintColor={Colors.brand[500]} />}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <TouchableOpacity
            style={styles.chatCard}
            activeOpacity={0.8}
            onPress={() => router.push('/(tabs)/chat')}
          >
            <View style={styles.chatIconWrap}>
              <Ionicons name="chatbubbles" size={22} color={Colors.brand[600]} />
            </View>
            <View style={styles.chatBody}>
              <Text style={styles.chatTitle}>Chat with us</Text>
              <Text style={styles.chatSubtitle}>Questions about your booking? We're here.</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={Colors.gray[400]} />
          </TouchableOpacity>
        }
        ListEmptyComponent={<EmptyState icon="🎟️" title={t('bookings.empty')} description={t('bookings.join_hint')} />}
        renderItem={({ item }) => {
          if (item.type === 'header') {
            return <Text style={styles.sectionHeader}>{item.label}</Text>
          }
          const b = item.booking
          const title = locale === 'ar' && b.event?.title_ar ? b.event.title_ar : b.event?.title ?? 'Event'
          const isActive     = b.status === 'confirmed' && !b.event?.is_cancelled
          const canRefund    = canRefundBooking(b)
          const startAt = getBookingStartAt(b)

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
                  {b.event && startAt ? `${formatDate(startAt, locale)} · ${b.event.city}` : ''}
                </Text>
                {isActive && b.ticket_id && (
                  <TouchableOpacity
                    style={styles.ticketBtn}
                    onPress={() => router.push(`/bookings/${b.id}/ticket`)}
                    hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                  >
                    <Text style={styles.ticketBtnText}>🎟️ {t('ticket.view_ticket')}</Text>
                  </TouchableOpacity>
                )}
                {canRefund && (
                  <TouchableOpacity
                    style={styles.refundBtn}
                    onPress={() => openRefundModal(b)}
                    hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                  >
                    <Text style={styles.refundBtnText}>↩️ Cancel & Refund</Text>
                  </TouchableOpacity>
                )}
              </View>
              <Badge
                label={b.event?.is_cancelled || b.status === 'cancelled' ? t('bookings.cancelled') : t('bookings.confirmed')}
                variant={b.event?.is_cancelled || b.status === 'cancelled' ? 'red' : 'green'}
              />
            </TouchableOpacity>
          )
        }}
      />

      {/* Refund confirmation modal */}
      <Modal
        visible={!!refundTarget}
        animationType="slide"
        transparent
        onRequestClose={() => setRefundTarget(null)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Cancel & Request Refund</Text>
            <Text style={styles.modalSub}>
              Your ticket for{' '}
              <Text style={{ fontWeight: FontWeight.semibold }}>
                {refundTarget?.event?.title ?? 'this event'}
              </Text>{' '}
              will be cancelled and a refund will be submitted for review.
            </Text>

            <Text style={styles.inputLabel}>Reason for cancellation (optional)</Text>
            <TextInput
              style={[styles.input, { height: 80, textAlignVertical: 'top' }]}
              value={userNote}
              onChangeText={setUserNote}
              placeholder="e.g. Change of plans, unable to attend…"
              placeholderTextColor={Colors.gray[400]}
              multiline
            />

            <View style={styles.modalNote}>
              <Text style={styles.modalNoteText}>
                Refunds are reviewed within 1-3 business days. Your ticket will be released immediately for others.
              </Text>
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.confirmBtn, submitting && styles.confirmBtnDisabled]}
                onPress={submitRefund}
                disabled={submitting}
              >
                {submitting
                  ? <ActivityIndicator color={Colors.white} />
                  : <Text style={styles.confirmBtnText}>Confirm Cancellation</Text>
                }
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setRefundTarget(null)}
              >
                <Text style={styles.cancelBtnText}>Keep My Ticket</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  )
}

function canRefundBooking(booking: BookingListRow) {
  const isActive = booking.status === 'confirmed' && !booking.event?.is_cancelled
  const isPaid = !booking.event?.is_free && (booking.event?.price ?? 0) > 0
  const startAt = getBookingStartAt(booking)
  const isUpcoming = !!startAt && new Date(startAt) > new Date()
  return isActive && isPaid && isUpcoming
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
  ticketBtn: {
    marginTop: 6, alignSelf: 'flex-start',
    borderWidth: 1, borderColor: Colors.brand[300],
    borderRadius: Radius.md, paddingHorizontal: Spacing.sm, paddingVertical: 3,
  },
  ticketBtnText: { fontSize: FontSize.xs, color: Colors.brand[600], fontWeight: FontWeight.semibold },
  refundBtn: {
    marginTop: 4, alignSelf: 'flex-start',
    borderWidth: 1, borderColor: '#fca5a5',
    borderRadius: Radius.md, paddingHorizontal: Spacing.sm, paddingVertical: 3,
  },
  refundBtnText: { fontSize: FontSize.xs, color: '#dc2626', fontWeight: FontWeight.semibold },

  // Chat card
  chatCard: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: Colors.brand[50], borderRadius: Radius.lg,
    padding: Spacing.md, marginBottom: Spacing.xl,
    borderWidth: 1, borderColor: Colors.brand[100],
  },
  chatIconWrap: {
    width: 44, height: 44, borderRadius: Radius.md,
    backgroundColor: Colors.brand[100], justifyContent: 'center', alignItems: 'center',
  },
  chatBody: { flex: 1, minWidth: 0 },
  chatTitle: { fontSize: FontSize.base, fontWeight: FontWeight.semibold, color: Colors.brand[700] },
  chatSubtitle: { fontSize: FontSize.xs, color: Colors.brand[500], marginTop: 2 },

  // Modal
  modalOverlay:  { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  modalSheet:    { backgroundColor: Colors.white, borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl, padding: Spacing['2xl'], paddingBottom: Spacing['4xl'] },
  modalTitle:    { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.gray[900], marginBottom: 6 },
  modalSub:      { fontSize: FontSize.sm, color: Colors.gray[600], marginBottom: Spacing.xl, lineHeight: 20 },
  inputLabel:    { fontSize: FontSize.sm, fontWeight: FontWeight.medium, color: Colors.gray[700], marginBottom: 6 },
  input:         { borderWidth: 1, borderColor: Colors.gray[200], borderRadius: Radius.lg, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, fontSize: FontSize.base, color: Colors.gray[900], marginBottom: Spacing.lg },
  modalNote:     { backgroundColor: Colors.gray[50], borderRadius: Radius.md, padding: Spacing.md, marginBottom: Spacing.xl },
  modalNoteText: { fontSize: FontSize.xs, color: Colors.gray[500], lineHeight: 18 },
  modalActions:  { gap: Spacing.sm },
  confirmBtn:         { backgroundColor: '#dc2626', borderRadius: Radius.lg, paddingVertical: Spacing.md, alignItems: 'center' },
  confirmBtnDisabled: { opacity: 0.5 },
  confirmBtnText:     { color: Colors.white, fontWeight: FontWeight.semibold, fontSize: FontSize.base },
  cancelBtn:          { borderWidth: 1, borderColor: Colors.gray[200], borderRadius: Radius.lg, paddingVertical: Spacing.md, alignItems: 'center' },
  cancelBtnText:      { color: Colors.gray[600], fontWeight: FontWeight.medium, fontSize: FontSize.base },
})
