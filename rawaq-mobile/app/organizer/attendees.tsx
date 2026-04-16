import { useEffect, useState, useCallback, useRef } from 'react'
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  Modal,
  Alert,
  Platform,
} from 'react-native'
import Constants from 'expo-constants'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter, useLocalSearchParams } from 'expo-router'
import { CameraView, useCameraPermissions } from 'expo-camera'
import { apiGet, apiPost } from '@/lib/api'
import { useAuth } from '@/contexts/auth-context'
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/theme'
import type { EventOccurrence } from '@/types/database'

interface Attendee {
  id: string
  status: 'confirmed' | 'cancelled'
  created_at: string
  scanned_at: string | null
  ticket_id: string | null
  user: {
    display_name: string
    avatar_url: string | null
    city: string | null
  } | null
}

interface ScanResult {
  valid: boolean
  already_scanned?: boolean
  message?: string
  booking_id?: string
  occurrence_id?: string
  event_title?: string
  scanned_at?: string
}

type EventScannerMeta = Pick<EventOccurrence, 'id' | 'starts_at' | 'ends_at' | 'status' | 'bookings_count'>

type AttendeesResponse = {
  data: Attendee[]
  occurrence: EventScannerMeta | null
}

function hasOccurrenceEnded(occurrence: EventScannerMeta | null) {
  if (!occurrence?.ends_at) return false
  return new Date(occurrence.ends_at).getTime() < Date.now()
}

function chooseDefaultOccurrence(occurrences: EventScannerMeta[]) {
  const now = Date.now()
  const activeOrUpcoming = occurrences.filter((occurrence) => {
    if (occurrence.status !== 'scheduled') return false
    const startsAt = new Date(occurrence.starts_at).getTime()
    const endsAt = occurrence.ends_at ? new Date(occurrence.ends_at).getTime() : null
    return endsAt !== null ? endsAt > now : startsAt > now
  })

  return (
    activeOrUpcoming.find((occurrence) => occurrence.bookings_count > 0)
    ?? activeOrUpcoming[0]
    ?? occurrences.find((occurrence) => occurrence.bookings_count > 0)
    ?? occurrences[0]
    ?? null
  )
}

