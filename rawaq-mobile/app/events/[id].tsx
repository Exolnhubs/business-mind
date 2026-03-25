import { useEffect, useState } from 'react'
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  ActivityIndicator, Alert, TextInput,
} from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/auth-context'
import { useLocale } from '@/contexts/locale-context'
import { Badge } from '@/components/ui/Badge'
import { CommentThread } from '@/components/comments/CommentThread'
import { formatDate, formatTime, formatCurrency } from '@/lib/utils'
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadow } from '@/theme'
import type { EventWithOrganizer, CommentWithAuthor, TicketType } from '@/types/database'

const QUICK_TIPS = [5, 10, 25, 50]

export default function EventDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { user } = useAuth()
  const { t, locale } = useLocale()
  const router = useRouter()

  const [event, setEvent]             = useState<EventWithOrganizer | null>(null)
  const [comments, setComments]       = useState<CommentWithAuthor[]>([])
  const [ticketTypes, setTicketTypes] = useState<TicketType[]>([])
  const [loading, setLoading]         = useState(true)
  const [isBooked, setIsBooked]       = useState(false)
  const [onWaitlist, setOnWaitlist]   = useState(false)
  const [bookingLoading, setBL]       = useState(false)
  // Ticket type selection
  const [selectedTypeId, setSelectedTypeId] = useState<string | null>(null)
  // Promo code
  const [promoCode, setPromoCode]     = useState('')
  const [promoResult, setPromoResult] = useState<{ valid: boolean; discount_amount?: number; final_amount?: number; promo_code_id?: string; reason?: string } | null>(null)
  const [promoLoading, setPromoLoading] = useState(false)
  // Tip
  const [tipAmount, setTipAmount]   = useState<number | null>(null)
  const [tipMsg, setTipMsg]         = useState('')
  const [tipLoading, setTipLoading] = useState(false)
  const [tipDone, setTipDone]       = useState(false)
  const [showTip, setShowTip]       = useState(false)

  useEffect(() => {
    if (!id) return
    Promise.all([
      supabase
        .from('events')
        .select(`*, gender_restriction,
          organizer:profiles!organizer_id(
            id, display_name, avatar_url,
            organizer_profile:organizer_profiles!user_id(business_name, logo_url, verified)
          ),
          category:event_categories(id, name_en, name_ar, icon)
        `)
        .eq('id', id)
        .single(),
      supabase
        .from('comments')
        .select(`*, author:profiles!user_id(id, display_name, avatar_url),
          replies:comments!parent_id(*, author:profiles!user_id(id, display_name, avatar_url))
        `)
        .eq('event_id', id)
        .is('parent_id', null)
        .eq('is_deleted', false)
        .order('created_at', { ascending: false })
        .limit(30),
      user
        ? supabase.from('bookings').select('id')
            .eq('event_id', id).eq('user_id', user.id).eq('status', 'confirmed').single()
        : Promise.resolve({ data: null }),
      user
        ? supabase.from('waitlist').select('id')
            .eq('event_id', id).eq('user_id', user.id).eq('status', 'waiting').single()
        : Promise.resolve({ data: null }),
      supabase.from('ticket_types').select('*')
        .eq('event_id', id).eq('is_active', true).order('sort_order'),
    ]).then(([{ data: ev }, { data: cmts }, { data: booking }, { data: wl }, { data: tts }]) => {
      setEvent(ev as EventWithOrganizer)
      setComments((cmts ?? []) as CommentWithAuthor[])
      setIsBooked(!!booking)
      setOnWaitlist(!!wl)
      setTicketTypes((tts ?? []) as TicketType[])
      setLoading(false)
    })
  }, [id, user])

  async function validatePromo() {
    if (!promoCode.trim() || !event) return
    setPromoLoading(true)

    const basePrice = selectedType ? selectedType.price : (event.price ?? 0)
    const code      = promoCode.toUpperCase().trim()

    const { data: codes } = await supabase
      .from('promo_codes')
      .select('*')
      .eq('code', code)
      .eq('is_active', true)
      .or(`event_id.eq.${event.id},event_id.is.null`)
      .order('event_id', { nullsFirst: false })
      .limit(2)

    const promo = codes?.find((c: { event_id: string | null }) => c.event_id === event.id)
                ?? codes?.find((c: { event_id: string | null }) => !c.event_id)

    if (!promo) {
      setPromoResult({ valid: false, reason: 'Code not found or inactive' })
      setPromoLoading(false)
      return
    }
    if (promo.expires_at && new Date(promo.expires_at) < new Date()) {
      setPromoResult({ valid: false, reason: 'This promo code has expired' })
      setPromoLoading(false)
      return
    }
    if (promo.max_uses !== null && promo.used_count >= promo.max_uses) {
      setPromoResult({ valid: false, reason: 'Usage limit reached' })
      setPromoLoading(false)
      return
    }
    if (basePrice < (promo.min_order_amount ?? 0)) {
      setPromoResult({ valid: false, reason: `Min order SAR ${promo.min_order_amount} required` })
      setPromoLoading(false)
      return
    }

    let discountAmount = 0
    if (promo.discount_type === 'percent') {
      discountAmount = Math.round(basePrice * (promo.discount_value / 100) * 100) / 100
    } else {
      discountAmount = Math.min(promo.discount_value, basePrice)
    }

    setPromoResult({
      valid:           true,
      discount_amount: discountAmount,
      final_amount:    Math.max(0, basePrice - discountAmount),
      promo_code_id:   promo.id,
    })
    setPromoLoading(false)
  }

  const selectedType = ticketTypes.find((t) => t.id === selectedTypeId) ?? null

  async function handleBooking() {
    if (!user) { router.push('/(auth)/login'); return }
    if (ticketTypes.length > 0 && !selectedTypeId) {
      Alert.alert('Select a ticket', 'Please select a ticket type to continue.')
      return
    }
    setBL(true)

    if (isBooked) {
      // Cancel via direct supabase call — fetch booking id first
      const { data: booking } = await supabase
        .from('bookings').select('id')
        .eq('event_id', id).eq('user_id', user.id).eq('status', 'confirmed').single()
      if (booking) {
        await supabase.from('bookings').update({ status: 'cancelled' }).eq('id', booking.id)
      }
      setIsBooked(false)
      setBL(false)
      return
    }

    // Call booking API — server handles profile checks, gender restriction, capacity
    try {
      const res = await fetch(`${process.env.EXPO_PUBLIC_API_URL ?? ''}/api/bookings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_id:       id,
          ticket_type_id: selectedTypeId ?? null,
          promo_code:     promoResult?.valid ? promoCode.toUpperCase() : null,
        }),
      })
      if (res.ok) {
        setIsBooked(true)
      } else {
        const json = await res.json().catch(() => ({}))
        const msg: string = json.error ?? json.message ?? 'Booking failed'
        if (msg.toLowerCase().includes('complete your profile')) {
          Alert.alert('Profile incomplete', 'Please complete your profile (name, gender, city) in the Profile tab before booking.')
        } else {
          Alert.alert('Booking failed', msg)
        }
      }
    } catch {
      Alert.alert('Error', 'Network error. Please try again.')
    }
    setBL(false)
  }

  async function handleJoinWaitlist() {
    if (!user) { router.push('/(auth)/login'); return }
    setBL(true)
    try {
      const res = await fetch(`${process.env.EXPO_PUBLIC_API_URL ?? ''}/api/waitlist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_id: id }),
      })
      if (res.ok) setOnWaitlist(true)
      else { const j = await res.json().catch(() => ({})); Alert.alert('Error', j.error ?? j.message ?? 'Failed to join waitlist') }
    } catch { Alert.alert('Error', 'Network error.') }
    setBL(false)
  }

  async function handleLeaveWaitlist() {
    setBL(true)
    try {
      await fetch(`${process.env.EXPO_PUBLIC_API_URL ?? ''}/api/waitlist?event_id=${id}`, { method: 'DELETE' })
      setOnWaitlist(false)
    } catch { /* ignore */ }
    setBL(false)
  }

  async function sendTip() {
    if (!user || !tipAmount || !event) return
    setTipLoading(true)
    await supabase.from('tips').insert({
      user_id: user.id,
      event_id: event.id,
      organizer_id: event.organizer_id,
      amount: tipAmount,
      currency: 'SAR',
      is_simulated: true,
      message: tipMsg || null,
    })
    setTipDone(true)
    setTipLoading(false)
    Alert.alert('🙏 Tip sent!', `SAR ${tipAmount} sent to the organizer.`)
    setShowTip(false)
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={Colors.brand[500]} />
      </View>
    )
  }

  if (!event) {
    return (
      <View style={styles.centered}>
        <Text style={{ color: Colors.gray[500] }}>Event not found</Text>
      </View>
    )
  }

  const spotsLeft = event.capacity ? event.capacity - event.bookings_count : null
  const isFull = spotsLeft !== null && spotsLeft <= 0
  const title = locale === 'ar' && event.title_ar ? event.title_ar : event.title

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      {/* Cover hero */}
      <View style={styles.hero}>
        <Text style={styles.heroEmoji}>{event.category?.icon ?? '📅'}</Text>
        <View style={styles.heroBadges}>
          {event.is_free && <Badge label="Free" variant="green" />}
          {event.is_family_friendly && <Badge label="Family" variant="blue" />}
          {event.is_cancelled && <Badge label="Cancelled" variant="red" />}
        </View>
      </View>

      <View style={styles.body}>
        {/* Title */}
        <Text style={styles.title}>{title}</Text>
        {event.category && (
          <Text style={styles.categoryLabel}>
            {event.category.icon} {locale === 'ar' ? event.category.name_ar : event.category.name_en}
          </Text>
        )}

        {/* Info cards */}
        <View style={styles.infoGrid}>
          <InfoBlock icon="📅" label="Date & Time">
            <Text style={styles.infoValue}>{formatDate(event.start_at, locale)}</Text>
            <Text style={styles.infoSub}>{formatTime(event.start_at)}{event.end_at ? ` – ${formatTime(event.end_at)}` : ''}</Text>
          </InfoBlock>
          <InfoBlock icon="📍" label="Location">
            <Text style={styles.infoValue}>{event.venue_name ?? 'TBA'}</Text>
            <Text style={styles.infoSub}>{event.city}, {event.country}</Text>
          </InfoBlock>
          <InfoBlock icon="👥" label="Attendees">
            <Text style={styles.infoValue}>{event.bookings_count} attending</Text>
            {spotsLeft !== null && (
              <Text style={styles.infoSub}>{isFull ? 'Fully booked' : `${spotsLeft} spots left`}</Text>
            )}
          </InfoBlock>
          <InfoBlock icon="💰" label="Price">
            <Text style={styles.infoValue}>
              {event.is_free ? 'Free' : formatCurrency(event.price ?? 0, locale)}
            </Text>
          </InfoBlock>
        </View>

        {/* Description */}
        {event.description && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>About</Text>
            <Text style={styles.description}>{event.description}</Text>
          </View>
        )}

        {/* Organizer */}
        <TouchableOpacity
          style={[styles.section, styles.orgCard]}
          activeOpacity={0.7}
          onPress={() => router.push(`/organizer/${event.organizer_id}`)}
        >
          <View style={styles.orgAvatar}>
            <Text style={{ fontSize: 22, fontWeight: FontWeight.bold, color: Colors.brand[700] }}>
              {(event.organizer?.organizer_profile?.business_name ?? event.organizer?.display_name ?? '?')[0].toUpperCase()}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Text style={styles.orgName}>
                {event.organizer?.organizer_profile?.business_name ?? event.organizer?.display_name}
              </Text>
              {event.organizer?.organizer_profile?.verified && <Text>✅</Text>}
            </View>
            <Text style={styles.orgSub}>Event Organizer · View profile →</Text>
          </View>
        </TouchableOpacity>

        {/* Booking CTA */}
        {!event.is_cancelled && (
          <View style={styles.bookingSection}>
            {isBooked ? (
              <TouchableOpacity
                style={[styles.bookBtn, styles.bookBtnOutline]}
                onPress={handleBooking} disabled={bookingLoading}
              >
                {bookingLoading
                  ? <ActivityIndicator color={Colors.brand[500]} />
                  : <Text style={[styles.bookBtnText, { color: Colors.gray[700] }]}>✓ Cancel Booking</Text>}
              </TouchableOpacity>
            ) : isFull ? (
              onWaitlist ? (
                <View style={styles.waitlistRow}>
                  <View style={styles.waitlistBadge}>
                    <Text style={styles.waitlistBadgeText}>⏳ You're on the waitlist</Text>
                  </View>
                  <TouchableOpacity onPress={handleLeaveWaitlist} disabled={bookingLoading} style={styles.leaveWlBtn}>
                    <Text style={styles.leaveWlText}>{bookingLoading ? '…' : 'Leave'}</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  style={[styles.bookBtn, styles.bookBtnAmber]}
                  onPress={handleJoinWaitlist} disabled={bookingLoading}
                >
                  {bookingLoading
                    ? <ActivityIndicator color={Colors.white} />
                    : <Text style={styles.bookBtnText}>⏳ Join Waitlist</Text>}
                </TouchableOpacity>
              )
            ) : (
              <>
                {/* Ticket type selector */}
                {ticketTypes.length > 0 && (
                  <View style={styles.ticketSection}>
                    <Text style={styles.ticketSectionLabel}>Select ticket</Text>
                    {ticketTypes.map((tt) => {
                      const now = new Date()
                      const soldOut = tt.capacity !== null && tt.sold_count >= tt.capacity
                      const saleEnded = tt.sale_ends_at ? new Date(tt.sale_ends_at) < now : false
                      const notStarted = tt.sale_starts_at ? new Date(tt.sale_starts_at) > now : false
                      const unavailable = soldOut || saleEnded || notStarted
                      const spotsLeft2 = tt.capacity !== null ? tt.capacity - tt.sold_count : null
                      return (
                        <TouchableOpacity
                          key={tt.id}
                          disabled={unavailable}
                          onPress={() => { setSelectedTypeId(tt.id); setPromoResult(null); setPromoCode('') }}
                          style={[
                            styles.ticketCard,
                            selectedTypeId === tt.id && styles.ticketCardSelected,
                            unavailable && styles.ticketCardDisabled,
                          ]}
                        >
                          <View style={styles.ticketCardRow}>
                            <View style={{ flex: 1 }}>
                              <Text style={[styles.ticketName, unavailable && { color: Colors.gray[400] }]}>{tt.name}</Text>
                              {tt.description ? <Text style={styles.ticketDesc} numberOfLines={1}>{tt.description}</Text> : null}
                              {spotsLeft2 !== null && spotsLeft2 <= 10 && !soldOut && (
                                <Text style={styles.ticketLow}>Only {spotsLeft2} left!</Text>
                              )}
                              {soldOut && <Text style={styles.ticketUnavail}>Sold out</Text>}
                              {saleEnded && <Text style={styles.ticketUnavail}>Sales ended</Text>}
                              {notStarted && <Text style={styles.ticketUnavail}>Coming soon</Text>}
                            </View>
                            <Text style={[styles.ticketPrice, unavailable && { color: Colors.gray[400] }]}>
                              {tt.is_free ? 'Free' : formatCurrency(tt.price, tt.currency)}
                            </Text>
                          </View>
                          {selectedTypeId === tt.id && (
                            <Text style={styles.ticketSelected}>✓ Selected</Text>
                          )}
                        </TouchableOpacity>
                      )
                    })}
                  </View>
                )}

                {/* Promo code */}
                {(selectedType ? !selectedType.is_free && selectedType.price > 0 : !event.is_free && (event.price ?? 0) > 0) && (
                  <View style={styles.promoSection}>
                    <View style={styles.promoRow}>
                      <TextInput
                        value={promoCode}
                        onChangeText={(v) => { setPromoCode(v.toUpperCase()); setPromoResult(null) }}
                        placeholder="Promo code"
                        placeholderTextColor={Colors.gray[400]}
                        autoCapitalize="characters"
                        maxLength={32}
                        style={styles.promoInput}
                      />
                      <TouchableOpacity
                        onPress={promoResult?.valid ? () => { setPromoCode(''); setPromoResult(null) } : validatePromo}
                        disabled={promoLoading || (!promoResult?.valid && !promoCode.trim())}
                        style={[styles.promoBtn, (promoLoading || (!promoResult?.valid && !promoCode.trim())) && styles.promoBtnDisabled]}
                      >
                        <Text style={styles.promoBtnText}>{promoLoading ? '…' : promoResult?.valid ? 'Clear' : 'Apply'}</Text>
                      </TouchableOpacity>
                    </View>
                    {promoResult && (
                      <Text style={[styles.promoMsg, promoResult.valid ? styles.promoMsgOk : styles.promoMsgErr]}>
                        {promoResult.valid
                          ? `✓ Discount applied — you pay SAR ${promoResult.final_amount}`
                          : `✗ ${promoResult.reason}`}
                      </Text>
                    )}
                  </View>
                )}

                {/* Book button */}
                <TouchableOpacity
                  style={[styles.bookBtn, (bookingLoading || (ticketTypes.length > 0 && !selectedTypeId)) && styles.bookBtnGray]}
                  onPress={handleBooking}
                  disabled={bookingLoading || (ticketTypes.length > 0 && !selectedTypeId)}
                  activeOpacity={0.85}
                >
                  {bookingLoading
                    ? <ActivityIndicator color={Colors.white} />
                    : (
                      <Text style={styles.bookBtnText}>
                        {(() => {
                          const basePrice = selectedType ? selectedType.price : (event.price ?? 0)
                          const disc = promoResult?.valid ? (promoResult.discount_amount ?? 0) : 0
                          const finalP = Math.max(0, basePrice - disc)
                          const free = selectedType ? selectedType.is_free || finalP === 0 : event.is_free || finalP === 0
                          return free
                            ? 'Join Event — Free'
                            : `Book Now — ${formatCurrency(finalP, event.currency ?? 'SAR')}`
                        })()}
                      </Text>
                    )
                  }
                </TouchableOpacity>
              </>
            )}
          </View>
        )}

        {/* Tip organizer */}
        {isBooked && !tipDone && (
          <TouchableOpacity style={styles.tipToggle} onPress={() => setShowTip((v) => !v)}>
            <Text style={styles.tipToggleText}>💝 {showTip ? 'Hide' : 'Tip Organizer'}</Text>
          </TouchableOpacity>
        )}

        {showTip && !tipDone && (
          <View style={styles.tipPanel}>
            <Text style={styles.sectionTitle}>Tip Amount (SAR)</Text>
            <View style={styles.quickTips}>
              {QUICK_TIPS.map((a) => (
                <TouchableOpacity
                  key={a}
                  onPress={() => setTipAmount(a)}
                  style={[styles.tipChip, tipAmount === a && styles.tipChipActive]}
                >
                  <Text style={[styles.tipChipText, tipAmount === a && styles.tipChipTextActive]}>{a}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput
              style={styles.tipInput}
              placeholder="Custom amount"
              placeholderTextColor={Colors.gray[400]}
              keyboardType="numeric"
              value={tipAmount?.toString() ?? ''}
              onChangeText={(v) => setTipAmount(v ? Number(v) : null)}
            />
            <TextInput
              style={styles.tipInput}
              placeholder="Message (optional)"
              placeholderTextColor={Colors.gray[400]}
              value={tipMsg}
              onChangeText={setTipMsg}
              maxLength={200}
            />
            <TouchableOpacity
              style={[styles.bookBtn, (!tipAmount || tipLoading) && styles.bookBtnGray]}
              onPress={sendTip}
              disabled={!tipAmount || tipLoading}
            >
              {tipLoading
                ? <ActivityIndicator color={Colors.white} />
                : <Text style={styles.bookBtnText}>Send {tipAmount ? `SAR ${tipAmount}` : ''} Tip</Text>
              }
            </TouchableOpacity>
            <Text style={styles.tipDisclaimer}>Simulated tip — no real payment</Text>
          </View>
        )}

        {/* Comments */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            Comments ({comments.length})
          </Text>
          <CommentThread
            eventId={event.id}
            initialComments={comments}
            currentUserId={user?.id ?? null}
          />
        </View>
      </View>
    </ScrollView>
  )
}

function InfoBlock({ icon, label, children }: { icon: string; label: string; children: React.ReactNode }) {
  return (
    <View style={infoStyles.block}>
      <Text style={infoStyles.icon}>{icon}</Text>
      <Text style={infoStyles.label}>{label}</Text>
      {children}
    </View>
  )
}

const infoStyles = StyleSheet.create({
  block: { flex: 1, minWidth: '46%', backgroundColor: Colors.white, borderRadius: Radius.md, padding: Spacing.md, ...Shadow.card },
  icon: { fontSize: 20, marginBottom: 4 },
  label: { fontSize: FontSize.xs, color: Colors.gray[400], textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 },
})

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.gray[50] },
  content: { paddingBottom: Spacing['4xl'] },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  hero: { height: 180, backgroundColor: Colors.brand[100], justifyContent: 'center', alignItems: 'center', position: 'relative' },
  heroEmoji: { fontSize: 72 },
  heroBadges: { position: 'absolute', bottom: Spacing.md, left: Spacing.md, flexDirection: 'row', gap: Spacing.xs },
  body: { padding: Spacing.lg },
  title: { fontSize: FontSize['2xl'], fontWeight: FontWeight.bold, color: Colors.gray[900], marginBottom: Spacing.xs },
  categoryLabel: { fontSize: FontSize.sm, color: Colors.brand[600], fontWeight: FontWeight.medium, marginBottom: Spacing.lg },
  infoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.xl },
  infoValue: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.gray[900] },
  infoSub: { fontSize: FontSize.xs, color: Colors.gray[500], marginTop: 2 },
  section: { marginBottom: Spacing.xl },
  sectionTitle: { fontSize: FontSize.base, fontWeight: FontWeight.semibold, color: Colors.gray[900], marginBottom: Spacing.sm },
  description: { fontSize: FontSize.base, color: Colors.gray[600], lineHeight: 22 },
  orgCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, backgroundColor: Colors.white, borderRadius: Radius.lg, padding: Spacing.md, ...Shadow.card },
  orgAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.brand[100], justifyContent: 'center', alignItems: 'center' },
  orgName: { fontSize: FontSize.base, fontWeight: FontWeight.semibold, color: Colors.gray[900] },
  orgSub: { fontSize: FontSize.xs, color: Colors.gray[500] },
  bookBtn: { backgroundColor: Colors.brand[500], borderRadius: Radius.lg, paddingVertical: Spacing.md + 4, alignItems: 'center', marginBottom: Spacing.sm },
  bookBtnGray: { backgroundColor: Colors.gray[300] },
  bookBtnOutline: { backgroundColor: Colors.white, borderWidth: 1.5, borderColor: Colors.gray[300] },
  bookBtnAmber: { backgroundColor: '#f59e0b' },
  bookBtnText: { color: Colors.white, fontWeight: FontWeight.semibold, fontSize: FontSize.base },
  bookingSection: { marginBottom: Spacing.sm, gap: Spacing.sm },
  // Waitlist
  waitlistRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  waitlistBadge: { flex: 1, backgroundColor: '#fefce8', borderRadius: Radius.lg, paddingVertical: 12, paddingHorizontal: 16, borderWidth: 1, borderColor: '#fde68a' },
  waitlistBadgeText: { color: '#92400e', fontWeight: FontWeight.medium, fontSize: FontSize.sm },
  leaveWlBtn: { paddingVertical: 12, paddingHorizontal: 14, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.white },
  leaveWlText: { fontSize: FontSize.sm, color: Colors.gray[600] },
  // Ticket types
  ticketSection: { gap: Spacing.xs },
  ticketSectionLabel: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, color: Colors.gray[400], textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 },
  ticketCard: { borderWidth: 1.5, borderColor: Colors.gray[200], borderRadius: Radius.lg, padding: Spacing.sm + 2 },
  ticketCardSelected: { borderColor: Colors.brand[500], backgroundColor: '#eff6ff' },
  ticketCardDisabled: { opacity: 0.55 },
  ticketCardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  ticketName: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.gray[900] },
  ticketDesc: { fontSize: FontSize.xs, color: Colors.gray[500], marginTop: 1 },
  ticketLow: { fontSize: FontSize.xs, color: '#d97706', fontWeight: FontWeight.medium, marginTop: 2 },
  ticketUnavail: { fontSize: FontSize.xs, color: Colors.gray[400], marginTop: 2 },
  ticketPrice: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.brand[700] },
  ticketSelected: { fontSize: FontSize.xs, color: Colors.brand[600], fontWeight: FontWeight.medium, marginTop: 4 },
  // Promo code
  promoSection: { gap: 4 },
  promoRow: { flexDirection: 'row', gap: Spacing.sm },
  promoInput: { flex: 1, borderWidth: 1, borderColor: Colors.gray[200], borderRadius: Radius.md, paddingHorizontal: 12, paddingVertical: 10, fontSize: FontSize.sm, color: Colors.gray[900], fontFamily: 'monospace' },
  promoBtn: { paddingHorizontal: 14, paddingVertical: 10, backgroundColor: Colors.gray[100], borderRadius: Radius.md },
  promoBtnDisabled: { opacity: 0.5 },
  promoBtnText: { fontSize: FontSize.sm, fontWeight: FontWeight.medium, color: Colors.gray[700] },
  promoMsg: { fontSize: FontSize.xs, fontWeight: FontWeight.medium },
  promoMsgOk: { color: '#16a34a' },
  promoMsgErr: { color: '#dc2626' },
  tipToggle: { alignItems: 'center', marginBottom: Spacing.lg },
  tipToggleText: { color: Colors.brand[600], fontWeight: FontWeight.medium, fontSize: FontSize.sm },
  tipPanel: { backgroundColor: Colors.white, borderRadius: Radius.lg, padding: Spacing.lg, marginBottom: Spacing.xl, ...Shadow.card },
  quickTips: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.md },
  tipChip: { flex: 1, paddingVertical: Spacing.sm, borderRadius: Radius.md, borderWidth: 1.5, borderColor: Colors.gray[200], alignItems: 'center' },
  tipChipActive: { borderColor: Colors.brand[500], backgroundColor: Colors.brand[50] },
  tipChipText: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.gray[600] },
  tipChipTextActive: { color: Colors.brand[600] },
  tipInput: { borderWidth: 1, borderColor: Colors.gray[200], borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 2, fontSize: FontSize.base, color: Colors.gray[900], marginBottom: Spacing.sm },
  tipDisclaimer: { fontSize: FontSize.xs, color: Colors.gray[400], textAlign: 'center', marginTop: Spacing.sm },
})
