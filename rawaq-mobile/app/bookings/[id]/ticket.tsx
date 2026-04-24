import { useEffect, useState } from 'react'
import {
  View, Text, ScrollView, StyleSheet,
  TouchableOpacity, ActivityIndicator, Share,
  TextInput, Alert, Modal, KeyboardAvoidingView, Platform,
} from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import QRCode from 'react-native-qrcode-svg'
import { supabase } from '@/lib/supabase'
import { apiPatch } from '@/lib/api'
import { useAuth } from '@/contexts/auth-context'
import { useLocale } from '@/contexts/locale-context'
import { formatDate, formatTime } from '@/lib/utils'
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadow } from '@/theme'
import { TicketFlipLoader } from '@/components/ui/TicketFlipLoader'

const APP_URL = process.env.EXPO_PUBLIC_APP_URL ?? 'https://rawaq.app'

interface TicketData {
  id: string
  ticket_id: string
  seat: string | null
  scanned_at: string | null
  status: string
  occurrence: {
    starts_at: string
    ends_at: string | null
  } | null
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

type HolderData = {
  id: string
  full_name: string
  date_of_birth: string
  relation: string
  position: number
}

export default function TicketScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { user } = useAuth()
  const { t, locale } = useLocale()
  const router = useRouter()

  const [ticket, setTicket] = useState<TicketData | null>(null)
  const [holders, setHolders] = useState<HolderData[]>([])
  const [loading, setLoading] = useState(true)
  const [showUpdateModal, setShowUpdateModal] = useState(false)
  const [draftHolders, setDraftHolders] = useState<HolderData[]>([])
  const [savingUpdate, setSavingUpdate] = useState(false)

  useEffect(() => {
    if (!user || !id) { setLoading(false); return }
    supabase
      .from('bookings')
      .select(`
        id, ticket_id, seat, scanned_at, status,
        occurrence:event_occurrences!occurrence_id(starts_at, ends_at),
        event:events!event_id(id, title, title_ar, start_at, end_at, venue_name, address, city),
        profile:profiles!user_id(display_name)
      `)
      .eq('id', id)
      .eq('user_id', user.id)
      .single()
      .then(async ({ data }) => {
        setTicket(data as TicketData | null)
        try {
          const { data: holderRows } = await supabase
            .from('booking_holders' as any)
            .select('id, full_name, date_of_birth, relation, position')
            .eq('booking_id', id)
            .order('position')
          setHolders((holderRows ?? []) as unknown as HolderData[])
        } catch {
          // booking_holders migration may still be pending
        }
        setLoading(false)
      })
  }, [id, user])

  function handleShare() {
    if (!ticket) return
    const eventUrl = `${APP_URL}/events/${ticket.event.id}`
    Share.share({
      message: `I'm attending ${ticket.event.title}! Check it out: ${eventUrl}`,
      url: eventUrl,
    })
  }

  function openUpdateModal() {
    setDraftHolders(holders.map((holder) => ({ ...holder })))
    setShowUpdateModal(true)
  }

