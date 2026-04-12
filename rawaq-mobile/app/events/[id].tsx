import { useEffect, useState, useCallback } from 'react'
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  ActivityIndicator, Alert, TextInput, Image, Modal, Platform, Linking,
} from 'react-native'
import * as WebBrowser from 'expo-web-browser'
import { Stack, useLocalSearchParams, useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '@/lib/supabase'
import { apiPost, apiGet } from '@/lib/api'
import { useAuth } from '@/contexts/auth-context'
import { useLocale } from '@/contexts/locale-context'
import { Badge } from '@/components/ui/Badge'
import { CommentThread } from '@/components/comments/CommentThread'
import { formatDate, formatTime, formatCurrency } from '@/lib/utils'
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadow } from '@/theme'
import type { Community, EventWithOrganizer, CommentWithAuthor, TicketType, Waitlist, ReportReason } from '@/types/database'

interface PaymentOption {
  id: string
  gateway: string
  method: string
  label: string
  description: string
  icon: string
}

const QUICK_TIPS = [5, 10, 25, 50]
type PaymentIntent = 'booking' | 'donation' | null

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
  const [currentBookingId, setCurrentBookingId] = useState<string | null>(null)
  const [bookingPending, setBookingPending] = useState(false)
  const [onWaitlist, setOnWaitlist]   = useState(false)
  const [bookingLoading, setBL]       = useState(false)
  const [newBookingId, setNewBookingId] = useState<string | null>(null)
  const [showBookingSuccess, setShowBookingSuccess] = useState(false)
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
  // Report event
  const [showReport, setShowReport]   = useState(false)
  const [reportReason, setReportReason] = useState<ReportReason>('spam')
  const [reportDetails, setReportDetails] = useState('')
  const [reportLoading, setReportLoading] = useState(false)
  const [reportDone, setReportDone]   = useState(false)
  // Payment
  const [paymentOptions,         setPaymentOptions]         = useState<PaymentOption[]>([])
  const [selectedPaymentOptionId, setSelectedPaymentOptionId] = useState<string | null>(null)
  const [showPaymentPicker,      setShowPaymentPicker]      = useState(false)
  const [fawryRef,               setFawryRef]               = useState<string | null>(null)
  const [fawryContext,           setFawryContext]           = useState<'ticket' | 'donation'>('ticket')
  const [paymentIntent,          setPaymentIntent]          = useState<PaymentIntent>(null)
  const [eventCommunities,       setEventCommunities]       = useState<Array<Pick<Community, 'id' | 'name' | 'name_ar' | 'slug' | 'level'>>>([])

  useEffect(() => {
    if (!id) return
    Promise.all([
      supabase
        .from('events')
        .select(`*, gender_restriction,
          organizer:profiles!organizer_id(
            id, display_name, avatar_url,
            organizer_profile:organizer_profiles!user_id(business_name, business_name_ar, logo_url, verified)
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
        ? supabase.from('bookings').select('id, status')
            .eq('event_id', id).eq('user_id', user.id)
            .in('status', ['confirmed', 'pending'])
            .order('created_at', { ascending: false })
            .limit(1)
            .single()
        : Promise.resolve({ data: null }),
      user
        ? supabase.from('waitlist').select('id')
            .eq('event_id', id).eq('user_id', user.id).eq('status', 'waiting').single()
        : Promise.resolve({ data: null }),
      supabase.from('ticket_types').select('*')
        .eq('event_id', id).eq('is_active', true).order('sort_order'),
      supabase.from('event_communities').select('community_id').eq('event_id', id),
    ]).then(([{ data: ev }, { data: cmts }, { data: booking }, { data: wl }, { data: tts }, { data: eventCommunityRows }]) => {
      setEvent((ev as unknown as EventWithOrganizer | null) ?? null)
      setComments((cmts ?? []) as unknown as CommentWithAuthor[])
      setCurrentBookingId(booking?.id ?? null)
      setIsBooked(booking?.status === 'confirmed')
      setBookingPending(booking?.status === 'pending')
      setOnWaitlist(!!wl)
      setTicketTypes((tts ?? []) as TicketType[])
      const communityIds = (eventCommunityRows ?? []).map((row) => row.community_id)
      if (communityIds.length > 0) {
        supabase
          .from('communities')
          .select('id, name, name_ar, slug, level')
          .in('id', communityIds)
          .then(({ data: communities }) =>
            setEventCommunities((communities ?? []) as Array<Pick<Community, 'id' | 'name' | 'name_ar' | 'slug' | 'level'>>),
          )
      } else {
        setEventCommunities([])
      }
      setLoading(false)
    })
  }, [id, user])

  // Load payment options when event currency is known
  useEffect(() => {
    if (!event) return
    const currency = event.currency ?? 'SAR'
    apiGet<PaymentOption[]>(`/api/payments/options?currency=${encodeURIComponent(currency)}`)
      .then(({ data }) => {
        if (data && data.length > 0) {
          setPaymentOptions(data)
          setSelectedPaymentOptionId(data[0].id)
        }
      })
      .catch(() => {})
  }, [event?.currency])

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
      setPromoResult({ valid: false, reason: `Min order ${formatCurrency(promo.min_order_amount ?? 0, event.currency, locale)} required` })
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

  // Compute whether the current selection results in a paid booking
  const computeIsPaid = useCallback((): boolean => {
    if (!event) return false
    const basePrice = selectedType ? selectedType.price : (event.price ?? 0)
    const disc      = promoResult?.valid ? (promoResult.discount_amount ?? 0) : 0
    const finalP    = Math.max(0, basePrice - disc)
    const isFree    = selectedType ? selectedType.is_free || finalP === 0 : event.is_free || finalP === 0
    return !isFree && finalP > 0
  }, [event, selectedType, promoResult])

  // Initiate booking (called after payment method is chosen or for free events)
  async function initiateBooking(paymentOptionId: string) {
    setBL(true)
    setShowPaymentPicker(false)

    const promoCodeVal = promoResult?.valid ? (promoResult.promo_code_id ?? null) : null

    const { data: result, error: initErr } = await apiPost<{
      booking_id?: string
      redirect_url?: string
      fawry_reference_number?: string
      free?: boolean
    }>('/api/payments/initiate', {
      event_id:          id as string,
      ticket_type_id:    selectedTypeId ?? null,
      promo_code:        promoCodeVal,
      payment_option_id: paymentOptionId,
      source:            'mobile',
    })

    setBL(false)

    if (initErr) {
      Alert.alert('Booking failed', initErr)
      return
    }

    const data = result!

    // Free or simulated — confirmed immediately, no redirect needed
    if (data.free || !data.redirect_url) {
      setIsBooked(true)
      setNewBookingId(data.booking_id ?? null)
      setCurrentBookingId(data.booking_id ?? null)
      setShowBookingSuccess(true)
      return
    }

    // Fawry — show reference number in-app, no browser needed
    if (data.fawry_reference_number) {
      setFawryContext('ticket')
      setFawryRef(data.fawry_reference_number)
      setNewBookingId(data.booking_id ?? null)
      return
    }

    // Card / Apple Pay / Google Pay:
    // Open hosted payment page in an in-app browser session.
    // openAuthSessionAsync watches for the rawaq:// deep link — when Paymob
    // redirects back to rawaq://payment-result?..., the browser closes
    // automatically and returns the deep link URL to us here.
    const browserResult = await WebBrowser.openAuthSessionAsync(
      data.redirect_url,
      'rawaq://',
    )

    const deepLinkUrl    = browserResult.type === 'success' ? browserResult.url : null
    const deepLinkParams = deepLinkUrl ? new URL(deepLinkUrl).searchParams : null
    const deepLinkStatus = deepLinkParams?.get('status') ?? null   // 'success' | 'failed' | 'pending' | null
    const bookingId      = deepLinkParams?.get('booking_id') ?? data.booking_id ?? null

    if (!bookingId) {
      setBL(false)
      return
    }

    setNewBookingId(bookingId)
    setCurrentBookingId(bookingId)

    // ── Fast path: gateway confirmed success via browser redirect ────────────
    // Paymob's Transaction Response Callback includes ?success=true when the
    // card charge completed. Our /payments/callback maps that to status=success
    // in the deep link. Trust it and show the confirmation banner immediately —
    // the webhook confirms booking status server-side independently.
    if (deepLinkStatus === 'success') {
      setBL(false)
      setIsBooked(true)
      setShowBookingSuccess(true)
      return
    }

    // ── Slow path: poll for webhook confirmation ─────────────────────────────
    // Covers two scenarios:
    //   1. Browser was dismissed manually (no deep link) — payment may have
    //      succeeded but the redirect was missed.
    //   2. 3DS payment: Paymob sends multiple intermediate webhooks before the
    //      final success one. The success webhook can arrive 30–90 s after the
    //      browser redirects, so deep link status may say 'pending' even though
    //      the payment will eventually confirm.
    setBL(true)

    // Poll for up to ~20 s. Paymob 3DS webhooks can arrive well after the
    // browser redirects — 17 s was often too short.
    // Pattern: fast at first, then back off to 5 s intervals.
    const DELAYS = [2000, 3000, 3000, 5000, 5000]
    let confirmed    = false
    let actualFailed = false
    for (const delay of DELAYS) {
      await new Promise(r => setTimeout(r, delay))
      const { data: statusData } = await apiGet<{
        booking_status: string
        transaction: { status: string } | null
      }>(`/api/payments/status/${bookingId}`)

      if (statusData?.booking_status === 'confirmed') {
        confirmed = true
        break
      }
      // Webhook explicitly marked the transaction failed — stop early
      if (
        statusData?.booking_status === 'cancelled' ||
        statusData?.transaction?.status === 'failed'
      ) {
        actualFailed = true
        break
      }
    }

    setBL(false)

    if (confirmed) {
      setIsBooked(true)
      setShowBookingSuccess(true)
    } else if (actualFailed) {
      // Webhook confirmed the charge failed — safe to prompt a retry
      Alert.alert('Payment failed', 'Your payment was not completed. Please try again.')
    } else if (browserResult.type === 'cancel') {
      // Browser dismissed without completing — user likely abandoned, let them retry silently
    } else {
      // Polling timed out while booking is still pending (3DS still processing).
      // Inform the user, then navigate to bookings tab — their booking will
      // update automatically once the final webhook arrives.
      Alert.alert(
        'Payment is processing',
        'Your payment is being verified. We\'ll confirm your booking shortly — check the Bookings tab.',
        [{ text: 'OK', onPress: () => router.push('/(tabs)/bookings' as any) }],
      )
    }
  }

  async function handleBooking() {
    if (!user) { router.push('/(auth)/login'); return }
    if (!isBooked && ticketTypes.length > 0 && !selectedTypeId) {
      Alert.alert('Select a ticket', 'Please select a ticket type to continue.')
      return
    }
    setBL(true)

    if (isBooked) {
      setBL(false)
      if (currentBookingId) {
        router.push({ pathname: '/(tabs)/bookings', params: { refundBookingId: currentBookingId } } as any)
      } else {
        router.push('/(tabs)/bookings' as any)
      }
      return
    }

    setBL(false)

    // Show payment method picker for paid events with multiple options
    const isPaid = computeIsPaid()
    if (isPaid && paymentOptions.length > 1) {
      setPaymentIntent('booking')
      setShowPaymentPicker(true)
      return
    }

    // Free or single payment option → go straight to booking
    await initiateBooking(selectedPaymentOptionId ?? 'simulated')
  }

  async function handleJoinWaitlist() {
    if (!user) { router.push('/(auth)/login'); return }
    setBL(true)
    const waitlistInsert: Omit<Waitlist, 'id' | 'created_at'> = {
      user_id: user.id,
      event_id: id as string,
      position: 0,
      notified_at: null,
      expires_at: null,
      status: 'waiting',
    }
    const { error } = await supabase.from('waitlist')
      .insert(waitlistInsert)
    if (error) {
      Alert.alert('Error', error.message)
    } else {
      setOnWaitlist(true)
    }
    setBL(false)
  }

  async function handleLeaveWaitlist() {
    if (!user) return
    setBL(true)
    await supabase.from('waitlist')
      .delete().eq('user_id', user.id).eq('event_id', id as string)
    setOnWaitlist(false)
    setBL(false)
  }

  

  async function sendDonation(optionId?: string) {
    if (!user || !tipAmount || !event) return
    const paymentOptionId = optionId ?? selectedPaymentOptionId ?? 'simulated'

    if (paymentOptions.length > 1 && paymentOptionId !== 'simulated') {
      setPaymentIntent('donation')
      setShowTip(false)
      setShowPaymentPicker(true)
      return
    }

    setTipLoading(true)
    const { data: result, error } = await apiPost<{
      transaction_id?: string
      redirect_url?: string
      fawry_reference_number?: string
    }>('/api/tips', {
      event_id: event.id,
      amount: tipAmount,
      currency: event.currency ?? 'SAR',
      message: tipMsg || undefined,
      payment_option_id: paymentOptionId,
      source: 'mobile',
    })

    if (error) {
      setTipLoading(false)
      Alert.alert('Error', error)
      return
    }

    const data = result!

    if (!data.redirect_url) {
      setTipLoading(false)
      setTipDone(true)
      setShowTip(false)
      Alert.alert('Donation sent!', `${event.currency ?? 'SAR'} ${tipAmount} sent to the organizer.`)
      return
    }

    if (data.fawry_reference_number) {
      setTipLoading(false)
      setFawryContext('donation')
      setFawryRef(data.fawry_reference_number)
      return
    }

    const browserResult = await WebBrowser.openAuthSessionAsync(
      data.redirect_url,
      'rawaq://',
    )

    const deepLinkUrl = browserResult.type === 'success' ? browserResult.url : null
    const deepLinkParams = deepLinkUrl ? new URL(deepLinkUrl).searchParams : null
    const deepLinkStatus = deepLinkParams?.get('status') ?? null
    const transactionId = deepLinkParams?.get('transaction_id') ?? data.transaction_id ?? null

    if (deepLinkStatus === 'success') {
      setTipLoading(false)
      setTipDone(true)
      setShowTip(false)
      Alert.alert('Donation sent!', `${event.currency ?? 'SAR'} ${tipAmount} sent to the organizer.`)
      return
    }

    if (!transactionId) {
      setTipLoading(false)
      return
    }

    const DELAYS = [2000, 3000, 3000, 5000, 5000]
    let confirmed = false
    let actualFailed = false

    for (const delay of DELAYS) {
      await new Promise(r => setTimeout(r, delay))
      const { data: statusData } = await apiGet<{
        transaction_status: string
        tip_id: string | null
      }>(`/api/tips/status/${transactionId}`)

      if (statusData?.tip_id || statusData?.transaction_status === 'succeeded') {
        confirmed = true
        break
      }
      if (statusData?.transaction_status === 'failed') {
        actualFailed = true
        break
      }
    }

    setTipLoading(false)

    if (confirmed) {
      setTipDone(true)
      setShowTip(false)
      Alert.alert('Donation sent!', `${event.currency ?? 'SAR'} ${tipAmount} sent to the organizer.`)
    } else if (actualFailed) {
      Alert.alert('Payment failed', 'Your donation was not completed. Please try again.')
    } else if (browserResult.type !== 'cancel') {
      Alert.alert(
        'Payment is processing',
        'Your donation is being verified. We will update it shortly.',
      )
    }
  }

  async function openVenueInMaps() {
    if (!event) return

    const hasCoords = typeof event.lat === 'number' && typeof event.lng === 'number'
    const locationParts = [
      event.venue_name,
      event.address,
      event.city,
      event.country,
    ].filter(Boolean)
    const searchQuery = locationParts.join(', ')

    if (!hasCoords && !searchQuery) {
      Alert.alert('Location unavailable', 'This event does not have a map location yet.')
      return
    }

    const query = hasCoords
      ? `${event.lat},${event.lng}`
      : searchQuery

    const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`

    try {
      const supported = await Linking.canOpenURL(mapsUrl)
      if (!supported) {
        Alert.alert('Maps unavailable', 'Could not open Google Maps on this device.')
        return
      }
      await Linking.openURL(mapsUrl)
    } catch {
      Alert.alert('Maps unavailable', 'Could not open Google Maps right now. Please try again.')
    }
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
    <>
    <Stack.Screen options={{ headerShown: false }} />
    <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      {/* Cover hero */}
      <View style={styles.hero}>
        {event.cover_image_url ? (
          <Image source={{ uri: event.cover_image_url }} style={styles.heroImage} resizeMode="cover" />
        ) : (
          <Text style={styles.heroEmoji}>{event.category?.icon ?? '📅'}</Text>
        )}
        {/* Floating back button — sits on top of the hero image */}
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.heroBack}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="chevron-back" size={22} color="#fff" />
        </TouchableOpacity>
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
        {eventCommunities.length > 0 && (
          <View style={styles.communitySection}>
            <Text style={styles.communitySectionLabel}>Inside communities</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.communityPills}>
              {eventCommunities.map((community) => (
                <TouchableOpacity
                  key={community.id}
                  style={styles.communityPill}
                  onPress={() => router.push(`/communities/${community.slug}` as any)}
                >
                  <Text style={styles.communityPillText}>
                    {locale === 'ar' && community.name_ar ? community.name_ar : community.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Info cards */}
        <View style={styles.infoGrid}>
          <InfoBlock icon="📅" label="Date & Time">
            <Text style={styles.infoValue}>{formatDate(event.start_at, locale)}</Text>
            <Text style={styles.infoSub}>{formatTime(event.start_at)}{event.end_at ? ` – ${formatTime(event.end_at)}` : ''}</Text>
          </InfoBlock>
          <InfoBlock icon="📍" label="Location" onPress={openVenueInMaps}>
            <Text style={styles.infoValue}>{event.venue_name ?? 'TBA'}</Text>
            <Text style={styles.infoSub}>{event.city}, {event.country}</Text>
            <Text style={styles.infoLink}>Open in Google Maps</Text>
          </InfoBlock>
          <InfoBlock icon="👥" label="Attendees">
            <Text style={styles.infoValue}>{event.bookings_count} attending</Text>
            {spotsLeft !== null && (
              <Text style={styles.infoSub}>{isFull ? 'Fully booked' : `${spotsLeft} spots left`}</Text>
            )}
          </InfoBlock>
          <InfoBlock icon="💰" label="Price">
            <Text style={styles.infoValue}>
              {event.is_free ? 'Free' : formatCurrency(event.price ?? 0, event.currency, locale)}
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
              <View style={styles.manageBookingBlock}>
                <TouchableOpacity
                  style={[styles.bookBtn, styles.bookBtnOutline]}
                  onPress={handleBooking} disabled={bookingLoading}
                >
                  {bookingLoading
                    ? <ActivityIndicator color={Colors.brand[500]} />
                    : <Text style={[styles.bookBtnText, { color: Colors.gray[700] }]}>Open in My Bookings</Text>}
                </TouchableOpacity>
                <Text style={styles.manageBookingHint}>
                  Cancellations and refunds are handled from My Bookings.
                </Text>
              </View>
            ) : bookingPending ? (
              <View style={styles.waitlistBadge}>
                <Text style={styles.waitlistBadgeText}>⏳ Payment is being processed</Text>
                <Text style={[styles.waitlistBadgeText, { fontWeight: '400', marginTop: 2, opacity: 0.8 }]}>
                  Your booking will be confirmed shortly. Check the Bookings tab.
                </Text>
              </View>
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
                              {tt.is_free ? 'Free' : formatCurrency(tt.price, tt.currency, locale)}
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
                          ? `✓ Discount applied — you pay ${formatCurrency(promoResult.final_amount ?? 0, event.currency, locale)}`
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
                            : `Book Now — ${formatCurrency(finalP, event.currency, locale)}`
                        })()}
                      </Text>
                    )
                  }
                </TouchableOpacity>
              </>
            )}
          </View>
        )}

        {/* Booking success banner */}
        {showBookingSuccess && newBookingId && (
          <View style={styles.successBanner}>
            <Text style={styles.successTitle}>✅ Booking confirmed!</Text>
            <Text style={styles.successSub}>Your spot is reserved for {event.title}.</Text>
            <View style={styles.successActions}>
              <TouchableOpacity
                style={styles.successBtn}
                onPress={() => router.push(`/bookings/${newBookingId}/ticket` as any)}
              >
                <Text style={styles.successBtnText}>🎟️ View Ticket</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.successDismiss}
                onPress={() => setShowBookingSuccess(false)}
              >
                <Text style={styles.successDismissText}>Got it</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Fawry payment reference */}
        {fawryRef && (
          <View style={styles.fawryCard}>
            <Text style={styles.fawryTitle}>🏪 Pay with Fawry</Text>
            <Text style={styles.fawryRef}>{fawryRef}</Text>
            <Text style={styles.fawryDesc}>
              {fawryContext === 'donation'
                ? 'Use this reference at any Fawry outlet, ATM, or kiosk. Your donation will be recorded after payment.'
                : 'Use this reference at any Fawry outlet, ATM, or kiosk. Your ticket will be confirmed after payment.'}
            </Text>
            <TouchableOpacity onPress={() => setFawryRef(null)} style={styles.fawryDismiss}>
              <Text style={styles.fawryDismissText}>Got it</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Tip organizer */}
        {isBooked && !tipDone && (
          <TouchableOpacity style={styles.tipToggle} onPress={() => setShowTip((v) => !v)}>
            <Text style={styles.tipToggleText}>💝 {showTip ? 'Hide' : 'Donate to Organizer'}</Text>
          </TouchableOpacity>
        )}

        {showTip && !tipDone && (
          <View style={styles.tipPanel}>
            <Text style={styles.sectionTitle}>Donation Amount ({event.currency ?? 'SAR'})</Text>
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
              onPress={() => {
                void sendDonation()
              }}
              disabled={!tipAmount || tipLoading}
            >
              {tipLoading
                ? <ActivityIndicator color={Colors.white} />
                : <Text style={styles.bookBtnText}>Send {tipAmount ? `${event.currency ?? 'SAR'} ${tipAmount}` : ''} Donation</Text>
              }
            </TouchableOpacity>
            <Text style={styles.tipDisclaimer}>Your donation will be processed through the selected payment method</Text>
          </View>
        )}

        {/* Report event */}
        {user && user.id !== event.organizer_id && (
          <View style={styles.reportSection}>
            {reportDone ? (
              <Text style={styles.reportDone}>✅ Report submitted. Thank you.</Text>
            ) : !showReport ? (
              <TouchableOpacity onPress={() => setShowReport(true)}>
                <Text style={styles.reportLink}>🚩 Report this event</Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.reportPanel}>
                <Text style={styles.reportTitle}>Report Event</Text>
                {([
                  { value: 'spam',           label: 'Spam or misleading' },
                  { value: 'inappropriate',  label: 'Inappropriate content' },
                  { value: 'harassment',     label: 'Harassment or hate' },
                  { value: 'misinformation', label: 'False information' },
                  { value: 'other',          label: 'Other' },
                ] as Array<{ value: ReportReason; label: string }>).map((r) => (
                  <TouchableOpacity
                    key={r.value}
                    style={styles.reportOption}
                    onPress={() => setReportReason(r.value)}
                  >  
                    <View style={[styles.reportRadio, reportReason === r.value && styles.reportRadioSelected]} />
                    <Text style={styles.reportOptionLabel}>{r.label}</Text>
                  </TouchableOpacity>
                ))}
                <TextInput
                  value={reportDetails}
                  onChangeText={setReportDetails}
                  placeholder="Additional details (optional)"
                  placeholderTextColor={Colors.gray[400]}
                  multiline
                  numberOfLines={2}
                  maxLength={500}
                  style={styles.reportInput}
                />
                <View style={styles.reportBtnRow}>
                  <TouchableOpacity
                    disabled={reportLoading}
                    style={[styles.reportSubmitBtn, reportLoading && { opacity: 0.5 }]}
                    onPress={async () => {
                      setReportLoading(true)
                      const { error } = await supabase.from('event_reports').insert({
                        event_id:    event.id,
                        reporter_id: user.id,
                        reason:      reportReason,
                        details:     reportDetails.trim() || null,
                        status:      'pending',
                        resolved_by: null,
                        resolved_at: null,
                        resolution_note: null,
                      })
                      if (error && error.code !== '23505') {
                        Alert.alert('Error', error.message)
                      } else {
                        setReportDone(true)
                        setShowReport(false)
                      }
                      setReportLoading(false)
                    }}
                  >
                    <Text style={styles.reportSubmitText}>{reportLoading ? 'Submitting…' : 'Submit Report'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.reportCancelBtn}
                    onPress={() => setShowReport(false)}
                  >
                    <Text style={styles.reportCancelText}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
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

    {/* Payment method picker modal */}
    <Modal
      visible={showPaymentPicker}
      transparent
      animationType="slide"
      onRequestClose={() => setShowPaymentPicker(false)}
    >
      <TouchableOpacity
        style={styles.modalOverlay}
        activeOpacity={1}
        onPress={() => setShowPaymentPicker(false)}
      >
        <View style={styles.paymentSheet}>
          <View style={styles.paymentSheetHandle} />
          <Text style={styles.paymentSheetTitle}>
            {paymentIntent === 'donation' ? 'How would you like to donate?' : 'How would you like to pay?'}
          </Text>
          {paymentOptions.map((opt) => (
            <TouchableOpacity
              key={opt.id}
              style={[
                styles.paymentOption,
                selectedPaymentOptionId === opt.id && styles.paymentOptionSelected,
              ]}
              onPress={() => {
                setSelectedPaymentOptionId(opt.id)
                if (paymentIntent === 'donation') {
                  setShowPaymentPicker(false)
                  sendDonation(opt.id)
                } else {
                  initiateBooking(opt.id)
                }
              }}
            >
              <Text style={styles.paymentOptionIcon}>{opt.icon}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.paymentOptionLabel}>{opt.label}</Text>
                <Text style={styles.paymentOptionDesc} numberOfLines={1}>{opt.description}</Text>
              </View>
              {selectedPaymentOptionId === opt.id && (
                <Ionicons name="checkmark-circle" size={20} color={Colors.brand[500]} />
              )}
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={styles.paymentCancelBtn} onPress={() => setShowPaymentPicker(false)}>
            <Text style={styles.paymentCancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
    </>
  )
}

function InfoBlock({
  icon,
  label,
  children,
  onPress,
}: {
  icon: string
  label: string
  children: React.ReactNode
  onPress?: () => void
}) {
  if (onPress) {
    return (
      <TouchableOpacity style={[infoStyles.block, infoStyles.blockPressable]} activeOpacity={0.8} onPress={onPress}>
        <Text style={infoStyles.icon}>{icon}</Text>
        <Text style={infoStyles.label}>{label}</Text>
        {children}
      </TouchableOpacity>
    )
  }

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
  blockPressable: { borderWidth: 1, borderColor: Colors.brand[100] },
  icon: { fontSize: 20, marginBottom: 4 },
  label: { fontSize: FontSize.xs, color: Colors.gray[400], textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 },
})

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.gray[50] },
  content: { paddingBottom: Spacing['4xl'] },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  hero: { height: 180, backgroundColor: Colors.brand[100], justifyContent: 'center', alignItems: 'center', position: 'relative' },
  heroImage: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%' },
  heroEmoji: { fontSize: 72 },
  heroBack: {
    position: 'absolute',
    top: 48,
    left: Spacing.lg,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.40)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroBadges: { position: 'absolute', bottom: Spacing.md, left: Spacing.md, flexDirection: 'row', gap: Spacing.xs },
  body: { padding: Spacing.lg },
  title: { fontSize: FontSize['2xl'], fontWeight: FontWeight.bold, color: Colors.gray[900], marginBottom: Spacing.xs },
  categoryLabel: { fontSize: FontSize.sm, color: Colors.brand[600], fontWeight: FontWeight.medium, marginBottom: Spacing.lg },
  communitySection: { marginBottom: Spacing.lg },
  communitySectionLabel: { fontSize: FontSize.xs, color: Colors.gray[500], fontWeight: FontWeight.semibold, textTransform: 'uppercase', marginBottom: Spacing.sm },
  communityPills: { gap: Spacing.sm },
  communityPill: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs + 2, borderRadius: Radius.full, backgroundColor: Colors.brand[50], borderWidth: 1, borderColor: Colors.brand[100], marginRight: Spacing.sm },
  communityPillText: { fontSize: FontSize.xs, color: Colors.brand[700], fontWeight: FontWeight.semibold },
  infoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.xl },
  infoValue: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.gray[900] },
  infoSub: { fontSize: FontSize.xs, color: Colors.gray[500], marginTop: 2 },
  infoLink: { fontSize: FontSize.xs, color: Colors.brand[600], fontWeight: FontWeight.medium, marginTop: Spacing.sm },
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
  manageBookingBlock: { gap: Spacing.xs },
  manageBookingHint: { fontSize: FontSize.xs, color: Colors.gray[500], textAlign: 'center', marginTop: -2 },
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
  successBanner: { margin: Spacing.lg, backgroundColor: '#f0fdf4', borderRadius: Radius.lg, padding: Spacing.lg, borderWidth: 1, borderColor: '#bbf7d0', ...Shadow.card },
  successTitle: { fontSize: FontSize.base, fontWeight: FontWeight.bold, color: '#15803d', marginBottom: 4 },
  successSub: { fontSize: FontSize.sm, color: '#166534', marginBottom: Spacing.md },
  successActions: { flexDirection: 'row', gap: Spacing.md },
  successBtn: { flex: 1, backgroundColor: '#16a34a', borderRadius: Radius.md, paddingVertical: Spacing.sm + 2, alignItems: 'center' },
  successBtnText: { color: Colors.white, fontWeight: FontWeight.semibold, fontSize: FontSize.sm },
  successDismiss: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 2, alignItems: 'center', justifyContent: 'center' },
  successDismissText: { fontSize: FontSize.sm, color: '#166534' },
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
  // Report
  reportSection: { marginBottom: Spacing.xl, alignItems: 'center' },
  reportLink: { fontSize: FontSize.xs, color: Colors.gray[400] },
  reportDone: { fontSize: FontSize.xs, color: '#16a34a' },
  reportPanel: { width: '100%', backgroundColor: Colors.white, borderRadius: Radius.lg, padding: Spacing.md, ...Shadow.card },
  reportTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.gray[900], marginBottom: Spacing.sm },
  reportOption: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: 5 },
  reportRadio: { width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: Colors.gray[300] },
  reportRadioSelected: { borderColor: '#dc2626', backgroundColor: '#dc2626' },
  reportOptionLabel: { fontSize: FontSize.sm, color: Colors.gray[700] },
  reportInput: { borderWidth: 1, borderColor: Colors.gray[200], borderRadius: Radius.md, paddingHorizontal: Spacing.sm, paddingVertical: Spacing.sm, fontSize: FontSize.sm, color: Colors.gray[900], marginTop: Spacing.sm, textAlignVertical: 'top' },
  reportBtnRow: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.sm },
  reportSubmitBtn: { flex: 1, backgroundColor: '#dc2626', borderRadius: Radius.md, paddingVertical: Spacing.sm + 2, alignItems: 'center' },
  reportSubmitText: { color: Colors.white, fontSize: FontSize.xs, fontWeight: FontWeight.semibold },
  reportCancelBtn: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 2, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.gray[200] },
  reportCancelText: { fontSize: FontSize.xs, color: Colors.gray[600] },
  // Fawry reference card
  fawryCard: { backgroundColor: '#fff7ed', borderRadius: Radius.lg, padding: Spacing.lg, marginBottom: Spacing.xl, borderWidth: 1.5, borderColor: '#fed7aa', alignItems: 'center', gap: Spacing.sm },
  fawryTitle: { fontSize: FontSize.base, fontWeight: FontWeight.semibold, color: '#9a3412' },
  fawryRef: { fontSize: 28, fontWeight: FontWeight.bold, color: '#c2410c', letterSpacing: 4, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },
  fawryDesc: { fontSize: FontSize.xs, color: '#7c2d12', textAlign: 'center' },
  fawryDismiss: { marginTop: Spacing.xs, paddingVertical: Spacing.sm, paddingHorizontal: Spacing.xl, backgroundColor: '#ea580c', borderRadius: Radius.md },
  fawryDismissText: { color: Colors.white, fontWeight: FontWeight.semibold, fontSize: FontSize.sm },
  // Payment method picker modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  paymentSheet: { backgroundColor: Colors.white, borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl, padding: Spacing.lg, paddingBottom: 40, gap: Spacing.sm },
  paymentSheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: Colors.gray[300], alignSelf: 'center', marginBottom: Spacing.sm },
  paymentSheetTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.gray[900], marginBottom: Spacing.xs },
  paymentOption: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md, borderWidth: 1.5, borderColor: Colors.gray[200], borderRadius: Radius.lg },
  paymentOptionSelected: { borderColor: Colors.brand[500], backgroundColor: Colors.brand[50] },
  paymentOptionIcon: { fontSize: 24 },
  paymentOptionLabel: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.gray[900] },
  paymentOptionDesc: { fontSize: FontSize.xs, color: Colors.gray[500], marginTop: 1 },
  paymentCancelBtn: { marginTop: Spacing.xs, paddingVertical: Spacing.md, alignItems: 'center', borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.gray[200] },
  paymentCancelText: { fontSize: FontSize.sm, color: Colors.gray[600], fontWeight: FontWeight.medium },
})

