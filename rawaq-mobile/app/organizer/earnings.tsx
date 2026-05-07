import { useEffect, useState, useRef } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl, Alert, TextInput,
  Modal, KeyboardAvoidingView, Platform,
} from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { apiPost } from '@/lib/api'
import { useAuth } from '@/contexts/auth-context'
import { useLocale } from '@/contexts/locale-context'
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadow } from '@/theme'
import { TicketFlipLoader } from '@/components/ui/TicketFlipLoader'

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

interface BankAccount {
  id: string
  bank_name: string
  bank_name_ar: string | null
  account_holder_name: string
  iban: string
  swift_code: string | null
  country: string
  is_verified: boolean
}

const DATA_REFRESH_STALE_MS = 90_000

type EarningsCache = {
  updatedAt: number
  wallet: Wallet | null
  ledger: LedgerEntry[]
  payouts: Payout[]
  pendingPayout: Payout | null
  bankAccount: BankAccount | null
}

let earningsCache: EarningsCache | null = null

const REASON_LABEL_KEYS: Record<string, string> = {
  tip: 'earnings.reason.tip',
  ticket_sale: 'earnings.reason.ticket_sale',
  refund_deducted: 'earnings.reason.refund_deducted',
  payout: 'earnings.reason.payout',
  adjustment: 'earnings.reason.adjustment',
}

const STATUS_COLORS: Record<string, string> = {
  completed: '#15803d',
  pending: '#d97706',
  processing: '#2563eb',
  failed: '#dc2626',
}

type ModalMode = 'payout' | 'bank_account'

