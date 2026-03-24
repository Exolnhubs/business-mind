import { useEffect, useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, RefreshControl,
} from 'react-native'
import { useRouter } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/auth-context'
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadow } from '@/theme'

interface Plan {
  id: string
  type: 'user' | 'organizer'
  name: string
  name_ar: string
  price_sar: number
  events_per_month: number | null
  attendees_per_event: number | null
  platform_fee_pct: number
  features: Record<string, unknown>
  sort_order: number
}

const PLAN_FEATURES: Record<string, string[]> = {
  user_free:    ['Book events', 'Save up to 20 events', 'Basic profile'],
  user_premium: ['Everything in Free', '24h early booking access', 'Unlimited saves', 'Premium-only events', 'Premium badge', 'Ad-free experience'],
  org_basic:    ['3 events / month', 'Up to 100 attendees/event', 'Basic analytics', '10% platform fee'],
  org_pro:      ['15 events / month', 'Up to 1,000 attendees/event', 'Full analytics', '1 featured event/month', 'Ticket scanner', '6% platform fee'],
  org_elite:    ['Unlimited events', 'Unlimited attendees', 'Analytics + CSV export', '5 featured events/month', 'Ticket scanner', 'Priority support', 'Custom branding', '3% platform fee'],
}

const PLAN_ACCENT: Record<string, string> = {
  user_free:    Colors.gray[400],
  user_premium: '#7c3aed',
  org_basic:    Colors.gray[400],
  org_pro:      '#2563eb',
  org_elite:    '#d97706',
}

