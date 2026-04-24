import { useEffect, useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, RefreshControl,
} from 'react-native'
import { useRouter } from 'expo-router'
import * as WebBrowser from 'expo-web-browser'
import { apiGet, apiPost } from '@/lib/api'
import { useAuth } from '@/contexts/auth-context'
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadow } from '@/theme'
import { TicketFlipLoader } from '@/components/ui/TicketFlipLoader'
import type { ResolvedPlanDefinition, Subscription } from '@/types/plans'

// ── Constants ─────────────────────────────────────────────────
const C_INK  = '#1c1510'
const C_GOLD = Colors.brand[500]

type Plan = ResolvedPlanDefinition
type SubscriptionResponse = {
  plan: ResolvedPlanDefinition | null
  plans: ResolvedPlanDefinition[]
  subscription: Subscription | null
  usage?: { events_created: number; month: string }
  pricing_country_code?: string | null
}

type SubscriptionPaymentResponse = {
  transaction_id?: string
  plan_id?: string
  plan_name?: string
  redirect_url?: string
  free?: boolean
}

const PLAN_FLAGSHIP: Record<string, boolean> = {
  user_premium: true,
  org_pro: true,
}

const PLAN_FEATURES: Record<string, string[]> = {
  user_free:    ['Book & attend any public event', 'Save up to 20 events', 'Community access & happenings', 'Standard discovery experience'],
  user_premium: ['Everything in Free', 'Unlimited saved events', 'Access premium-only events'],
  org_basic:    ['5 events published per month', 'Up to 50 attendees per event', 'Organizer dashboard access', '10% platform fee on revenue'],
  org_pro:      ['20 events published per month', 'Up to 200 attendees per event', 'Ticket scanner access', '6% platform fee on revenue'],
  org_elite:    ['Unlimited events published', 'Unlimited attendees per event', 'Ticket scanner access', '3% platform fee on revenue'],
}

type PlanAction = 'current' | 'upgrade' | 'downgrade'

function getPlanAction(plan: Plan, activePlanId: string, plans: Plan[]): PlanAction {
  if (plan.id === activePlanId) return 'current'
  const active = plans.find(p => p.id === activePlanId)
  if (!active) return 'upgrade'
  return plan.sort_order > active.sort_order ? 'upgrade' : 'downgrade'
}

function formatPlanAmount(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
    maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
  }).format(amount)
}

