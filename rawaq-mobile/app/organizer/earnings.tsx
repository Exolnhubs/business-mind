import { useEffect, useState } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl, Alert, TextInput,
  Modal, KeyboardAvoidingView, Platform,
} from 'react-native'
import { useRouter } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/auth-context'
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadow } from '@/theme'

interface Wallet {
  balance: number
  total_earned: number
  total_withdrawn: number
  currency: string
}

interface LedgerEntry {
  id: string
  type: 'credit' | 'debit'
  reason: string
  amount: number
  balance_after: number
  note: string | null
  created_at: string
}

interface Payout {
  id: string
  amount: number
  status: string
  bank_name: string | null
  requested_at: string
}

const REASON_LABELS: Record<string, string> = {
  tip:             '💝 Tip',
  ticket_sale:     '🎟️ Ticket sale',
  refund_deducted: '↩️ Refund',
  payout:          '🏦 Payout',
  adjustment:      '⚙️ Adjustment',
}

const STATUS_COLORS: Record<string, string> = {
  completed:  '#15803d',
  pending:    '#d97706',
  processing: '#2563eb',
  failed:     '#dc2626',
}

export default function EarningsScreen() {
  const { user } = useAuth()
  const router   = useRouter()

  const [wallet,   setWallet]   = useState<Wallet | null>(null)
  const [ledger,   setLedger]   = useState<LedgerEntry[]>([])
  const [payouts,  setPayouts]  = useState<Payout[]>([])
  const [loading,  setLoading]  = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  // Payout modal
  const [showModal,   setShowModal]   = useState(false)
  const [payoutAmt,   setPayoutAmt]   = useState('')
  const [bankName,    setBankName]    = useState('')
  const [iban,        setIban]        = useState('')
  const [submitting,  setSubmitting]  = useState(false)

  async function load(isRefresh = false) {
    if (!user) return
    if (isRefresh) setRefreshing(true); else setLoading(true)

    const [{ data: walletData }, { data: ledgerData, error: ledgerErr }, { data: payoutsData }] =
      await Promise.all([
        supabase
          .from('organizer_wallet')
          .select('*')
          .eq('organizer_id', user.id)
          .maybeSingle(),
        supabase
          .from('wallet_ledger')
          .select('id, type, reason, amount, balance_after, note, created_at')
          .eq('organizer_id', user.id)
          .order('created_at', { ascending: false })
          .limit(30),
        supabase
          .from('payouts')
          .select('id, amount, status, bank_name, requested_at')
          .eq('organizer_id', user.id)
          .order('requested_at', { ascending: false })
          .limit(10),
      ])

    setWallet(walletData ?? { balance: 0, total_earned: 0, total_withdrawn: 0, currency: 'SAR' })
    setLedger(ledgerErr ? [] : (ledgerData ?? []))
    setPayouts(payoutsData ?? [])

    if (isRefresh) setRefreshing(false); else setLoading(false)
  }

  useEffect(() => { load() }, [user])

  async function requestPayout() {
    const amount = parseFloat(payoutAmt)
    if (!amount || amount <= 0) {
      Alert.alert('Invalid amount', 'Please enter a valid amount.')
      return
    }
    if (amount > (wallet?.balance ?? 0)) {
      Alert.alert('Insufficient balance', `Available: ${wallet?.balance ?? 0} SAR`)
      return
    }

    setSubmitting(true)
    const { data, error } = await supabase
      .from('payouts')
      .insert({
        organizer_id: user!.id,
        amount,
        bank_name:    bankName || null,
        iban:         iban     || null,
        status:       'completed',   // simulated: instant
        processed_at: new Date().toISOString(),
        gateway_ref:  `sim_payout_${Date.now()}`,
        is_simulated: true,
      })
      .select()
      .single()

    setSubmitting(false)
    setShowModal(false)
    setPayoutAmt(''); setBankName(''); setIban('')

    if (error) {
      Alert.alert('Error', error.message)
    } else {
      Alert.alert('Payout processed', `${amount} SAR has been simulated as withdrawn.`)
      load(true)
    }
  }

  const fmt = (n: number) => `${n.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} SAR`

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={Colors.brand[500]} />
      </View>
    )
  }

  return (
    <View style={{ flex: 1, backgroundColor: Colors.gray[50] }}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={Colors.brand[500]} />}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Earnings</Text>
        </View>

        {/* Wallet cards */}
        <View style={styles.statsRow}>
          <View style={[styles.statCard, styles.statHighlight]}>
            <Text style={styles.statIcon}>💰</Text>
            <Text style={[styles.statValue, { color: Colors.brand[700] }]}>{fmt(wallet?.balance ?? 0)}</Text>
            <Text style={styles.statLabel}>Available</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statIcon}>📈</Text>
            <Text style={styles.statValue}>{fmt(wallet?.total_earned ?? 0)}</Text>
            <Text style={styles.statLabel}>Total Earned</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statIcon}>🏦</Text>
            <Text style={styles.statValue}>{fmt(wallet?.total_withdrawn ?? 0)}</Text>
            <Text style={styles.statLabel}>Withdrawn</Text>
          </View>
        </View>

        {/* Payout button */}
        <TouchableOpacity
          style={[styles.payoutBtn, (wallet?.balance ?? 0) <= 0 && styles.payoutBtnDisabled]}
          disabled={(wallet?.balance ?? 0) <= 0}
          onPress={() => setShowModal(true)}
        >
          <Text style={styles.payoutBtnText}>Withdraw Funds</Text>
        </TouchableOpacity>

        {/* Ledger */}
        <Text style={styles.sectionTitle}>Transaction History</Text>
        {ledger.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={{ fontSize: 32 }}>📭</Text>
            <Text style={styles.emptyText}>No transactions yet.</Text>
            <Text style={styles.emptySubText}>Revenue from donations and ticket sales will appear here.</Text>
          </View>
        ) : (
          <View style={styles.card}>
            {ledger.map((entry, i) => (
              <View key={entry.id} style={[styles.ledgerRow, i > 0 && styles.borderTop]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.ledgerReason}>{REASON_LABELS[entry.reason] ?? entry.reason}</Text>
                  {entry.note && <Text style={styles.ledgerNote}>{entry.note}</Text>}
                  <Text style={styles.ledgerDate}>{new Date(entry.created_at).toLocaleDateString()}</Text>
                </View>
                <Text style={[styles.ledgerAmount, { color: entry.type === 'credit' ? '#15803d' : '#dc2626' }]}>
                  {entry.type === 'credit' ? '+' : '-'}{fmt(entry.amount)}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Payout history */}
        {payouts.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Payout History</Text>
            <View style={styles.card}>
              {payouts.map((p, i) => (
                <View key={p.id} style={[styles.ledgerRow, i > 0 && styles.borderTop]}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.ledgerReason}>{fmt(p.amount)}</Text>
                    {p.bank_name && <Text style={styles.ledgerNote}>{p.bank_name}</Text>}
                    <Text style={styles.ledgerDate}>{new Date(p.requested_at).toLocaleDateString()}</Text>
                  </View>
                  <Text style={[styles.statusBadge, { color: STATUS_COLORS[p.status] ?? Colors.gray[500] }]}>
                    {p.status}
                  </Text>
                </View>
              ))}
            </View>
          </>
        )}
      </ScrollView>

      {/* Payout modal */}
      <Modal visible={showModal} animationType="slide" transparent onRequestClose={() => setShowModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Withdraw Funds</Text>
            <Text style={styles.modalSub}>Available: {fmt(wallet?.balance ?? 0)}</Text>

            <Text style={styles.inputLabel}>Amount (SAR) *</Text>
            <TextInput
              style={styles.input}
              value={payoutAmt}
              onChangeText={setPayoutAmt}
              keyboardType="decimal-pad"
              placeholder={`Max ${wallet?.balance ?? 0}`}
              placeholderTextColor={Colors.gray[400]}
            />
            <Text style={styles.inputLabel}>Bank Name</Text>
            <TextInput
              style={styles.input}
              value={bankName}
              onChangeText={setBankName}
              placeholder="Al Rajhi Bank"
              placeholderTextColor={Colors.gray[400]}
            />
            <Text style={styles.inputLabel}>IBAN</Text>
            <TextInput
              style={styles.input}
              value={iban}
              onChangeText={setIban}
              placeholder="SA00 0000 0000 0000 0000 0000"
              placeholderTextColor={Colors.gray[400]}
              autoCapitalize="characters"
            />

            <Text style={styles.simulatedNote}>
              ⚠️ Simulated — no real bank transfer will occur.
            </Text>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.confirmBtn, (!payoutAmt || submitting) && styles.confirmBtnDisabled]}
                onPress={requestPayout}
                disabled={!payoutAmt || submitting}
              >
                {submitting
                  ? <ActivityIndicator color={Colors.white} />
                  : <Text style={styles.confirmBtnText}>Confirm</Text>
                }
              </TouchableOpacity>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowModal(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  centered:     { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content:      { paddingBottom: Spacing['4xl'] },
  header:       { flexDirection: 'row', alignItems: 'center', gap: Spacing.lg, padding: Spacing.lg, paddingTop: Spacing['3xl'] },
  backBtn:      {},
  backText:     { fontSize: FontSize.sm, color: Colors.brand[600], fontWeight: FontWeight.medium },
  title:        { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.gray[900] },
  statsRow:     { flexDirection: 'row', gap: Spacing.sm, paddingHorizontal: Spacing.lg, marginBottom: Spacing.md },
  statCard:     { flex: 1, backgroundColor: Colors.white, borderRadius: Radius.lg, padding: Spacing.md, alignItems: 'center', ...Shadow.card },
  statHighlight:{ borderWidth: 1.5, borderColor: Colors.brand[300], backgroundColor: Colors.brand[50] },
  statIcon:     { fontSize: 20, marginBottom: 2 },
  statValue:    { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.gray[900], textAlign: 'center' },
  statLabel:    { fontSize: 10, color: Colors.gray[500], marginTop: 2, textAlign: 'center' },
  payoutBtn:    { marginHorizontal: Spacing.lg, backgroundColor: Colors.brand[500], borderRadius: Radius.lg, paddingVertical: Spacing.md, alignItems: 'center', marginBottom: Spacing.xl },
  payoutBtnDisabled: { opacity: 0.4 },
  payoutBtnText:{ color: Colors.white, fontWeight: FontWeight.semibold, fontSize: FontSize.base },
  sectionTitle: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, color: Colors.gray[500], textTransform: 'uppercase', letterSpacing: 0.8, paddingHorizontal: Spacing.lg, marginBottom: Spacing.sm },
  card:         { marginHorizontal: Spacing.lg, backgroundColor: Colors.white, borderRadius: Radius.lg, overflow: 'hidden', marginBottom: Spacing.xl, ...Shadow.card },
  emptyBox:     { marginHorizontal: Spacing.lg, alignItems: 'center', padding: Spacing['3xl'], backgroundColor: Colors.white, borderRadius: Radius.lg, marginBottom: Spacing.xl },
  emptyText:    { fontSize: FontSize.base, fontWeight: FontWeight.semibold, color: Colors.gray[700], marginTop: Spacing.sm },
  emptySubText: { fontSize: FontSize.sm, color: Colors.gray[400], textAlign: 'center', marginTop: Spacing.xs },
  ledgerRow:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md },
  borderTop:    { borderTopWidth: 1, borderTopColor: Colors.gray[50] },
  ledgerReason: { fontSize: FontSize.sm, color: Colors.gray[800], fontWeight: FontWeight.medium },
  ledgerNote:   { fontSize: FontSize.xs, color: Colors.gray[400], marginTop: 2 },
  ledgerDate:   { fontSize: FontSize.xs, color: Colors.gray[400], marginTop: 2 },
  ledgerAmount: { fontSize: FontSize.sm, fontWeight: FontWeight.bold },
  statusBadge:  { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, textTransform: 'capitalize' },
  // Modal
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  modalSheet:   { backgroundColor: Colors.white, borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl, padding: Spacing['2xl'], paddingBottom: Spacing['4xl'] },
  modalTitle:   { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.gray[900], marginBottom: 4 },
  modalSub:     { fontSize: FontSize.sm, color: Colors.gray[500], marginBottom: Spacing.xl },
  inputLabel:   { fontSize: FontSize.sm, fontWeight: FontWeight.medium, color: Colors.gray[700], marginBottom: 6 },
  input:        { borderWidth: 1, borderColor: Colors.gray[200], borderRadius: Radius.lg, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, fontSize: FontSize.base, color: Colors.gray[900], marginBottom: Spacing.lg },
  simulatedNote:{ fontSize: FontSize.xs, color: Colors.amber ?? '#d97706', marginBottom: Spacing.xl, textAlign: 'center' },
  modalActions: { gap: Spacing.sm },
  confirmBtn:   { backgroundColor: Colors.brand[500], borderRadius: Radius.lg, paddingVertical: Spacing.md, alignItems: 'center' },
  confirmBtnDisabled: { opacity: 0.5 },
  confirmBtnText:     { color: Colors.white, fontWeight: FontWeight.semibold, fontSize: FontSize.base },
  cancelBtn:    { borderWidth: 1, borderColor: Colors.gray[200], borderRadius: Radius.lg, paddingVertical: Spacing.md, alignItems: 'center' },
  cancelBtnText:{ color: Colors.gray[600], fontWeight: FontWeight.medium, fontSize: FontSize.base },
})

