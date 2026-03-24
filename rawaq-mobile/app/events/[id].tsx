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
import type { EventWithOrganizer, CommentWithAuthor } from '@/types/database'

const QUICK_TIPS = [5, 10, 25, 50]

export default function EventDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { user } = useAuth()
  const { t, locale } = useLocale()
  const router = useRouter()

  const [event, setEvent]           = useState<EventWithOrganizer | null>(null)
  const [comments, setComments]     = useState<CommentWithAuthor[]>([])
  const [loading, setLoading]       = useState(true)
  const [isBooked, setIsBooked]     = useState(false)
  const [bookingLoading, setBL]     = useState(false)
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
        ? supabase
          .from('bookings')
          .select('id')
          .eq('event_id', id)
          .eq('user_id', user.id)
          .eq('status', 'confirmed')
          .single()
        : Promise.resolve({ data: null }),
    ]).then(([{ data: ev }, { data: cmts }, { data: booking }]) => {
      setEvent(ev as EventWithOrganizer)
      setComments((cmts ?? []) as CommentWithAuthor[])
      setIsBooked(!!booking)
      setLoading(false)
    })
  }, [id, user])

  async function handleBooking() {
    if (!user) { router.push('/(auth)/login'); return }
    setBL(true)

    if (isBooked) {
      await supabase
        .from('bookings')
        .update({ status: 'cancelled' })
        .eq('event_id', id)
        .eq('user_id', user.id)
        .eq('status', 'confirmed')
      setIsBooked(false)
      setBL(false)
      return
    }

    // Pre-booking checks: fetch current profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('display_name, gender, city')
      .eq('id', user.id)
      .single()

    if (!profile?.display_name || !profile?.gender || !profile?.city) {
      setBL(false)
      Alert.alert(
        'Profile incomplete',
        'Please complete your profile (name, gender, and city) before booking an event.\n\nGo to the Profile tab to update your info.',
        [{ text: 'OK' }],
      )
      return
    }

    if (event?.gender_restriction === 'male' && profile.gender !== 'male') {
      setBL(false)
      Alert.alert('Men only', 'This event is for men only.')
      return
    }
    if (event?.gender_restriction === 'female' && profile.gender !== 'female') {
      setBL(false)
      Alert.alert('Women only', 'This event is for women only.')
      return
    }

    const { error } = await supabase
      .from('bookings')
      .upsert({ event_id: id, user_id: user.id, status: 'confirmed' }, { onConflict: 'event_id,user_id' })
    if (!error) setIsBooked(true)
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
          <TouchableOpacity
            style={[styles.bookBtn, isFull && !isBooked && styles.bookBtnGray, isBooked && styles.bookBtnOutline]}
            onPress={handleBooking}
            disabled={bookingLoading || (isFull && !isBooked)}
            activeOpacity={0.85}
          >
            {bookingLoading
              ? <ActivityIndicator color={isBooked ? Colors.brand[500] : Colors.white} />
              : (
                <Text style={[styles.bookBtnText, isBooked && { color: Colors.gray[700] }]}>
                  {isFull && !isBooked ? 'Fully Booked'
                    : isBooked ? '✓ Cancel Booking'
                    : event.is_free ? 'Join Event — Free'
                    : `Book Now — SAR ${event.price ?? 0}`}
                </Text>
              )
            }
          </TouchableOpacity>
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
  bookBtnText: { color: Colors.white, fontWeight: FontWeight.semibold, fontSize: FontSize.base },
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