// ── Screen ─────────────────────────────────────────────────────
export default function PlansScreen() {
  const { user, profile, refreshProfile } = useAuth()
  const router = useRouter()

  const [plans,        setPlans]        = useState<Plan[]>([])
  const [currentId,    setCurrentId]    = useState<string>('')
  const [loading,      setLoading]      = useState(true)
  const [saving,       setSaving]       = useState<string | null>(null)
  const [refreshing,   setRefreshing]   = useState(false)
  const [confirmId,    setConfirmId]    = useState<string | null>(null)
  const [eventsUsed,   setEventsUsed]   = useState(0)

  const isOrganizer = profile?.role === 'organizer'

  const load = useCallback(async () => {
    if (!user || !profile) return

    const { data, error } = await apiGet<SubscriptionResponse>('/api/subscriptions')
    if (error) {
      setLoading(false)
      setRefreshing(false)
      Alert.alert('Error', error)
      return
    }

    setPlans(data?.plans ?? [])
    setCurrentId(data?.plan?.id ?? (isOrganizer ? 'org_basic' : 'user_free'))
    setEventsUsed(data?.usage?.events_created ?? 0)

    setLoading(false)
    setRefreshing(false)
  }, [user, profile, isOrganizer])

  useEffect(() => { load() }, [load])

  async function doSelectPlan(plan: Plan) {
    if (!user) return
    setSaving(plan.id)
    setConfirmId(null)
    try {
      const { data, error } = await apiPost<SubscriptionPaymentResponse>('/api/subscriptions', {
        plan_id: plan.id,
        source: 'mobile',
      })
      if (error) throw new Error(error)

      if (data?.redirect_url && data.transaction_id) {
        const browserResult = await WebBrowser.openAuthSessionAsync(
          data.redirect_url,
          'rawaq://',
        )

        const deepLinkUrl = browserResult.type === 'success' ? browserResult.url : null
        const deepLinkParams = deepLinkUrl ? new URL(deepLinkUrl).searchParams : null
        const deepLinkStatus = deepLinkParams?.get('status') ?? null
        const entity = deepLinkParams?.get('entity') ?? null
        const transactionId = deepLinkParams?.get('transaction_id') ?? data.transaction_id

        if (entity === 'subscription' && deepLinkStatus === 'success') {
          let activated = false
          for (const delay of [1500, 2500, 3500, 5000, 5000]) {
            await new Promise((resolve) => setTimeout(resolve, delay))
            const { data: statusData } = await apiGet<{
              activated: boolean
              active_subscription: { plan_id?: string | null } | null
            }>(`/api/subscriptions/status/${transactionId}`)

            if (statusData?.activated && statusData.active_subscription?.plan_id) {
              activated = true
              setCurrentId(statusData.active_subscription.plan_id)
              await refreshProfile()
              await load()
              Alert.alert('Plan updated', `You are now on the ${plan.name} plan.`)
              break
            }
          }

          if (!activated) {
            Alert.alert('Payment is processing', 'Your membership payment is being verified. Check back in a moment if your new plan is not visible yet.')
          }
          return
        }

        if (deepLinkStatus === 'failed' || browserResult.type === 'cancel') {
          Alert.alert('Payment not completed', 'Your membership payment was not completed.')
          return
        }
      }

      setCurrentId(plan.id)
      await refreshProfile()
      await load()
      Alert.alert('Plan updated', `You are now on the ${plan.name} plan.`)
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to change plan')
    } finally {
      setSaving(null)
    }
  }

  function handlePlanPress(plan: Plan, action: PlanAction) {
    if (action === 'current') return
    if (action === 'downgrade') {
      setConfirmId(plan.id)
    } else {
      const priceMsg = plan.price_amount > 0
        ? `\n\nPrice: ${formatPlanAmount(plan.price_amount)} ${plan.price_currency} / month`
        : ''
      Alert.alert(
        `Upgrade to ${plan.name}`,
        `Switch to the ${plan.name} plan?${priceMsg}`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Confirm', onPress: () => doSelectPlan(plan) },
        ],
      )
    }
  }

  if (!user) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyText}>Sign in to manage your plan.</Text>
      </View>
    )
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <TicketFlipLoader size="md" />
      </View>
    )
  }

  const activePlan = plans.find(p => p.id === currentId)
  const eventLimit = activePlan?.events_per_month ?? null
  const usagePct = eventLimit ? Math.min((eventsUsed / eventLimit) * 100, 100) : 0
  const monthLabel = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  const usageBarColor = !eventLimit
    ? C_GOLD
    : usagePct >= 100 ? Colors.red.DEFAULT
    : usagePct >= 80  ? '#f97316'
    : C_GOLD

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load() }} tintColor={C_GOLD} />
      }
    >
      {/* Back nav */}
      <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
        <Text style={styles.backText}>‹ Back</Text>
      </TouchableOpacity>

      {/* Page header */}
      <View style={styles.header}>
        <Text style={styles.title}>{isOrganizer ? 'Organizer plan' : 'Your membership'}</Text>
        <Text style={styles.subtitle}>
          {isOrganizer
            ? 'Publish more events and keep more of what you earn as you grow.'
            : 'Upgrade for unlimited saves and premium-only event access.'}
        </Text>
      </View>

      {/* Current plan status strip */}
      <View style={styles.statusStrip}>
        <View style={styles.statusRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.statusLabel}>CURRENT PLAN</Text>
            <Text style={styles.statusPlanName}>{activePlan?.name ?? '—'}</Text>
            {(activePlan?.price_amount ?? 0) === 0 && (
              <Text style={styles.statusSub}>Free · no billing</Text>
            )}
          </View>

          {/* Usage meter (organizer) */}
          {isOrganizer && (
            <View style={{ flex: 1, minWidth: 160 }}>
              <View style={styles.usageHeader}>
                <Text style={styles.usageLabel}>Events · {monthLabel}</Text>
                <Text style={[styles.usageValue, { color: usageBarColor }]}>
                  {eventsUsed}{eventLimit !== null ? ` / ${eventLimit}` : '  ∞'}
                </Text>
              </View>
              <View style={styles.progressTrack}>
                <View
                  style={[
                    styles.progressFill,
                    {
                      width: eventLimit ? `${usagePct}%` : '100%',
                      backgroundColor: usageBarColor,
                      opacity: !eventLimit ? 0.4 : 1,
                    },
                  ]}
                />
              </View>
              {eventLimit && usagePct >= 80 && usagePct < 100 && (
                <Text style={styles.usageWarning}>{eventLimit - eventsUsed} remaining</Text>
              )}
              {eventLimit && usagePct >= 100 && (
                <Text style={styles.usageDanger}>Limit reached — upgrade to publish more</Text>
              )}
            </View>
          )}
        </View>
      </View>

      {/* Plan cards */}
      {plans.map((plan) => {
        const isFlagship = !!PLAN_FLAGSHIP[plan.id]
        const isCurrent = plan.id === currentId
        const isConfirming = confirmId === plan.id
        const isLoading = saving === plan.id
        const action = getPlanAction(plan, currentId, plans)
        const features = PLAN_FEATURES[plan.id] ?? []
        const feeSaved = isOrganizer && plan.platform_fee_pct < 0.10
          ? Math.round((0.10 - plan.platform_fee_pct) * 100)
          : null

        if (isFlagship) {
          // Dark flagship card
          return (
            <View key={plan.id} style={styles.darkCard}>
              {/* Name row */}
              <View style={styles.cardNameRow}>
                <Text style={styles.darkNameAr}>{plan.name_ar}</Text>
                {isCurrent ? (
                  <View style={styles.activeBadge}>
                    <Text style={styles.activeBadgeText}>Active</Text>
                  </View>
                ) : (
                  <View style={styles.bestValueBadge}>
                    <Text style={styles.bestValueText}>Best value</Text>
                  </View>
                )}
              </View>

              {/* Price */}
              <Text style={styles.darkPlanName}>{plan.name}</Text>
              <View style={styles.priceRow}>
                {plan.price_amount > 0 ? (
                  <>
                    <Text style={styles.darkPrice}>{formatPlanAmount(plan.price_amount)}</Text>
                    <Text style={styles.darkPriceUnit}>{plan.price_currency} / month</Text>
                  </>
                ) : (
                  <Text style={styles.darkPriceFree}>Free</Text>
                )}
              </View>
              {plan.type === 'organizer' && (
                <Text style={styles.darkFeeText}>
                  {(plan.platform_fee_pct * 100).toFixed(0)}% platform fee on revenue
                </Text>
              )}

              {/* Savings callout */}
              {feeSaved && (
                <View style={styles.darkSavings}>
                  <Text style={styles.darkSavingsText}>
                    Save {feeSaved}% in platform fees vs Basic
                  </Text>
                </View>
              )}

              {/* Features */}
              <View style={styles.featureList}>
                {features.map((f) => (
                  <View key={f} style={styles.featureRow}>
                    <Text style={[styles.featureCheck, { color: C_GOLD }]}>✓</Text>
                    <Text style={styles.darkFeatureText}>{f}</Text>
                  </View>
                ))}
              </View>

              {/* CTA */}
              {isCurrent ? (
                <View style={[styles.btn, styles.btnCurrentDark]}>
                  <Text style={styles.btnCurrentDarkText}>Current plan</Text>
                </View>
              ) : isConfirming ? (
                <View style={{ gap: Spacing.sm }}>
                  <Text style={styles.confirmText}>Downgrading reduces your quota. Continue?</Text>
                  <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
                    <TouchableOpacity
                      style={[styles.btn, styles.btnConfirm, { flex: 1 }]}
                      onPress={() => doSelectPlan(plan)}
                      disabled={saving !== null}
                    >
                      {isLoading ? <ActivityIndicator color={Colors.white} size="small" /> : <Text style={styles.btnConfirmText}>Confirm</Text>}
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.btn, { backgroundColor: 'transparent', paddingHorizontal: Spacing.lg }]}
                      onPress={() => setConfirmId(null)}
                    >
                      <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: FontSize.sm, fontWeight: FontWeight.medium }}>Cancel</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <TouchableOpacity
                  style={[styles.btn, styles.btnGold]}
                  onPress={() => handlePlanPress(plan, action)}
                  disabled={saving !== null}
                  activeOpacity={0.85}
                >
                  {isLoading ? (
                    <ActivityIndicator color={C_INK} size="small" />
                  ) : (
                    <Text style={styles.btnGoldText}>
                      {action === 'upgrade' ? `Upgrade to ${plan.name}` : `Switch to ${plan.name}`}
                    </Text>
                  )}
                </TouchableOpacity>
              )}
            </View>
          )
        }

        // Light card
        const isElite = plan.id === 'org_elite'
        return (
          <View
            key={plan.id}
            style={[
              styles.lightCard,
              isCurrent && styles.lightCardCurrent,
              isElite && styles.lightCardElite,
            ]}
          >
            {/* Name row */}
            <View style={styles.cardNameRow}>
              <Text style={styles.lightNameAr}>{plan.name_ar}</Text>
              {isCurrent && (
                <View style={styles.activeBadgeLight}>
                  <Text style={styles.activeBadgeLightText}>Active</Text>
                </View>
              )}
            </View>

            {/* Price */}
            <Text style={styles.lightPlanName}>{plan.name}</Text>
            <View style={styles.priceRow}>
              {plan.price_amount > 0 ? (
                <>
                  <Text style={styles.lightPrice}>{formatPlanAmount(plan.price_amount)}</Text>
                  <Text style={styles.lightPriceUnit}>{plan.price_currency} / month</Text>
                </>
              ) : (
                <Text style={styles.lightPriceFree}>Free</Text>
              )}
            </View>
            {plan.type === 'organizer' && (
              <Text style={styles.lightFeeText}>
                {(plan.platform_fee_pct * 100).toFixed(0)}% platform fee on revenue
              </Text>
            )}

            {/* Savings callout (elite) */}
            {feeSaved && (
              <View style={styles.lightSavings}>
                <Text style={styles.lightSavingsText}>
                  Save {feeSaved}% in platform fees vs Basic
                </Text>
              </View>
            )}

            {/* Features */}
            <View style={styles.featureList}>
              {features.map((f) => (
                <View key={f} style={styles.featureRow}>
                  <Text style={[styles.featureCheck, { color: isElite ? Colors.brand[600] : Colors.brand[500] }]}>✓</Text>
                  <Text style={styles.lightFeatureText}>{f}</Text>
                </View>
              ))}
            </View>

            {/* CTA */}
            {isCurrent ? (
              <View style={[styles.btn, styles.btnCurrentLight]}>
                <Text style={styles.btnCurrentLightText}>Current plan</Text>
              </View>
            ) : isConfirming ? (
              <View style={{ gap: Spacing.sm }}>
                <Text style={[styles.confirmText, { color: '#ea580c' }]}>Downgrading reduces your quota. Continue?</Text>
                <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
                  <TouchableOpacity
                    style={[styles.btn, styles.btnConfirm, { flex: 1 }]}
                    onPress={() => doSelectPlan(plan)}
                    disabled={saving !== null}
                  >
                    {isLoading ? <ActivityIndicator color={Colors.white} size="small" /> : <Text style={styles.btnConfirmText}>Confirm</Text>}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.btn, { backgroundColor: 'transparent', paddingHorizontal: Spacing.lg }]}
                    onPress={() => setConfirmId(null)}
                  >
                    <Text style={{ color: Colors.gray[400], fontSize: FontSize.sm, fontWeight: FontWeight.medium }}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <TouchableOpacity
                style={[styles.btn, action === 'upgrade' ? styles.btnPrimary : styles.btnSecondary]}
                onPress={() => handlePlanPress(plan, action)}
                disabled={saving !== null}
                activeOpacity={0.85}
              >
                {isLoading ? (
                  <ActivityIndicator color={action === 'upgrade' ? Colors.white : Colors.gray[700]} size="small" />
                ) : (
                  <Text style={action === 'upgrade' ? styles.btnPrimaryText : styles.btnSecondaryText}>
                    {action === 'upgrade' ? `Upgrade to ${plan.name}` : `Switch to ${plan.name}`}
                  </Text>
                )}
              </TouchableOpacity>
            )}
          </View>
        )
      })}

      <Text style={styles.note}>
        Paid plans open a secure checkout. Free plan changes take effect immediately.
      </Text>
    </ScrollView>
  )
}