function formatOccurrenceLabel(occurrence: EventScannerMeta) {
  const date = new Date(occurrence.starts_at)
  return date.toLocaleString('en-SA-u-ca-gregory', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

export default function AttendeesScreen() {
  const router = useRouter()
  const { user, profile } = useAuth()
  const { eventId, title, occurrenceId } = useLocalSearchParams<{ eventId: string; title: string; occurrenceId?: string }>()
  const insets = useSafeAreaInsets()

  const [attendees, setAttendees] = useState<Attendee[]>([])
  const [occurrences, setOccurrences] = useState<EventScannerMeta[]>([])
  const [selectedOccurrenceId, setSelectedOccurrenceId] = useState<string | null>(occurrenceId ?? null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [search, setSearch] = useState('')
  const [scannerOpen, setScannerOpen] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [scanResult, setScanResult] = useState<ScanResult | null>(null)
  const [scannerAvailable, setScannerAvailable] = useState(profile?.role === 'admin')
  const [eventMeta, setEventMeta] = useState<EventScannerMeta | null>(null)
  const lastScannedRef = useRef<string | null>(null)
  const isAndroidExpoGo = Platform.OS === 'android' && Constants.executionEnvironment === 'storeClient'

  const [permission, requestPermission] = useCameraPermissions()

  useEffect(() => {
    if (!selectedOccurrenceId && occurrenceId) {
      setSelectedOccurrenceId(occurrenceId)
    }
  }, [occurrenceId, selectedOccurrenceId])

  const load = useCallback(async () => {
    if (!eventId || !user) return

    const [occurrencesRes, subscriptionRes] = await Promise.all([
      apiGet<EventScannerMeta[]>(`/api/events/${eventId}/occurrences`, { force: refreshing }),
      profile?.role === 'admin'
        ? Promise.resolve({ data: { plan: { features: { ticket_scanner: true } } }, error: null })
        : apiGet<{ plan: { features?: Record<string, unknown> | null } | null }>('/api/subscriptions'),
    ])

    const occurrenceRows = (occurrencesRes.data ?? []) as EventScannerMeta[]
    const matchedSelectedOccurrence = occurrenceRows.find((occurrence) => occurrence.id === selectedOccurrenceId)
    const matchedParamOccurrence = occurrenceId ? occurrenceRows.find((occurrence) => occurrence.id === occurrenceId) : null
    const fallbackOccurrence = chooseDefaultOccurrence(occurrenceRows)
    const effectiveOccurrence = matchedSelectedOccurrence ?? matchedParamOccurrence ?? fallbackOccurrence

    if (!effectiveOccurrence) {
      router.back()
      return
    }

    const attendeesRes = await apiGet<AttendeesResponse>(
      `/api/events/${eventId}/attendees?occurrence_id=${encodeURIComponent(effectiveOccurrence.id)}`,
      { force: refreshing },
    )

    if (!attendeesRes.data?.occurrence) {
      router.back()
      return
    }

    const hasEnded = hasOccurrenceEnded(attendeesRes.data.occurrence)

    const features = subscriptionRes.data?.plan?.features
    const canScan = profile?.role === 'admin'
      || (features && typeof features === 'object' && (features as Record<string, unknown>).ticket_scanner === true)

    setOccurrences(occurrenceRows)
    if (effectiveOccurrence.id !== selectedOccurrenceId) {
      setSelectedOccurrenceId(effectiveOccurrence.id)
    }
    setEventMeta(attendeesRes.data.occurrence)
    setScannerAvailable(Boolean(canScan) && !hasEnded)
    setAttendees((attendeesRes.data.data ?? []) as Attendee[])
    setLoading(false)
    setRefreshing(false)
  }, [eventId, user, router, profile?.role, refreshing, selectedOccurrenceId, occurrenceId])

  useEffect(() => {
    load()
  }, [load])

  const confirmed = attendees.filter((a) => a.status === 'confirmed')
  const scannedCount = confirmed.filter((a) => a.scanned_at).length
  const eventHasEnded = hasOccurrenceEnded(eventMeta)
  const filtered = search.trim()
    ? confirmed.filter((a) =>
        a.user?.display_name.toLowerCase().includes(search.toLowerCase())
        || a.id.slice(-8).toLowerCase().includes(search.toLowerCase())
        || (a.ticket_id ?? '').toLowerCase().includes(search.toLowerCase()),
      )
    : confirmed
  const headerTopSpacing = Math.max(Spacing.sm, Math.min(insets.top * 0.18, Spacing.md))

  async function handleBarcodeScanned({ data }: { data: string }) {
    if (scanning || lastScannedRef.current === data) return
    lastScannedRef.current = data
    setScanning(true)
    setScanResult(null)

    let ticketId = data
    try {
      const url = new URL(data)
      const t = url.searchParams.get('t')
      if (t) ticketId = t
    } catch {}

    const { data: result, error } = await apiPost<ScanResult>('/api/bookings/scan', { ticket_id: ticketId })

    if (error || !result) {
      setScanResult({ valid: false, message: error ?? 'Scan failed' })
    } else {
      setScanResult(result)
      if (result.occurrence_id && result.occurrence_id !== selectedOccurrenceId) {
        setSelectedOccurrenceId(result.occurrence_id)
      }
      if (result.valid && result.booking_id) {
        setAttendees((prev) =>
          prev.map((attendee) =>
            attendee.id === result.booking_id
              ? { ...attendee, scanned_at: result.scanned_at ?? new Date().toISOString() }
              : attendee,
          ),
        )
      }
    }

    setScanning(false)
  }

  function resetScan() {
    setScanResult(null)
    lastScannedRef.current = null
  }

  async function openScanner() {
    if (hasOccurrenceEnded(eventMeta)) {
      Alert.alert('Scanner closed', 'This event has already ended, so QR scanning is no longer available.')
      return
    }
    if (!scannerAvailable) {
      Alert.alert('Upgrade required', 'QR scanning is available on Pro and Elite organizer plans.')
      return
    }
    if (isAndroidExpoGo) {
      Alert.alert('Not available', 'QR scanning is unavailable in Android Expo Go. Use your installed preview build or a development build.')
      return
    }
    if (!permission?.granted) {
      const result = await requestPermission?.()
      if (!result?.granted) {
        Alert.alert('Camera permission required', 'Please allow camera access to scan QR codes.')
        return
      }
    }
    resetScan()
    setScannerOpen(true)
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={Colors.brand[500]} />
      </View>
    )
  }

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <View style={[styles.header, { paddingTop: headerTopSpacing + Spacing.sm }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {decodeURIComponent(title ?? 'Attendees')}
          </Text>
          <Text style={styles.headerSub}>
            {confirmed.length} confirmed - {scannedCount} scanned
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.scanBtn, !scannerAvailable && styles.scanBtnLocked]}
          onPress={openScanner}
        >
          <Text style={[styles.scanBtnText, !scannerAvailable && styles.scanBtnTextLocked]}>
            {eventHasEnded
              ? 'Event Ended'
              : scannerAvailable ? 'Scan QR' : 'Pro / Elite'}
          </Text>
        </TouchableOpacity>
      </View>

      {!scannerAvailable && (
        <View style={styles.planNotice}>
          <Text style={styles.planNoticeText}>
            {eventHasEnded
              ? 'QR scanning closes automatically once an event has ended.'
              : 'QR ticket scanning is available on Pro and Elite organizer plans.'}
          </Text>
        </View>
      )}

      <View style={styles.statsBar}>
        {[
          { label: 'Confirmed', value: confirmed.length },
          { label: 'Scanned', value: scannedCount },
          {
            label: 'Attendance',
            value: confirmed.length > 0 ? `${Math.round((scannedCount / confirmed.length) * 100)}%` : '-',
          },
        ].map((stat) => (
          <View key={stat.label} style={styles.statItem}>
            <Text style={styles.statValue}>{stat.value}</Text>
            <Text style={styles.statLabel}>{stat.label}</Text>
          </View>
        ))}
      </View>

      {occurrences.length > 1 ? (
        <View style={styles.occurrenceSection}>
          <Text style={styles.occurrenceSectionTitle}>Session</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.occurrenceScroll}>
            {occurrences.map((occurrence) => {
              const isSelected = occurrence.id === selectedOccurrenceId
              return (
                <TouchableOpacity
                  key={occurrence.id}
                  style={[styles.occurrenceChip, isSelected && styles.occurrenceChipActive]}
                  onPress={() => {
                    if (occurrence.id !== selectedOccurrenceId) {
                      setSelectedOccurrenceId(occurrence.id)
                    }
                  }}
                >
                  <Text style={[styles.occurrenceChipTitle, isSelected && styles.occurrenceChipTitleActive]}>
                    {formatOccurrenceLabel(occurrence)}
                  </Text>
                  <Text style={[styles.occurrenceChipMeta, isSelected && styles.occurrenceChipMetaActive]}>
                    {occurrence.bookings_count} booked
                  </Text>
                </TouchableOpacity>
              )
            })}
          </ScrollView>
        </View>
      ) : null}

      <View style={styles.searchWrap}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name, reference or ticket ID..."
          placeholderTextColor={Colors.gray[400]}
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
        />
      </View>

      {filtered.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyText}>
            {search ? 'No match found.' : 'No confirmed attendees yet.'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          refreshControl={(
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true)
                load()
              }}
              tintColor={Colors.brand[500]}
            />
          )}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          renderItem={({ item }) => (
            <View style={[styles.row, item.scanned_at && styles.rowScanned]}>
              <View style={[styles.avatar, item.scanned_at && styles.avatarScanned]}>
                <Text style={styles.avatarText}>
                  {(item.user?.display_name ?? '?')[0].toUpperCase()}
                </Text>
              </View>

              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{item.user?.display_name ?? 'Unknown'}</Text>
                {item.user?.city ? <Text style={styles.city}>{item.user.city}</Text> : null}
              </View>

              <View style={{ alignItems: 'flex-end', gap: 4 }}>
                <View style={styles.refBadge}>
                  <Text style={styles.refText}>{item.id.slice(-8).toUpperCase()}</Text>
                </View>
                {item.scanned_at ? <Text style={styles.scannedBadge}>Scanned</Text> : null}
              </View>
            </View>
          )}
        />
      )}

      <Modal
        visible={scannerOpen}
        animationType="slide"
        onRequestClose={() => setScannerOpen(false)}
      >
        <View style={styles.scannerContainer}>
          <View style={[styles.scannerHeader, { paddingTop: Math.max(Spacing.xl, insets.top + Spacing.lg) }]}>
            <TouchableOpacity onPress={() => setScannerOpen(false)} style={styles.scannerClose}>
              <Text style={styles.scannerCloseText}>Close</Text>
            </TouchableOpacity>
            <Text style={styles.scannerTitle}>Scan QR Ticket</Text>
            <View style={{ width: 40 }} />
          </View>

          {CameraView && !scanResult ? (
            <CameraView
              style={{ flex: 1 }}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={scanning ? undefined : handleBarcodeScanned}
              onMountError={() => {
                setScannerOpen(false)
                Alert.alert('Scanner unavailable', 'Could not start the camera scanner on this device. Please restart the app and try again.')
              }}
            />
          ) : null}

          {!scanResult && (
            <View style={styles.scannerOverlay} pointerEvents="none">
              <View style={styles.scannerFrame} />
              <Text style={styles.scannerHint}>Point at an attendee QR ticket</Text>
            </View>
          )}

          {scanResult && (
            <View style={styles.scanResultWrap}>
              <View
                style={[
                  styles.scanResultCard,
                  scanResult.valid
                    ? styles.scanResultValid
                    : scanResult.already_scanned
                      ? styles.scanResultWarning
                      : styles.scanResultInvalid,
                ]}
              >
                <Text style={styles.scanResultTitle}>
                  {scanResult.valid
                    ? 'Valid Ticket'
                    : scanResult.already_scanned
                      ? 'Already Scanned'
                      : 'Invalid Ticket'}
                </Text>
                {scanResult.message ? <Text style={styles.scanResultMsg}>{scanResult.message}</Text> : null}
              </View>
              <TouchableOpacity style={styles.scanAgainBtn} onPress={resetScan}>
                <Text style={styles.scanAgainText}>Scan Next</Text>
              </TouchableOpacity>
            </View>
          )}

          {scanning && (
            <View style={styles.scanningWrap}>
              <ActivityIndicator size="large" color={Colors.white} />
            </View>
          )}
        </View>
      </Modal>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.gray[50] },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: Spacing['2xl'] },
  emptyText: { fontSize: FontSize.sm, color: Colors.gray[400], textAlign: 'center' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.white,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray[100],
  },
  backBtn: { padding: 4 },
  backText: { fontSize: FontSize.sm, color: Colors.gray[600], fontWeight: FontWeight.semibold },
  headerTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.gray[900] },
  headerSub: { fontSize: FontSize.xs, color: Colors.gray[500], marginTop: 2 },
  scanBtn: {
    backgroundColor: Colors.brand[500],
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  scanBtnText: { color: Colors.white, fontSize: FontSize.sm, fontWeight: FontWeight.semibold },
  scanBtnLocked: { backgroundColor: Colors.gray[100] },
  scanBtnTextLocked: { color: Colors.gray[600] },
  planNotice: {
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
    backgroundColor: Colors.brand[50] ?? '#FFF7ED',
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  planNoticeText: {
    color: Colors.brand[700] ?? Colors.brand[600],
    fontSize: FontSize.xs,
    lineHeight: 18,
  },

  statsBar: {
    flexDirection: 'row',
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray[100],
    paddingVertical: Spacing.sm,
  },
  statItem: { flex: 1, alignItems: 'center', gap: 2 },
  statValue: { fontSize: FontSize.base, fontWeight: FontWeight.bold, color: Colors.gray[900] },
  statLabel: { fontSize: 10, color: Colors.gray[400] },

  searchWrap: {
    backgroundColor: Colors.white,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray[100],
  },
  occurrenceSection: {
    backgroundColor: Colors.white,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray[100],
  },
  occurrenceSectionTitle: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    color: Colors.gray[500],
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  occurrenceScroll: {
    paddingHorizontal: Spacing.lg,
    gap: Spacing.sm,
  },
  occurrenceChip: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.gray[200],
    backgroundColor: Colors.gray[50],
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    minWidth: 176,
  },
  occurrenceChipActive: {
    backgroundColor: Colors.brand[50] ?? '#EEF2FF',
    borderColor: Colors.brand[300] ?? Colors.brand[200],
  },
  occurrenceChipTitle: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Colors.gray[800],
  },
  occurrenceChipTitleActive: {
    color: Colors.brand[700] ?? Colors.brand[600],
  },
  occurrenceChipMeta: {
    marginTop: 4,
    fontSize: FontSize.xs,
    color: Colors.gray[500],
  },
  occurrenceChipMetaActive: {
    color: Colors.brand[600] ?? Colors.brand[500],
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

  list: { padding: Spacing.lg },
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
  rowScanned: { backgroundColor: Colors.gray[50] },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.brand[100],
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  avatarScanned: { backgroundColor: Colors.gray[200] },
  avatarText: { fontSize: FontSize.base, fontWeight: FontWeight.bold, color: Colors.brand[700] },
  name: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.gray[900] },
  city: { fontSize: FontSize.xs, color: Colors.gray[400], marginTop: 2 },
  refBadge: { backgroundColor: Colors.gray[100], borderRadius: Radius.sm, paddingHorizontal: 8, paddingVertical: 4 },
  refText: { fontSize: 11, fontFamily: 'monospace', color: Colors.gray[600], letterSpacing: 0.5 },
  scannedBadge: { fontSize: 10, color: Colors.green.text ?? '#166534', fontWeight: FontWeight.semibold },

  scannerContainer: { flex: 1, backgroundColor: '#000' },
  scannerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.lg,
    backgroundColor: 'rgba(0,0,0,0.8)',
  },
  scannerClose: { width: 48, height: 40, justifyContent: 'center', alignItems: 'flex-start' },
  scannerCloseText: { fontSize: FontSize.sm, color: Colors.white, fontWeight: FontWeight.semibold },
  scannerTitle: { fontSize: FontSize.base, fontWeight: FontWeight.bold, color: Colors.white },
  scannerOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center' },
  scannerFrame: {
    width: 240,
    height: 240,
    borderWidth: 3,
    borderColor: Colors.brand[400],
    borderRadius: 16,
    backgroundColor: 'transparent',
  },
  scannerHint: {
    color: Colors.white,
    fontSize: FontSize.sm,
    marginTop: Spacing.lg,
    textShadowColor: '#000',
    textShadowRadius: 4,
    textShadowOffset: { width: 0, height: 1 },
  },
  scanResultWrap: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: Spacing.xl,
    backgroundColor: 'rgba(0,0,0,0.85)',
  },
  scanResultCard: { borderRadius: Radius.lg, padding: Spacing.xl, alignItems: 'center', gap: Spacing.sm },
  scanResultValid: { backgroundColor: '#dcfce7' },
  scanResultWarning: { backgroundColor: '#fef9c3' },
  scanResultInvalid: { backgroundColor: '#fee2e2' },
  scanResultTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.gray[900] },
  scanResultMsg: { fontSize: FontSize.sm, color: Colors.gray[600], textAlign: 'center' },
  scanAgainBtn: {
    marginTop: Spacing.md,
    backgroundColor: Colors.brand[500],
    borderRadius: Radius.lg,
    paddingVertical: Spacing.md,
    alignItems: 'center',
  },
  scanAgainText: { color: Colors.white, fontWeight: FontWeight.semibold, fontSize: FontSize.base },
  scanningWrap: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
})