export default function PlansScreen() {
  const { user, profile, refreshProfile } = useAuth()
  const router = useRouter()

  const [plans,      setPlans]      = useState<Plan[]>([])
  const [currentId,  setCurrentId]  = useState<string>('')
  const [loading,    setLoading]    = useState(true)
  const [saving,     setSaving]     = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const isOrganizer = profile?.role === 'organizer'

  const load = useCallback(async () => {
    if (!user || !profile) return

    const planType = isOrganizer ? 'organizer' : 'user'

    const [plansRes, currentRes] = await Promise.all([
      supabase
        .from('plan_definitions')
        .select('*')
        .eq('type', planType)
        .eq('is_active', true)
        .order('sort_order'),
      isOrganizer
        ? supabase.from('organizer_profiles').select('plan_id').eq('user_id', user.id).single()
        : Promise.resolve({ data: { plan_id: profile.plan_id ?? 'user_free' } }),
    ])

    setPlans((plansRes.data ?? []) as Plan[])
    setCurrentId((currentRes.data as { plan_id: string } | null)?.plan_id ?? (isOrganizer ? 'org_basic' : 'user_free'))
    setLoading(false)
    setRefreshing(false)
  }, [user, profile, isOrganizer])

  useEffect(() => { load() }, [load])

  async function selectPlan(plan: Plan) {
    if (plan.id === currentId || !user) return

    const action = plan.price_sar > 0 ? `Upgrade to ${plan.name}` : `Switch to ${plan.name}`
    const priceMsg = plan.price_sar > 0
      ? `\n\nPrice: ${plan.price_sar} SAR / month (simulated — no charges in MVP)`
      : ''

    Alert.alert(action, `${action}?${priceMsg}`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Confirm',
        onPress: async () => {
          setSaving(plan.id)
          try {
            let error
            if (isOrganizer) {
              ({ error } = await supabase
                .from('organizer_profiles')
                .update({ plan_id: plan.id })
                .eq('user_id', user.id))
            } else {
              ({ error } = await supabase
                .from('profiles')
                .update({ plan_id: plan.id })
                .eq('id', user.id))
            }

            if (error) throw error

            setCurrentId(plan.id)
            await refreshProfile()
            Alert.alert('Plan updated', `You are now on the ${plan.name} plan.`)
          } catch (e) {
            Alert.alert('Error', e instanceof Error ? e.message : 'Failed to change plan')
          } finally {
            setSaving(null)
          }
        },
      },
    ])
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
        <ActivityIndicator color={Colors.brand[500]} size="large" />
      </View>
    )
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => { setRefreshing(true); load() }}
          tintColor={Colors.brand[500]}
        />
      }
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>{isOrganizer ? 'Organizer Plan' : 'My Plan'}</Text>
        <Text style={styles.subtitle}>
          {isOrganizer
            ? 'Lower platform fees as you grow. Changes take effect immediately.'
            : 'Upgrade for early access, Premium-only events, and more.'}
        </Text>
      </View>

      {plans.map((plan) => {
        const isCurrent = plan.id === currentId
        const isLoading = saving === plan.id
        const accent    = PLAN_ACCENT[plan.id] ?? Colors.gray[400]
        const features  = PLAN_FEATURES[plan.id] ?? []

        return (
          <View
            key={plan.id}
            style={[
              styles.card,
              isCurrent && { borderColor: accent, borderWidth: 2 },
            ]}
          >
            {isCurrent && (
              <View style={[styles.currentBadge, { backgroundColor: accent + '20' }]}>
                <Text style={[styles.currentBadgeText, { color: accent }]}>Current plan</Text>
              </View>
            )}

            <View style={styles.cardHeader}>
              <View style={[styles.planDot, { backgroundColor: accent }]} />
              <Text style={styles.planName}>{plan.name}</Text>
              <Text style={styles.planPrice}>
                {plan.price_sar > 0 ? `${plan.price_sar} SAR/mo` : 'Free'}
              </Text>
            </View>

            {plan.type === 'organizer' && (
              <View style={styles.feeLine}>
                <Text style={styles.feeText}>
                  Platform fee: {(plan.platform_fee_pct * 100).toFixed(0)}% on tips & tickets
                </Text>
              </View>
            )}

            <View style={styles.featureList}>
              {features.map((f) => (
                <View key={f} style={styles.featureRow}>
                  <Text style={[styles.featureCheck, { color: accent }]}>✓</Text>
                  <Text style={styles.featureText}>{f}</Text>
                </View>
              ))}
            </View>

            <TouchableOpacity
              style={[
                styles.btn,
                isCurrent
                  ? styles.btnCurrent
                  : { backgroundColor: accent },
              ]}
              onPress={() => selectPlan(plan)}
              disabled={isCurrent || saving !== null}
              activeOpacity={0.85}
            >
              {isLoading ? (
                <ActivityIndicator color={Colors.white} size="small" />
              ) : (
                <Text style={[styles.btnText, isCurrent && styles.btnTextCurrent]}>
                  {isCurrent
                    ? 'Current plan'
                    : plan.price_sar > 0
                    ? `Upgrade to ${plan.name}`
                    : `Switch to ${plan.name}`}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        )
      })}

      <Text style={styles.note}>
        MVP: billing is simulated. No actual charges are made.
      </Text>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container:     { flex: 1, backgroundColor: Colors.gray[50] },
  content:       { padding: Spacing.lg, paddingBottom: Spacing['4xl'], gap: Spacing.md },
  centered:      { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText:     { color: Colors.gray[500], fontSize: FontSize.base },
  header:        { marginBottom: Spacing.sm },
  backBtn:       { marginBottom: Spacing.sm },
  backText:      { fontSize: FontSize.base, color: Colors.brand[600], fontWeight: FontWeight.medium },
  title:         { fontSize: FontSize['2xl'], fontWeight: FontWeight.bold, color: Colors.gray[900] },
  subtitle:      { fontSize: FontSize.sm, color: Colors.gray[500], marginTop: 4, lineHeight: 20 },
  card:          { backgroundColor: Colors.white, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1, borderColor: Colors.gray[100], ...Shadow.card },
  currentBadge:  { alignSelf: 'flex-start', borderRadius: Radius.full, paddingHorizontal: Spacing.md, paddingVertical: 2, marginBottom: Spacing.sm },
  currentBadgeText: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold },
  cardHeader:    { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.sm },
  planDot:       { width: 10, height: 10, borderRadius: 5 },
  planName:      { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.gray[900], flex: 1 },
  planPrice:     { fontSize: FontSize.base, fontWeight: FontWeight.semibold, color: Colors.gray[700] },
  feeLine:       { marginBottom: Spacing.sm },
  feeText:       { fontSize: FontSize.xs, color: Colors.gray[500] },
  featureList:   { gap: Spacing.xs, marginBottom: Spacing.lg },
  featureRow:    { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  featureCheck:  { fontSize: FontSize.sm, fontWeight: FontWeight.bold, marginTop: 1 },
  featureText:   { fontSize: FontSize.sm, color: Colors.gray[700], flex: 1 },
  btn:           { borderRadius: Radius.lg, paddingVertical: Spacing.md, alignItems: 'center' },
  btnCurrent:    { backgroundColor: Colors.gray[100] },
  btnText:       { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.white },
  btnTextCurrent:{ color: Colors.gray[500] },
  note:          { textAlign: 'center', fontSize: FontSize.xs, color: Colors.gray[300], marginTop: Spacing.sm },
})