// ── Styles ─────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: Colors.gray[50] },
  content:      { padding: Spacing.lg, paddingBottom: 60, gap: Spacing.md },
  centered:     { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText:    { color: Colors.gray[500], fontSize: FontSize.base },
  backBtn:      { marginBottom: Spacing.sm },
  backText:     { fontSize: FontSize.base, color: Colors.brand[600], fontWeight: FontWeight.medium },

  header:       { marginBottom: Spacing.xs },
  title:        { fontSize: FontSize['3xl'], fontWeight: FontWeight.bold, color: C_INK, lineHeight: 34 },
  subtitle:     { fontSize: FontSize.sm, color: Colors.gray[500], marginTop: 6, lineHeight: 20 },

  // Status strip
  statusStrip:  { backgroundColor: C_INK, borderRadius: Radius.xl, padding: Spacing['2xl'], gap: Spacing.md },
  statusRow:    { flexDirection: 'row', gap: Spacing['2xl'], flexWrap: 'wrap' },
  statusLabel:  { fontSize: 10, fontWeight: FontWeight.bold, color: 'rgba(255,255,255,0.35)', letterSpacing: 1.2, marginBottom: 4 },
  statusPlanName: { fontSize: FontSize['2xl'], fontWeight: FontWeight.bold, color: C_GOLD, lineHeight: 28 },
  statusSub:    { fontSize: 12, color: 'rgba(255,255,255,0.25)', marginTop: 2 },
  usageHeader:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 8 },
  usageLabel:   { fontSize: 10, fontWeight: FontWeight.semibold, color: 'rgba(255,255,255,0.3)', letterSpacing: 0.8 },
  usageValue:   { fontSize: FontSize.sm, fontWeight: FontWeight.bold },
  progressTrack: { height: 6, borderRadius: Radius.full, backgroundColor: 'rgba(255,255,255,0.08)', overflow: 'hidden' },
  progressFill: { height: 6, borderRadius: Radius.full },
  usageWarning: { fontSize: 11, color: 'rgba(253,186,116,0.75)', marginTop: 6 },
  usageDanger:  { fontSize: 11, color: 'rgba(248,113,113,0.75)', marginTop: 6 },

  // Card shared
  cardNameRow:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.md },
  priceRow:     { flexDirection: 'row', alignItems: 'flex-end', gap: 4, marginTop: 6, marginBottom: 4 },
  featureList:  { gap: Spacing.sm, marginBottom: Spacing.lg, marginTop: Spacing.md },
  featureRow:   { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  featureCheck: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, marginTop: 1 },

  // Dark card
  darkCard:          { backgroundColor: C_INK, borderRadius: Radius.xl, padding: Spacing['2xl'], ...Shadow.card },
  darkNameAr:        { fontSize: 10, fontWeight: FontWeight.semibold, color: 'rgba(255,255,255,0.25)', letterSpacing: 1 },
  darkPlanName:      { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.white, marginTop: 4 },
  darkPrice:         { fontSize: 36, fontWeight: FontWeight.bold, color: C_GOLD, lineHeight: 40 },
  darkPriceUnit:     { fontSize: FontSize.sm, color: 'rgba(255,255,255,0.35)', marginBottom: 4, alignSelf: 'flex-end' },
  darkPriceFree:     { fontSize: 32, fontWeight: FontWeight.bold, color: Colors.white },
  darkFeeText:       { fontSize: 12, color: 'rgba(255,255,255,0.35)', marginBottom: Spacing.sm },
  darkSavings:       { backgroundColor: 'rgba(245,158,11,0.12)', borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, marginBottom: Spacing.sm },
  darkSavingsText:   { fontSize: 12, fontWeight: FontWeight.semibold, color: C_GOLD },
  darkFeatureText:   { fontSize: FontSize.sm, color: 'rgba(255,255,255,0.6)', flex: 1 },

  // Light card
  lightCard:         { backgroundColor: Colors.white, borderRadius: Radius.xl, padding: Spacing['2xl'], borderWidth: 1, borderColor: Colors.gray[100], ...Shadow.card },
  lightCardCurrent:  { borderColor: Colors.brand[200], backgroundColor: '#fffbeb' },
  lightCardElite:    { borderColor: 'rgba(251,191,36,0.4)', backgroundColor: 'rgba(255,251,235,0.5)' },
  lightNameAr:       { fontSize: 10, fontWeight: FontWeight.semibold, color: Colors.gray[400], letterSpacing: 1 },
  lightPlanName:     { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.gray[900], marginTop: 4 },
  lightPrice:        { fontSize: 36, fontWeight: FontWeight.bold, color: Colors.gray[900], lineHeight: 40 },
  lightPriceUnit:    { fontSize: FontSize.sm, color: Colors.gray[400], marginBottom: 4, alignSelf: 'flex-end' },
  lightPriceFree:    { fontSize: 28, fontWeight: FontWeight.bold, color: Colors.gray[500] },
  lightFeeText:      { fontSize: 12, color: Colors.gray[400], marginBottom: Spacing.sm },
  lightSavings:      { backgroundColor: Colors.brand[50], borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, marginBottom: Spacing.sm },
  lightSavingsText:  { fontSize: 12, fontWeight: FontWeight.semibold, color: Colors.brand[700] },
  lightFeatureText:  { fontSize: FontSize.sm, color: Colors.gray[600], flex: 1 },

  // Badges
  bestValueBadge:       { backgroundColor: C_GOLD, borderRadius: Radius.full, paddingHorizontal: Spacing.md, paddingVertical: 3 },
  bestValueText:        { fontSize: 10, fontWeight: FontWeight.bold, color: C_INK, letterSpacing: 0.8 },
  activeBadge:          { backgroundColor: 'rgba(34,197,94,0.15)', borderRadius: Radius.full, paddingHorizontal: Spacing.md, paddingVertical: 3 },
  activeBadgeText:      { fontSize: 10, fontWeight: FontWeight.bold, color: '#4ade80', letterSpacing: 0.8 },
  activeBadgeLight:     { backgroundColor: Colors.green.light, borderRadius: Radius.full, paddingHorizontal: Spacing.md, paddingVertical: 3 },
  activeBadgeLightText: { fontSize: 10, fontWeight: FontWeight.bold, color: Colors.green.text, letterSpacing: 0.8 },

  // Buttons
  btn:                 { borderRadius: Radius.lg, paddingVertical: Spacing.md, alignItems: 'center', justifyContent: 'center' },
  btnGold:             { backgroundColor: C_GOLD },
  btnGoldText:         { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: C_INK },
  btnCurrentDark:      { backgroundColor: 'rgba(255,255,255,0.06)' },
  btnCurrentDarkText:  { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: 'rgba(255,255,255,0.28)' },
  btnPrimary:          { backgroundColor: Colors.brand[500] },
  btnPrimaryText:      { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.white },
  btnSecondary:        { backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.gray[200] },
  btnSecondaryText:    { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.gray[700] },
  btnCurrentLight:     { backgroundColor: Colors.gray[100] },
  btnCurrentLightText: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.gray[400] },
  btnConfirm:          { backgroundColor: '#f97316' },
  btnConfirmText:      { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.white },
  confirmText:         { fontSize: 12, color: '#fb923c', textAlign: 'center' },

  note: { textAlign: 'center', fontSize: FontSize.xs, color: Colors.gray[300], marginTop: Spacing.sm },
})
