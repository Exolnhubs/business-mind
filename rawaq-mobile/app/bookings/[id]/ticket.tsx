import { useEffect, useState } from 'react'
import {
  View, Text, ScrollView, StyleSheet,
  TouchableOpacity, ActivityIndicator, Share,
} from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import QRCode from 'react-native-qrcode-svg'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/auth-context'
import { useLocale } from '@/contexts/locale-context'
import { formatDate, formatTime } from '@/lib/utils'
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadow } from '@/theme'

const APP_URL = process.env.EXPO_PUBLIC_APP_URL ?? 'https://rawaq.app'

interface TicketData {
  id: string
  ticket_id: string
  seat: string | null
  scanned_at: string | null
  status: string
  event: {
    id: string
    title: string
    title_ar: string | null
    start_at: string
    end_at: string | null
    venue_name: string | null
    address: string | null
    city: string
  }
  profile: { display_name: string } | null
}

export default function TicketScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { user } = useAuth()
  const { t, locale } = useLocale()
  const router = useRouter()

  const [ticket, setTicket] = useState<TicketData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user || !id) { setLoading(false); return }
    supabase
      .from('bookings')
      .select(`
        id, ticket_id, seat, scanned_at, status,
        event:events!event_id(id, title, title_ar, start_at, end_at, venue_name, address, city),
        profile:profiles!user_id(display_name)
      `)
      .eq('id', id)
      .eq('user_id', user.id)
      .single()
      .then(({ data }) => {
        setTicket(data as TicketData | null)
        setLoading(false)
      })
  }, [id, user])

  function handleShare() {
    if (!ticket?.ticket_id) return
    Share.share({
      message: `My ticket for ${ticket.event.title} — Ticket ID: ${ticket.ticket_id}`,
      url: `${APP_URL}/bookings/${id}/ticket`,
    })
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={Colors.brand[500]} />
      </View>
    )
  }

  if (!ticket || !ticket.ticket_id) {
    return (
      <View style={styles.center}>
        <Text style={styles.noTicket}>{t('ticket.not_found')}</Text>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backBtnText}>{t('common.back')}</Text>
        </TouchableOpacity>
      </View>
    )
  }

  const event = ticket.event
  const displayTitle = locale === 'ar' && event.title_ar ? event.title_ar : event.title
  const verifyUrl = `${APP_URL}/api/tickets/verify?t=${ticket.ticket_id}`
  const isScanned = !!ticket.scanned_at

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      {/* Header band */}
      <View style={styles.header}>
        <Text style={styles.headerLogo}>Rawaq 🌟</Text>
        <Text style={styles.headerSub}>{t('ticket.event_ticket')}</Text>
        {isScanned && (
          <View style={styles.scannedBadge}>
            <Text style={styles.scannedText}>{t('ticket.scanned')}</Text>
          </View>
        )}
      </View>

      {/* Event info */}
      <View style={styles.body}>
        <Text style={styles.eventTitle} numberOfLines={2}>{displayTitle}</Text>
        {locale !== 'ar' && event.title_ar && (
          <Text style={styles.eventTitleAr} numberOfLines={1}>{event.title_ar}</Text>
        )}

        <View style={styles.infoList}>
          <InfoRow icon="📅" label={t('ticket.date')} value={formatDate(event.start_at, locale)} />
          <InfoRow
            icon="🕐"
            label={t('ticket.time')}
            value={formatTime(event.start_at, locale) + (event.end_at ? ` – ${formatTime(event.end_at, locale)}` : '')}
          />
          <InfoRow icon="📍" label={t('ticket.venue')} value={event.venue_name ?? event.city} />
          {event.address && <InfoRow icon="🗺️" label={t('ticket.address')} value={event.address} />}
          <InfoRow icon="👤" label={t('ticket.attendee')} value={ticket.profile?.display_name ?? user?.email ?? ''} />
          {ticket.seat && <InfoRow icon="💺" label={t('ticket.seat')} value={ticket.seat} />}
        </View>
      </View>

      {/* Dashed divider */}
      <View style={styles.divider}>
        <View style={styles.dividerCircleLeft} />
        <View style={styles.dividerLine} />
        <View style={styles.dividerCircleRight} />
      </View>

      {/* QR section */}
      <View style={styles.qrSection}>
        <View style={[styles.qrWrapper, isScanned && styles.qrWrapperScanned]}>
          <QRCode
            value={verifyUrl}
            size={200}
            color={Colors.gray[900]}
            backgroundColor={Colors.white}
          />
        </View>
        <Text style={styles.ticketId}>{ticket.ticket_id}</Text>
        <Text style={styles.qrHint}>{t('ticket.present_qr')}</Text>
        {isScanned && (
          <Text style={styles.scannedNote}>
            {t('ticket.scanned_at')}: {new Date(ticket.scanned_at!).toLocaleString()}
          </Text>
        )}
      </View>

      {/* Actions */}
      <View style={styles.actions}>
        <TouchableOpacity style={styles.shareBtn} onPress={handleShare}>
          <Text style={styles.shareBtnText}>📤 {t('ticket.share')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.backLink} onPress={() => router.back()}>
          <Text style={styles.backLinkText}>{t('common.back')}</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  )
}

function InfoRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <View style={infoStyles.row}>
      <Text style={infoStyles.icon}>{icon}</Text>
      <View style={infoStyles.textBlock}>
        <Text style={infoStyles.label}>{label}</Text>
        <Text style={infoStyles.value} numberOfLines={2}>{value}</Text>
      </View>
    </View>
  )
}

const infoStyles = StyleSheet.create({
  row: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.md },
  icon: { fontSize: 16, width: 22, textAlign: 'center', marginTop: 1 },
  textBlock: { flex: 1 },
  label: { fontSize: FontSize.xs, color: Colors.gray[400], fontWeight: FontWeight.medium, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 1 },
  value: { fontSize: FontSize.sm, color: Colors.gray[800], fontWeight: FontWeight.medium },
})

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.gray[50] },
  content: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing['2xl'], alignItems: 'center' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: Spacing['3xl'] },
  noTicket: { fontSize: FontSize.base, color: Colors.gray[500], textAlign: 'center', marginBottom: Spacing.lg },
  backBtn: { paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md, backgroundColor: Colors.brand[500], borderRadius: Radius.lg },
  backBtnText: { color: Colors.white, fontWeight: FontWeight.semibold },

  // Ticket card
  header: {
    width: '100%', maxWidth: 380,
    backgroundColor: Colors.brand[500],
    borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl,
    paddingHorizontal: Spacing.xl, paddingVertical: Spacing.lg,
  },
  headerLogo: { color: Colors.white, fontSize: FontSize.lg, fontWeight: FontWeight.bold },
  headerSub: { color: Colors.brand[100], fontSize: FontSize.xs, marginTop: 2 },
  scannedBadge: {
    marginTop: Spacing.sm, alignSelf: 'flex-start',
    backgroundColor: Colors.red.DEFAULT, borderRadius: Radius.full,
    paddingHorizontal: Spacing.md, paddingVertical: 3,
  },
  scannedText: { color: Colors.white, fontSize: FontSize.xs, fontWeight: FontWeight.bold, textTransform: 'uppercase' },

  body: {
    width: '100%', maxWidth: 380,
    backgroundColor: Colors.white,
    paddingHorizontal: Spacing.xl, paddingTop: Spacing.xl, paddingBottom: Spacing.md,
    borderLeftWidth: 1, borderRightWidth: 1, borderColor: Colors.gray[100],
  },
  eventTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.gray[900], marginBottom: 4, lineHeight: 26 },
  eventTitleAr: { fontSize: FontSize.sm, color: Colors.gray[400], marginBottom: Spacing.md, textAlign: 'right' },
  infoList: { marginTop: Spacing.md },

  divider: {
    width: '100%', maxWidth: 380,
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.white,
    borderLeftWidth: 1, borderRightWidth: 1, borderColor: Colors.gray[100],
    paddingVertical: Spacing.xs,
  },
  dividerCircleLeft: { width: 20, height: 20, borderRadius: 10, backgroundColor: Colors.gray[50], marginLeft: -10 },
  dividerLine: { flex: 1, borderTopWidth: 2, borderStyle: 'dashed', borderColor: Colors.gray[200] },
  dividerCircleRight: { width: 20, height: 20, borderRadius: 10, backgroundColor: Colors.gray[50], marginRight: -10 },

  qrSection: {
    width: '100%', maxWidth: 380,
    backgroundColor: Colors.white,
    paddingHorizontal: Spacing.xl, paddingTop: Spacing.xl, paddingBottom: Spacing['2xl'],
    borderBottomLeftRadius: Radius.xl, borderBottomRightRadius: Radius.xl,
    borderLeftWidth: 1, borderRightWidth: 1, borderBottomWidth: 1, borderColor: Colors.gray[100],
    alignItems: 'center',
    ...Shadow.card,
  },
  qrWrapper: {
    padding: Spacing.md, backgroundColor: Colors.white,
    borderRadius: Radius.lg, borderWidth: 2, borderColor: Colors.gray[100],
  },
  qrWrapperScanned: { opacity: 0.4 },
  ticketId: {
    marginTop: Spacing.md, fontFamily: 'monospace',
    fontSize: FontSize.base, fontWeight: FontWeight.bold,
    color: Colors.gray[800], letterSpacing: 3,
  },
  qrHint: { marginTop: 4, fontSize: FontSize.xs, color: Colors.gray[400], textAlign: 'center' },
  scannedNote: { marginTop: Spacing.sm, fontSize: FontSize.xs, color: Colors.red.text, textAlign: 'center' },

  actions: { marginTop: Spacing['2xl'], width: '100%', maxWidth: 380, gap: Spacing.sm },
  shareBtn: {
    backgroundColor: Colors.brand[500], borderRadius: Radius.lg,
    paddingVertical: Spacing.md + 2, alignItems: 'center',
  },
  shareBtnText: { color: Colors.white, fontWeight: FontWeight.semibold, fontSize: FontSize.base },
  backLink: { alignItems: 'center', paddingVertical: Spacing.sm },
  backLinkText: { color: Colors.brand[600], fontSize: FontSize.sm, fontWeight: FontWeight.medium },
})