  async function handleUpdateTicket() {
    if (!id) return

    if (draftHolders.some((holder) => !holder.full_name.trim() || !holder.date_of_birth.trim() || !holder.relation.trim())) {
      Alert.alert('Missing details', 'Please complete each companion attendee field before saving.')
      return
    }

    setSavingUpdate(true)
    const { error } = await apiPatch(`/api/bookings/${id}`, {
      holders: draftHolders.map((holder) => ({
        full_name: holder.full_name.trim(),
        date_of_birth: holder.date_of_birth.trim(),
        relation: holder.relation.trim(),
        position: holder.position,
      })),
    })
    setSavingUpdate(false)

    if (error) {
      Alert.alert('Update failed', error)
      return
    }

    setHolders(draftHolders.map((holder) => ({ ...holder })))
    setShowUpdateModal(false)
    Alert.alert('Ticket updated', 'Your companion ticket details have been saved.')
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <TicketFlipLoader size="md" label="Preparing your ticket…" />
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
  const displayStartAt = ticket.occurrence?.starts_at ?? event.start_at
  const displayEndAt = ticket.occurrence?.ends_at ?? event.end_at
  const displayTitle = locale === 'ar' && event.title_ar ? event.title_ar : event.title
  const verifyUrl = `${APP_URL}/api/tickets/verify?t=${ticket.ticket_id}`
  const isScanned = !!ticket.scanned_at
  const canUpdateTicket = holders.length > 0
    && ticket.status === 'confirmed'
    && (!ticket.occurrence?.starts_at || new Date(ticket.occurrence.starts_at) > new Date())

  return (
    <>
      <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.headerLogo}>Rawaq</Text>
          <Text style={styles.headerSub}>{t('ticket.event_ticket')}</Text>
          {isScanned && (
            <View style={styles.scannedBadge}>
              <Text style={styles.scannedText}>{t('ticket.scanned')}</Text>
            </View>
          )}
        </View>

        <View style={styles.body}>
          <Text style={styles.eventTitle} numberOfLines={2}>{displayTitle}</Text>
          {locale !== 'ar' && event.title_ar && (
            <Text style={styles.eventTitleAr} numberOfLines={1}>{event.title_ar}</Text>
          )}

          <View style={styles.infoList}>
            <InfoRow icon="DT" label={t('ticket.date')} value={formatDate(displayStartAt, locale)} />
            <InfoRow
              icon="TM"
              label={t('ticket.time')}
              value={formatTime(displayStartAt, locale) + (displayEndAt ? ` - ${formatTime(displayEndAt, locale)}` : '')}
            />
            <InfoRow icon="VN" label={t('ticket.venue')} value={event.venue_name ?? event.city} />
            {event.address && <InfoRow icon="AD" label={t('ticket.address')} value={event.address} />}
            <InfoRow icon="AT" label={t('ticket.attendee')} value={ticket.profile?.display_name ?? user?.email ?? ''} />
            {ticket.seat && <InfoRow icon="ST" label={t('ticket.seat')} value={ticket.seat} />}
          </View>
        </View>

        <View style={styles.divider}>
          <View style={styles.dividerCircleLeft} />
          <View style={styles.dividerLine} />
          <View style={styles.dividerCircleRight} />
        </View>

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

        {holders.map((holder) => (
          <View key={holder.id} style={styles.holderTicket}>
            <View style={[styles.header, styles.holderHeader]}>
              <Text style={styles.headerLogo}>Rawaq</Text>
              <Text style={styles.headerSub}>Guest Ticket - Position {holder.position}</Text>
            </View>
            <View style={styles.body}>
              <View style={styles.infoList}>
                <InfoRow icon="DT" label="Date" value={formatDate(displayStartAt, locale)} />
                <InfoRow icon="TM" label="Time" value={formatTime(displayStartAt, locale) + (displayEndAt ? ` - ${formatTime(displayEndAt, locale)}` : '')} />
                <InfoRow icon="VN" label="Venue" value={event.venue_name ?? event.city} />
                <InfoRow icon="AT" label="Attendee" value={holder.full_name} />
                <InfoRow icon="BD" label="Date of Birth" value={holder.date_of_birth} />
                <InfoRow icon="RL" label="Relation" value={holder.relation} />
              </View>
            </View>
            <View style={styles.holderFooter}>
              <Text style={styles.holderFooterText}>
                Companion · {ticket.ticket_id.slice(-8).toUpperCase()}
              </Text>
            </View>
          </View>
        ))}

        <View style={styles.actions}>
          {canUpdateTicket && (
            <TouchableOpacity style={styles.updateBtn} onPress={openUpdateModal}>
              <Text style={styles.updateBtnText}>Update Ticket</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.shareBtn} onPress={handleShare}>
            <Text style={styles.shareBtnText}>{t('ticket.share')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.backLink} onPress={() => router.back()}>
            <Text style={styles.backLinkText}>{t('common.back')}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <Modal
        visible={showUpdateModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowUpdateModal(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Update Ticket</Text>
            <Text style={styles.modalSub}>
              Update the companion attendee details for this booking before the session starts.
            </Text>

            <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalScrollContent}>
              {draftHolders.map((holder, index) => (
                <View key={holder.id || `${holder.position}-${index}`} style={styles.editorCard}>
                  <Text style={styles.editorTitle}>Companion {holder.position}</Text>

                  <Text style={styles.editorLabel}>Full Name *</Text>
                  <TextInput
                    style={styles.editorInput}
                    value={holder.full_name}
                    onChangeText={(text) => {
                      setDraftHolders((current) => current.map((item, itemIndex) => (
                        itemIndex === index ? { ...item, full_name: text } : item
                      )))
                    }}
                    placeholder="Full name of attendee"
                    placeholderTextColor={Colors.gray[400]}
                    maxLength={120}
                  />

                  <Text style={styles.editorLabel}>Date of Birth * (YYYY-MM-DD)</Text>
                  <TextInput
                    style={styles.editorInput}
                    value={holder.date_of_birth}
                    onChangeText={(text) => {
                      setDraftHolders((current) => current.map((item, itemIndex) => (
                        itemIndex === index ? { ...item, date_of_birth: text } : item
                      )))
                    }}
                    placeholder="1990-01-31"
                    placeholderTextColor={Colors.gray[400]}
                    keyboardType="numbers-and-punctuation"
                    maxLength={10}
                  />

                  <Text style={styles.editorLabel}>Relation *</Text>
                  <TextInput
                    style={styles.editorInput}
                    value={holder.relation}
                    onChangeText={(text) => {
                      setDraftHolders((current) => current.map((item, itemIndex) => (
                        itemIndex === index ? { ...item, relation: text } : item
                      )))
                    }}
                    placeholder="e.g. son, wife, friend"
                    placeholderTextColor={Colors.gray[400]}
                    maxLength={60}
                  />
                </View>
              ))}
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalPrimaryBtn, savingUpdate && styles.modalPrimaryBtnDisabled]}
                onPress={handleUpdateTicket}
                disabled={savingUpdate}
              >
                {savingUpdate
                  ? <ActivityIndicator color={Colors.white} />
                  : <Text style={styles.modalPrimaryBtnText}>Save Changes</Text>}
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSecondaryBtn} onPress={() => setShowUpdateModal(false)}>
                <Text style={styles.modalSecondaryBtnText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
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

  header: {
    width: '100%', maxWidth: 380,
    backgroundColor: Colors.brand[500],
    borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl,
    paddingHorizontal: Spacing.xl, paddingVertical: Spacing.lg,
  },
  holderHeader: { paddingVertical: Spacing.md },
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

  holderTicket: {
    marginTop: Spacing.lg,
    width: '100%',
    backgroundColor: Colors.white,
    borderRadius: Radius.xl,
    overflow: 'hidden',
    ...Shadow.card,
  },
  holderFooter: { paddingHorizontal: Spacing.xl, paddingBottom: Spacing.lg, alignItems: 'center' },
  holderFooterText: { fontSize: FontSize.xs, color: Colors.gray[400], fontFamily: 'monospace' },

  actions: { marginTop: Spacing['2xl'], width: '100%', maxWidth: 380, gap: Spacing.sm },
  updateBtn: {
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    paddingVertical: Spacing.md + 2,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.brand[200],
  },
  updateBtnText: { color: Colors.brand[600], fontWeight: FontWeight.semibold, fontSize: FontSize.base },
  shareBtn: {
    backgroundColor: Colors.brand[500], borderRadius: Radius.lg,
    paddingVertical: Spacing.md + 2, alignItems: 'center',
  },
  shareBtnText: { color: Colors.white, fontWeight: FontWeight.semibold, fontSize: FontSize.base },
  backLink: { alignItems: 'center', paddingVertical: Spacing.sm },
  backLinkText: { color: Colors.brand[600], fontSize: FontSize.sm, fontWeight: FontWeight.medium },

  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  modalSheet: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    padding: Spacing.xl,
    paddingBottom: Spacing['2xl'],
    maxHeight: '88%',
  },
  modalTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.gray[900] },
  modalSub: { fontSize: FontSize.sm, color: Colors.gray[500], marginTop: 4, marginBottom: Spacing.lg, lineHeight: 20 },
  modalScroll: { flexGrow: 0 },
  modalScrollContent: { gap: Spacing.md },
  editorCard: {
    backgroundColor: Colors.gray[50],
    borderRadius: Radius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.gray[100],
  },
  editorTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.gray[900], marginBottom: Spacing.sm },
  editorLabel: { fontSize: FontSize.xs, fontWeight: FontWeight.medium, color: Colors.gray[600], marginBottom: 6 },
  editorInput: {
    borderWidth: 1,
    borderColor: Colors.gray[200],
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
    fontSize: FontSize.base,
    color: Colors.gray[900],
    marginBottom: Spacing.sm,
    backgroundColor: Colors.white,
  },
  modalActions: { gap: Spacing.sm, marginTop: Spacing.lg },
  modalPrimaryBtn: {
    backgroundColor: Colors.brand[500],
    borderRadius: Radius.lg,
    paddingVertical: Spacing.md,
    alignItems: 'center',
  },
  modalPrimaryBtnDisabled: { opacity: 0.6 },
  modalPrimaryBtnText: { color: Colors.white, fontWeight: FontWeight.semibold, fontSize: FontSize.base },
  modalSecondaryBtn: {
    borderWidth: 1,
    borderColor: Colors.gray[200],
    borderRadius: Radius.lg,
    paddingVertical: Spacing.md,
    alignItems: 'center',
  },
  modalSecondaryBtnText: { color: Colors.gray[600], fontWeight: FontWeight.medium, fontSize: FontSize.base },
})