export default function EarningsScreen() {
  const { user } = useAuth()
  const { t, locale } = useLocale()
  const router = useRouter()
  const insets = useSafeAreaInsets()

  const [wallet, setWallet] = useState<Wallet | null>(null)
  const [ledger, setLedger] = useState<LedgerEntry[]>([])
  const [payouts, setPayouts] = useState<Payout[]>([])
  const [pendingPayout, setPendingPayout] = useState<Payout | null>(null)
  const [bankAccount, setBankAccount] = useState<BankAccount | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const hasLoadedOnce = useRef(false)

  // Modal state
  const [modalMode, setModalMode] = useState<ModalMode>('payout')
  const [showModal, setShowModal] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // Payout form
  const [payoutAmt, setPayoutAmt] = useState('')

  // Bank account form
  const [bankForm, setBankForm] = useState({
    bank_name: '',
    bank_name_ar: '',
    account_holder_name: '',
    iban: '',
    swift_code: '',
    country: 'SA',
  })

  useEffect(() => {
    if (!loading) {
      earningsCache = {
        updatedAt: earningsCache?.updatedAt ?? Date.now(),
        wallet,
        ledger,
        payouts,
        pendingPayout,
        bankAccount,
      }
    }
  }, [bankAccount, ledger, loading, payouts, pendingPayout, wallet])

  async function load(isRefresh = false) {
    if (!user) return
    const now = Date.now()
    const canReuseCache =
      !isRefresh &&
      earningsCache &&
      now - earningsCache.updatedAt < DATA_REFRESH_STALE_MS

    if (canReuseCache) {
      const cache = earningsCache
      if (!cache) return
      setWallet(cache.wallet)
      setLedger(cache.ledger)
      setPayouts(cache.payouts)
      setBankAccount(cache.bankAccount)
      setPendingPayout(cache.pendingPayout)
      setLoading(false)
      setRefreshing(false)
      return
    }

    if (isRefresh) setRefreshing(true); else if (!hasLoadedOnce.current) setLoading(true)

    const [
      { data: walletData },
      { data: ledgerData, error: ledgerErr },
      { data: payoutsData },
      { data: bankData },
      { data: pendingData },
    ] = await Promise.all([
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
      supabase
        .from('organizer_bank_accounts')
        .select('*')
        .eq('organizer_id', user.id)
        .maybeSingle(),
      supabase
        .from('payouts')
        .select('id, amount, status, requested_at')
        .eq('organizer_id', user.id)
        .in('status', ['pending', 'processing'])
        .order('requested_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])

    const nextWallet = walletData ?? { balance: 0, total_earned: 0, total_withdrawn: 0, currency: 'SAR' }
    const nextLedger = ledgerErr ? [] : (ledgerData ?? [])
    const nextPayouts = payoutsData ?? []
    const nextBankAccount = bankData ?? null
    const nextPendingPayout = (pendingData as Payout | null) ?? null

    setWallet(nextWallet)
    setLedger(nextLedger)
    setPayouts(nextPayouts)
    setBankAccount(nextBankAccount)
    setPendingPayout(nextPendingPayout)
    earningsCache = {
      updatedAt: now,
      wallet: nextWallet,
      ledger: nextLedger,
      payouts: nextPayouts,
      pendingPayout: nextPendingPayout,
      bankAccount: nextBankAccount,
    }

    hasLoadedOnce.current = true
    if (isRefresh) setRefreshing(false); else setLoading(false)
  }

  useEffect(() => { load() }, [user])

  function openWithdrawModal() {
    if (!bankAccount) {
      setBankForm({
        bank_name: '',
        bank_name_ar: '',
        account_holder_name: '',
        iban: '',
        swift_code: '',
        country: 'SA',
      })
      setModalMode('bank_account')
    } else {
      setPayoutAmt('')
      setModalMode('payout')
    }
    setShowModal(true)
  }

  function openEditBankAccount() {
    setBankForm({
      bank_name: bankAccount?.bank_name ?? '',
      bank_name_ar: bankAccount?.bank_name_ar ?? '',
      account_holder_name: bankAccount?.account_holder_name ?? '',
      iban: bankAccount?.iban ?? '',
      swift_code: bankAccount?.swift_code ?? '',
      country: bankAccount?.country ?? 'SA',
    })
    setModalMode('bank_account')
    setShowModal(true)
  }

  async function saveBankAccount() {
    if (!bankForm.bank_name.trim() || !bankForm.account_holder_name.trim() || !bankForm.iban.trim()) {
      Alert.alert(t('earnings.missing_fields_title'), t('earnings.missing_fields_body'))
      return
    }

    setSubmitting(true)
    const { data, error } = await apiPost<{ bank_account: BankAccount }>('/api/organizer/bank-account', {
      bank_name: bankForm.bank_name.trim(),
      bank_name_ar: bankForm.bank_name_ar.trim() || null,
      account_holder_name: bankForm.account_holder_name.trim(),
      iban: bankForm.iban.trim(),
      swift_code: bankForm.swift_code.trim() || null,
      country: bankForm.country.trim() || 'SA',
    })
    setSubmitting(false)

    if (error) {
      Alert.alert(t('plans.error_title'), error)
      return
    }
    if (!data?.bank_account) {
      return
    }

    setBankAccount(data.bank_account)
    setShowModal(false)
    Alert.alert(t('common.saved'), t('earnings.saved_bank_body'))
  }

  async function requestPayout() {
    const amount = parseFloat(payoutAmt)
    if (!amount || amount <= 0) {
      Alert.alert(t('earnings.invalid_amount_title'), t('earnings.invalid_amount_body'))
      return
    }
    if (amount > availableToWithdraw) {
      Alert.alert(t('earnings.insufficient_balance_title'), t('earnings.available_to_withdraw').replace('{amount}', `${availableToWithdraw} ${wallet?.currency ?? 'SAR'}`))
      return
    }

    setSubmitting(true)
    const { data, error } = await apiPost('/api/organizer/payouts', { amount })
    setSubmitting(false)

    if (error === 'Bank account required') {
      setBankAccount(null)
      Alert.alert(
        t('earnings.bank_required_title'),
        t('earnings.bank_required_body'),
        [{ text: t('earnings.add_now'), onPress: openWithdrawModal }, { text: t('common.cancel'), style: 'cancel' }],
      )
      return
    }

    if (error) {
      Alert.alert(t('plans.error_title'), error)
      return
    }
    if (!data) {
      return
    }

    setShowModal(false)
    setPayoutAmt('')

    Alert.alert(
      t('earnings.withdrawal_requested_title'),
      t('earnings.withdrawal_requested_body'),
    )
    load(true)
  }

  const fmt = (n: number) =>
    `${n.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${wallet?.currency ?? 'SAR'}`

  if (loading) {
    return (
      <SafeAreaView edges={['top']} style={styles.safeArea}>
        <View style={styles.centered}>
          <TicketFlipLoader size="md" />
        </View>
      </SafeAreaView>
    )
  }

  const pendingAmount = pendingPayout?.amount ?? 0
  const availableToWithdraw = Math.max(0, (wallet?.balance ?? 0) - pendingAmount)
  const headerTopSpacing = Math.max(Spacing.sm, Math.min(insets.top * 0.18, Spacing.md))

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: headerTopSpacing }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={Colors.brand[500]} />}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backText}>{t('earnings.back')}</Text>
          </TouchableOpacity>
          <Text style={styles.title}>{t('earnings.title')}</Text>
        </View>

        {/* Wallet cards */}
        <View style={styles.statsRow}>
          <View style={[styles.statCard, styles.statHighlight]}>
            <Text style={styles.statIcon}>💰</Text>
            <Text style={[styles.statValue, { color: Colors.brand[700] }]}>{fmt(availableToWithdraw)}</Text>
            <Text style={styles.statLabel}>{t('earnings.available')}</Text>
            {pendingAmount > 0 && (
              <Text style={styles.pendingLock}>🔒 {fmt(pendingAmount)} {t('earnings.pending')}</Text>
            )}
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statIcon}>📈</Text>
            <Text style={styles.statValue}>{fmt(wallet?.total_earned ?? 0)}</Text>
            <Text style={styles.statLabel}>{t('earnings.total_earned')}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statIcon}>🏦</Text>
            <Text style={styles.statValue}>{fmt(wallet?.total_withdrawn ?? 0)}</Text>
            <Text style={styles.statLabel}>{t('earnings.withdrawn')}</Text>
          </View>
        </View>

        {/* Banking details banner / card */}
        {!bankAccount ? (
          <TouchableOpacity style={styles.bankBanner} onPress={openWithdrawModal}>
            <View style={{ flex: 1, alignItems: 'flex-start' }}>
              <Text style={styles.bankBannerTitle}>{t('earnings.add_bank_title')}</Text>
              <Text style={styles.bankBannerSub}>
                {t('earnings.add_bank_sub')}
              </Text>
            </View>
            <Text style={styles.bankBannerArrow}>→</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.bankCard}>
            <View style={{ flex: 1, alignItems: 'flex-start' }}>
              <Text style={styles.bankCardTitle}>
                {bankAccount.bank_name}
                {bankAccount.is_verified && (
                  <Text style={styles.verifiedBadge}> ✓ {t('earnings.verified')}</Text>
                )}
              </Text>
              <Text style={styles.bankCardIban}>
                {bankAccount.iban.replace(/(.{4})/g, '$1 ').trim()}
              </Text>
              <Text style={styles.bankCardHolder}>{bankAccount.account_holder_name}</Text>
            </View>
            <TouchableOpacity onPress={openEditBankAccount}>
              <Text style={styles.editLink}>{t('common.edit')}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Payout button */}
        <TouchableOpacity
          style={[
            styles.payoutBtn,
            (availableToWithdraw <= 0 || !bankAccount) && styles.payoutBtnDisabled,
          ]}
          disabled={availableToWithdraw <= 0 || !bankAccount}
          onPress={openWithdrawModal}
        >
          <Text style={styles.payoutBtnText}>
            {bankAccount ? t('earnings.withdraw_funds') : t('earnings.add_bank_first')}
          </Text>
        </TouchableOpacity>

        {/* Ledger */}
        <Text style={styles.sectionTitle}>{t('earnings.transaction_history')}</Text>
        {ledger.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={{ fontSize: 32 }}>📭</Text>
            <Text style={styles.emptyText}>{t('earnings.empty_transactions')}</Text>
            <Text style={styles.emptySubText}>{t('earnings.empty_transactions_sub')}</Text>
          </View>
        ) : (
          <View style={styles.card}>
            {ledger.map((entry, i) => (
              <View key={entry.id} style={[styles.ledgerRow, i > 0 && styles.borderTop]}>
                <View style={{ flex: 1, alignItems: 'flex-start' }}>
                  <Text style={styles.ledgerReason}>{REASON_LABEL_KEYS[entry.reason] ? t(REASON_LABEL_KEYS[entry.reason]) : entry.reason}</Text>
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
            <Text style={styles.sectionTitle}>{t('earnings.payout_history')}</Text>
            <View style={styles.card}>
              {payouts.map((p, i) => (
                <View key={p.id} style={[styles.ledgerRow, i > 0 && styles.borderTop]}>
                  <View style={{ flex: 1  }}>
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

      {/* ── Payout / Bank Account Modal ────────────────────────────────────── */}
      <Modal visible={showModal} animationType="slide" transparent onRequestClose={() => setShowModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlay}>
          <View style={styles.modalSheet}>

            {modalMode === 'payout' ? (
              <>
                <Text style={styles.modalTitle}>{t('earnings.withdraw_funds')}</Text>
                <Text style={styles.modalSub}>{t('earnings.available')}: {fmt(availableToWithdraw)}</Text>

                {bankAccount && (
                  <View style={styles.modalBankSummary}>
                    <Text style={styles.modalBankSummaryTitle}>{t('earnings.to_bank').replace('{bank}', bankAccount.bank_name)}</Text>
                    <Text style={styles.modalBankSummaryIban}>
                      {bankAccount.iban.replace(/(.{4})/g, '$1 ').trim()}
                    </Text>
                  </View>
                )}

                <Text style={styles.inputLabel}>{t('earnings.amount_label').replace('{currency}', wallet?.currency ?? 'SAR')}</Text>
                <TextInput
                  style={styles.input}
                  value={payoutAmt}
                  onChangeText={setPayoutAmt}
                  keyboardType="decimal-pad"
                  placeholder={t('earnings.max_amount').replace('{amount}', String(availableToWithdraw))}
                  placeholderTextColor={Colors.gray[400]}
                />

                <Text style={styles.payoutNote}>
                  {t('earnings.payout_note')}
                </Text>

                <View style={styles.modalActions}>
                  <TouchableOpacity
                    style={[styles.confirmBtn, (!payoutAmt || submitting) && styles.confirmBtnDisabled]}
                    onPress={requestPayout}
                    disabled={!payoutAmt || submitting}
                  >
                    {submitting
                      ? <ActivityIndicator color={Colors.white} />
                      : <Text style={styles.confirmBtnText}>{t('earnings.request_withdrawal')}</Text>
                    }
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowModal(false)}>
                    <Text style={styles.cancelBtnText}>{t('common.cancel')}</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <>
                <Text style={styles.modalTitle}>
                  {bankAccount ? t('earnings.edit_bank') : t('earnings.add_bank')}
                </Text>
                <Text style={styles.modalSub}>
                  {t('earnings.bank_modal_sub')}
                </Text>

                <Text style={styles.inputLabel}>{t('earnings.bank_name_en')}</Text>
                <TextInput
                  style={styles.input}
                  value={bankForm.bank_name}
                  onChangeText={(v) => setBankForm((f) => ({ ...f, bank_name: v }))}
                  placeholder="Al Rajhi Bank"
                  placeholderTextColor={Colors.gray[400]}
                />

                <Text style={styles.inputLabel}>{t('earnings.bank_name_ar')}</Text>
                <TextInput
                  style={[styles.input, { textAlign: 'right' }]}
                  value={bankForm.bank_name_ar}
                  onChangeText={(v) => setBankForm((f) => ({ ...f, bank_name_ar: v }))}
                  placeholder="بنك الراجحي"
                  placeholderTextColor={Colors.gray[400]}
                />

                <Text style={styles.inputLabel}>{t('earnings.account_holder')}</Text>
                <TextInput
                  style={styles.input}
                  value={bankForm.account_holder_name}
                  onChangeText={(v) => setBankForm((f) => ({ ...f, account_holder_name: v }))}
                  placeholder="Mohammed Al-Hassan"
                  placeholderTextColor={Colors.gray[400]}
                />

                <Text style={styles.inputLabel}>{t('earnings.iban')}</Text>
                <TextInput
                  style={styles.input}
                  value={bankForm.iban}
                  onChangeText={(v) => setBankForm((f) => ({ ...f, iban: v }))}
                  placeholder="SA29 0000 0000 0000 0000 0000"
                  placeholderTextColor={Colors.gray[400]}
                  autoCapitalize="characters"
                />

                <Text style={styles.inputLabel}>{t('earnings.swift')}</Text>
                <TextInput
                  style={styles.input}
                  value={bankForm.swift_code}
                  onChangeText={(v) => setBankForm((f) => ({ ...f, swift_code: v }))}
                  placeholder="RJHISARI"
                  placeholderTextColor={Colors.gray[400]}
                  autoCapitalize="characters"
                />

                <View style={styles.modalActions}>
                  <TouchableOpacity
                    style={[styles.confirmBtn, submitting && styles.confirmBtnDisabled]}
                    onPress={saveBankAccount}
                    disabled={submitting}
                  >
                    {submitting
                      ? <ActivityIndicator color={Colors.white} />
                      : <Text style={styles.confirmBtnText}>{t('earnings.save_details')}</Text>
                    }
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowModal(false)}>
                    <Text style={styles.cancelBtnText}>{t('common.cancel')}</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.gray[50] },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { paddingBottom: Spacing['4xl'] },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.lg, padding: Spacing.lg, paddingTop: Spacing.lg },
  backBtn: {},
  backText: { fontSize: FontSize.sm, color: Colors.brand[600], fontWeight: FontWeight.medium },
  title: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.gray[900] },
  statsRow: { flexDirection: 'row', gap: Spacing.sm, paddingHorizontal: Spacing.lg, marginBottom: Spacing.md },
  statCard: { flex: 1, backgroundColor: Colors.white, borderRadius: Radius.lg, padding: Spacing.md, alignItems: 'center', ...Shadow.card },
  statHighlight: { borderWidth: 1.5, borderColor: Colors.brand[300], backgroundColor: Colors.brand[50] },
  statIcon: { fontSize: 20, marginBottom: 2 },
  statValue: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.gray[900], textAlign: 'center' },
  statLabel: { fontSize: 10, color: Colors.gray[500], marginTop: 2, textAlign: 'center' },
  pendingLock: { fontSize: 9, color: '#d97706', marginTop: 3, textAlign: 'center' },
  bankBanner: { flexDirection: 'row', alignItems: 'center', marginHorizontal: Spacing.lg, marginBottom: Spacing.md, backgroundColor: '#fef3c7', borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: '#fcd34d' },
  bankBannerTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: '#92400e' },
  bankBannerSub: { fontSize: FontSize.xs, color: '#b45309', marginTop: 2 },
  bankBannerArrow: { fontSize: FontSize.lg, color: '#92400e', marginLeft: Spacing.sm },
  bankCard: { flexDirection: 'row', alignItems: 'center', marginHorizontal: Spacing.lg, marginBottom: Spacing.md, backgroundColor: Colors.white, borderRadius: Radius.lg, padding: Spacing.md, ...Shadow.card },
  bankCardTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.gray[900] },
  bankCardIban: { fontSize: FontSize.xs, color: Colors.gray[500], marginTop: 2, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  bankCardHolder: { fontSize: FontSize.xs, color: Colors.gray[500], marginTop: 2 },
  verifiedBadge: { color: '#15803d', fontSize: FontSize.xs, fontWeight: FontWeight.semibold },
  editLink: { fontSize: FontSize.sm, color: Colors.brand[600], fontWeight: FontWeight.medium },
  payoutBtn: { marginHorizontal: Spacing.lg, backgroundColor: Colors.brand[500], borderRadius: Radius.lg, paddingVertical: Spacing.md, alignItems: 'center', marginBottom: Spacing.xl },
  payoutBtnDisabled: { opacity: 0.4 },
  payoutBtnText: { color: Colors.white, fontWeight: FontWeight.semibold, fontSize: FontSize.base },
  sectionTitle: { fontSize: FontSize.xs, textAlign: 'left', fontWeight: FontWeight.semibold, color: Colors.gray[500], textTransform: 'uppercase', letterSpacing: 0.8, paddingHorizontal: Spacing.lg, marginBottom: Spacing.sm },
  card: { marginHorizontal: Spacing.lg, backgroundColor: Colors.white, borderRadius: Radius.lg, overflow: 'hidden', marginBottom: Spacing.xl, ...Shadow.card },
  emptyBox: { marginHorizontal: Spacing.lg, alignItems: 'center', padding: Spacing['3xl'], backgroundColor: Colors.white, borderRadius: Radius.lg, marginBottom: Spacing.xl },
  emptyText: { fontSize: FontSize.base, fontWeight: FontWeight.semibold, color: Colors.gray[700], marginTop: Spacing.sm },
  emptySubText: { fontSize: FontSize.sm, color: Colors.gray[400], textAlign: 'center', marginTop: Spacing.xs },
  ledgerRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md },
  borderTop: { borderTopWidth: 1, borderTopColor: Colors.gray[50] },
  ledgerReason: { fontSize: FontSize.sm, color: Colors.gray[800], fontWeight: FontWeight.medium },
  ledgerNote: { fontSize: FontSize.xs, color: Colors.gray[400], marginTop: 2 },
  ledgerDate: { fontSize: FontSize.xs, color: Colors.gray[400], marginTop: 2 },
  ledgerAmount: { fontSize: FontSize.sm, fontWeight: FontWeight.bold },
  statusBadge: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, textTransform: 'capitalize' },
  modalOverlay: { flex: 1, justifyContent: 'flex-end',  backgroundColor: 'rgba(0,0,0,0.4)' },
  modalSheet: { backgroundColor: Colors.white,  borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl, padding: Spacing['2xl'], paddingBottom: Spacing['4xl'] },
  modalTitle: { fontSize: FontSize.lg,  fontWeight: FontWeight.bold, textAlign: 'left', color: Colors.gray[900], marginBottom: 4 },
  modalSub: { fontSize: FontSize.sm, color: Colors.gray[500], textAlign: 'left', marginBottom: Spacing.xl },
  modalBankSummary: { backgroundColor: Colors.gray[50], textAlign: 'left', borderRadius: Radius.md, padding: Spacing.md, marginBottom: Spacing.lg },
  modalBankSummaryTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.gray[800] },
  modalBankSummaryIban: { fontSize: FontSize.xs, color: Colors.gray[500], marginTop: 2, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  inputLabel: { fontSize: FontSize.sm, fontWeight: FontWeight.medium, textAlign: 'left', color: Colors.gray[700], marginBottom: 6 },
  input: { borderWidth: 1, borderColor: Colors.gray[200], borderRadius: Radius.lg, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, fontSize: FontSize.base, color: Colors.gray[900], marginBottom: Spacing.lg },
  payoutNote: { fontSize: FontSize.xs, color: Colors.gray[400], marginBottom: Spacing.xl, textAlign: 'center' },
  modalActions: { gap: Spacing.sm },
  confirmBtn: { backgroundColor: Colors.brand[500], borderRadius: Radius.lg, paddingVertical: Spacing.md, alignItems: 'center' },
  confirmBtnDisabled: { opacity: 0.5 },
  confirmBtnText: { color: Colors.white, fontWeight: FontWeight.semibold, fontSize: FontSize.base },
  cancelBtn: { borderWidth: 1, borderColor: Colors.gray[200], borderRadius: Radius.lg, paddingVertical: Spacing.md, alignItems: 'center' },
  cancelBtnText: { color: Colors.gray[600], fontWeight: FontWeight.medium, fontSize: FontSize.base },
})
