import { useEffect, useState, useCallback, useRef } from 'react'
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl, TextInput, Modal, Alert,
} from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter, useLocalSearchParams } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { apiPost } from '@/lib/api'
import { useAuth } from '@/contexts/auth-context'
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/theme'

// expo-camera is optional (not bundled in Expo Go on Android SDK 54+)
let CameraView: any = null
let useCameraPermissions: any = null
try {
  const cam = require('expo-camera')
  CameraView = cam.CameraView
  useCameraPermissions = cam.useCameraPermissions
} catch {}

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
  event_title?: string
  scanned_at?: string
}

export default function AttendeesScreen() {
  const router = useRouter()
  const { user } = useAuth()
  const { eventId, title } = useLocalSearchParams<{ eventId: string; title: string }>()
  const insets = useSafeAreaInsets()

  const [attendees, setAttendees]   = useState<Attendee[]>([])
  const [loading, setLoading]       = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [search, setSearch]         = useState('')

  // QR scanner
  const [scannerOpen, setScannerOpen]   = useState(false)
  const [scanning, setScanning]         = useState(false)
  const [scanResult, setScanResult]     = useState<ScanResult | null>(null)
  const lastScannedRef                  = useRef<string | null>(null)

  // Camera permissions (only if expo-camera is available)
  const permHook = useCameraPermissions ? useCameraPermissions() : [null, null]
  const [permission, requestPermission] = permHook as [{ granted: boolean } | null, (() => Promise<any>) | null]

  const load = useCallback(async () => {
    if (!eventId || !user) return

    // Confirm event ownership first (direct Supabase — organizer reads own events)
    const { data: event } = await supabase
      .from('events')
      .select('id')
      .eq('id', eventId)
      .eq('organizer_id', user.id)
      .single()

    if (!event) {
      router.back()
      return
    }

    const { data } = await supabase
      .from('bookings')
      .select('id, status, created_at, scanned_at, ticket_id, user:profiles!user_id(display_name, avatar_url, city)')
      .eq('event_id', eventId)
      .order('created_at', { ascending: true })

    setAttendees((data ?? []) as unknown as Attendee[])
    setLoading(false)
    setRefreshing(false)
  }, [eventId, user, router])

  useEffect(() => { load() }, [load])

  const confirmed    = attendees.filter((a) => a.status === 'confirmed')
  const scannedCount = confirmed.filter((a) => a.scanned_at).length
  const filtered     = search.trim()
    ? confirmed.filter((a) =>
        a.user?.display_name.toLowerCase().includes(search.toLowerCase()) ||
        a.id.slice(-8).toLowerCase().includes(search.toLowerCase()) ||
        (a.ticket_id ?? '').toLowerCase().includes(search.toLowerCase())
      )
    : confirmed
  const headerTopSpacing = Math.max(Spacing.sm, Math.min(insets.top * 0.18, Spacing.md))

  // ── QR scan handler ────────────────────────────────────────────────────────

  async function handleBarcodeScanned({ data }: { data: string }) {
    if (scanning || lastScannedRef.current === data) return
    lastScannedRef.current = data
    setScanning(true)
    setScanResult(null)

    // Extract ticket_id from URL or use raw value
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
      // Update local list if valid
      if (result.valid && result.booking_id) {
        setAttendees((prev) =>
          prev.map((a) =>
            a.id === result.booking_id ? { ...a, scanned_at: result.scanned_at ?? new Date().toISOString() } : a
          )
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
    if (!CameraView) {
      Alert.alert('Not available', 'QR scanning requires a standalone build (not Expo Go on Android).')
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

  // ── Loading ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={Colors.brand[500]} />
      </View>
    )
  }

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: headerTopSpacing + Spacing.sm }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle} numberOfLines={1}>{decodeURIComponent(title ?? 'Attendees')}</Text>
          <Text style={styles.headerSub}>
            {confirmed.length} confirmed · {scannedCount} scanned
          </Text>
        </View>
        <TouchableOpacity style={styles.scanBtn} onPress={openScanner}>
          <Text style={styles.scanBtnText}>Scan QR</Text>
        </TouchableOpacity>
      </View>

      {/* Analytics bar */}
      <View style={styles.statsBar}>
        {[
          { label: 'Confirmed', value: confirmed.length, icon: '✅' },
          { label: 'Scanned', value: scannedCount, icon: '📱' },
          { label: 'Attendance', value: confirmed.length > 0 ? `${Math.round((scannedCount / confirmed.length) * 100)}%` : '—', icon: '📊' },
        ].map((s) => (
          <View key={s.label} style={styles.statItem}>
            <Text style={styles.statIcon}>{s.icon}</Text>
            <Text style={styles.statValue}>{s.value}</Text>
            <Text style={styles.statLabel}>{s.label}</Text>
          </View>
        ))}
      </View>

      {/* Search */}
      <View style={styles.searchWrap}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name, ref or ticket ID…"
          placeholderTextColor={Colors.gray[400]}
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
        />
      </View>

      {filtered.length === 0 ? (
        <View style={styles.centered}>
          <Text style={{ fontSize: 36, marginBottom: 8 }}>🎟</Text>
          <Text style={styles.emptyText}>
            {search ? 'No match found.' : 'No confirmed attendees yet.'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); load() }}
              tintColor={Colors.brand[500]}
            />
          }
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          renderItem={({ item }) => (
            <View style={[styles.row, item.scanned_at && styles.rowScanned]}>
              {/* Avatar initial */}
              <View style={[styles.avatar, item.scanned_at && styles.avatarScanned]}>
                <Text style={styles.avatarText}>
                  {(item.user?.display_name ?? '?')[0].toUpperCase()}
                </Text>
              </View>

              {/* Info */}
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{item.user?.display_name ?? 'Unknown'}</Text>
                {item.user?.city ? (
                  <Text style={styles.city}>{item.user.city}</Text>
                ) : null}
              </View>

              {/* Status */}
              <View style={{ alignItems: 'flex-end', gap: 4 }}>
                <View style={styles.refBadge}>
                  <Text style={styles.refText}>{item.id.slice(-8).toUpperCase()}</Text>
                </View>
                {item.scanned_at ? (
                  <Text style={styles.scannedBadge}>✓ Scanned</Text>
                ) : null}
              </View>
            </View>
          )}
        />
      )}

      {/* QR Scanner Modal */}
      <Modal
        visible={scannerOpen}
        animationType="slide"
        onRequestClose={() => setScannerOpen(false)}
      >
        <View style={styles.scannerContainer}>
          {/* Modal Header */}
          <View style={[styles.scannerHeader, { paddingTop: Math.max(Spacing.xl, insets.top + Spacing.lg) }]}>
            <TouchableOpacity onPress={() => setScannerOpen(false)} style={styles.scannerClose}>
              <Text style={styles.scannerCloseText}>✕</Text>
            </TouchableOpacity>
            <Text style={styles.scannerTitle}>Scan QR Ticket</Text>
            <View style={{ width: 40 }} />
          </View>

          {/* Camera */}
          {CameraView && !scanResult ? (
            <CameraView
              style={{ flex: 1 }}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={scanning ? undefined : handleBarcodeScanned}
            />
          ) : null}

          {/* Overlay hint */}
          {!scanResult && (
            <View style={styles.scannerOverlay} pointerEvents="none">
              <View style={styles.scannerFrame} />
              <Text style={styles.scannerHint}>Point at an attendee's QR ticket</Text>
            </View>
          )}

          {/* Scan result card */}
          {scanResult && (
            <View style={styles.scanResultWrap}>
              <View style={[
                styles.scanResultCard,
                scanResult.valid
                  ? styles.scanResultValid
                  : scanResult.already_scanned
                  ? styles.scanResultWarning
                  : styles.scanResultInvalid,
              ]}>
                <Text style={styles.scanResultIcon}>
                  {scanResult.valid ? '✅' : scanResult.already_scanned ? '⚠️' : '❌'}
                </Text>
                <Text style={styles.scanResultTitle}>
                  {scanResult.valid ? 'Valid Ticket' : scanResult.already_scanned ? 'Already Scanned' : 'Invalid Ticket'}
                </Text>
                {scanResult.message ? (
                  <Text style={styles.scanResultMsg}>{scanResult.message}</Text>
                ) : null}
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
  centered:  { flex: 1, justifyContent: 'center', alignItems: 'center', padding: Spacing['2xl'] },
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
  backBtn:    { padding: 4 },
  backText:   { fontSize: 22, color: Colors.gray[600] },
  headerTitle:{ fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.gray[900] },
  headerSub:  { fontSize: FontSize.xs, color: Colors.gray[500], marginTop: 2 },
  scanBtn:    { backgroundColor: Colors.brand[500], borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm },
  scanBtnText:{ color: Colors.white, fontSize: FontSize.sm, fontWeight: FontWeight.semibold },

  statsBar: {
    flexDirection: 'row',
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray[100],
    paddingVertical: Spacing.sm,
  },
  statItem:  { flex: 1, alignItems: 'center', gap: 2 },
  statIcon:  { fontSize: 14 },
  statValue: { fontSize: FontSize.base, fontWeight: FontWeight.bold, color: Colors.gray[900] },
  statLabel: { fontSize: 10, color: Colors.gray[400] },

  searchWrap: {
    backgroundColor: Colors.white,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray[100],
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

  list:      { padding: Spacing.lg },
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
  refText:  { fontSize: 11, fontFamily: 'monospace', color: Colors.gray[600], letterSpacing: 0.5 },
  scannedBadge: { fontSize: 10, color: Colors.green.text ?? '#166534', fontWeight: FontWeight.semibold },

  // Scanner modal
  scannerContainer: { flex: 1, backgroundColor: '#000' },
  scannerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.lg,
    backgroundColor: 'rgba(0,0,0,0.8)',
  },
  scannerClose:     { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  scannerCloseText: { fontSize: 20, color: Colors.white },
  scannerTitle:     { fontSize: FontSize.base, fontWeight: FontWeight.bold, color: Colors.white },

  scannerOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center' },
  scannerFrame: {
    width: 240,
    height: 240,
    borderWidth: 3,
    borderColor: Colors.brand[400],
    borderRadius: 16,
    backgroundColor: 'transparent',
  },
  scannerHint: { color: Colors.white, fontSize: FontSize.sm, marginTop: Spacing.lg, textShadowColor: '#000', textShadowRadius: 4, textShadowOffset: { width: 0, height: 1 } },

  scanResultWrap: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: Spacing.xl, backgroundColor: 'rgba(0,0,0,0.85)' },
  scanResultCard: { borderRadius: Radius.lg, padding: Spacing.xl, alignItems: 'center', gap: Spacing.sm },
  scanResultValid:   { backgroundColor: '#dcfce7' },
  scanResultWarning: { backgroundColor: '#fef9c3' },
  scanResultInvalid: { backgroundColor: '#fee2e2' },
  scanResultIcon:    { fontSize: 36 },
  scanResultTitle:   { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.gray[900] },
  scanResultMsg:     { fontSize: FontSize.sm, color: Colors.gray[600], textAlign: 'center' },
  scanAgainBtn:      { marginTop: Spacing.md, backgroundColor: Colors.brand[500], borderRadius: Radius.lg, paddingVertical: Spacing.md, alignItems: 'center' },
  scanAgainText:     { color: Colors.white, fontWeight: FontWeight.semibold, fontSize: FontSize.base },

  scanningWrap: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.5)' },
})
