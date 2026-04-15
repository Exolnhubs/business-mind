import { useEffect, useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, ActivityIndicator, Alert,
} from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { apiPatch } from '@/lib/api'
import { useAuth } from '@/contexts/auth-context'
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadow } from '@/theme'
import { formatDate } from '@/lib/utils'
import type { EventFrequency } from '@/types/database'

interface OrgEvent {
  id: string
  title: string
  start_at: string
  end_at: string | null
  event_frequency: EventFrequency
  is_published: boolean
  is_cancelled: boolean
  bookings_count: number
  capacity: number | null
  tips_total: number
}

const DATA_REFRESH_STALE_MS = 90_000

type OrganizerDashboardCache = {
  updatedAt: number
  events: OrgEvent[]
  orgName: string
  orgStatus: string | null
  suspendReason: string | null
  isBanned: boolean
  totalTips: number
  planId: string
  eventsUsed: number
  eventsLimit: number | null
}

let organizerDashboardCache: OrganizerDashboardCache | null = null

const EVENT_FREQUENCY_LABELS: Record<EventFrequency, string> = {
  one_time: 'One Time',
  weekly: 'Weekly',
  monthly: 'Monthly',
}

export default function OrganizerDashboard() {
  const { user } = useAuth()
  const router  = useRouter()
  const insets = useSafeAreaInsets()

  const [events,       setEvents]       = useState<OrgEvent[]>([])
  const [orgName,      setOrgName]      = useState('')
  const [orgStatus,    setOrgStatus]    = useState<string | null>(null)
  const [suspendReason, setSuspendReason] = useState<string | null>(null)
  const [isBanned,     setIsBanned]     = useState(false)
  const [totalTips,    setTotalTips]    = useState(0)
  const [planId,       setPlanId]       = useState('org_basic')
  const [eventsUsed,   setEventsUsed]   = useState(0)
  const [eventsLimit,  setEventsLimit]  = useState<number | null>(3)
  const [loading,      setLoading]      = useState(true)
  const [refreshing,   setRefreshing]   = useState(false)

  useEffect(() => {
    if (!loading) {
      organizerDashboardCache = {
        updatedAt: organizerDashboardCache?.updatedAt ?? Date.now(),
        events,
        orgName,
        orgStatus,
        suspendReason,
        isBanned,
        totalTips,
        planId,
        eventsUsed,
        eventsLimit,
      }
    }
  }, [events, eventsLimit, eventsUsed, isBanned, loading, orgName, orgStatus, planId, suspendReason, totalTips])

  const load = useCallback(async (force = false) => {
    if (!user) return
    const now = Date.now()
    const canReuseCache =
      !force &&
      organizerDashboardCache &&
      now - organizerDashboardCache.updatedAt < DATA_REFRESH_STALE_MS

    if (canReuseCache) {
      const cache = organizerDashboardCache
      if (!cache) return
      setEvents(cache.events)
      setOrgName(cache.orgName)
      setOrgStatus(cache.orgStatus)
      setSuspendReason(cache.suspendReason)
      setIsBanned(cache.isBanned)
      setTotalTips(cache.totalTips)
      setPlanId(cache.planId)
      setEventsUsed(cache.eventsUsed)
      setEventsLimit(cache.eventsLimit)
      setLoading(false)
      setRefreshing(false)
      return
    }

    const monthStr = new Date().toISOString().slice(0, 7) + '-01'
    const [evRes, orgRes, profileRes, tipRes, usageRes] = await Promise.all([
      supabase
        .from('events')
        .select('id, title, start_at, end_at, event_frequency, is_published, is_cancelled, bookings_count, capacity, tips_total')
        .eq('organizer_id', user.id)
        .order('start_at', { ascending: false })
        .limit(30),
      supabase
        .from('organizer_profiles')
        .select('business_name, plan_id, status, suspend_reason, plan:plan_definitions(events_per_month, platform_fee_pct)')
        .eq('user_id', user.id)
        .single(),
      supabase
        .from('profiles')
        .select('is_banned')
        .eq('id', user.id)
        .single(),
      supabase
        .from('tips')
        .select('amount')
        .eq('organizer_id', user.id),
      supabase
        .from('organizer_monthly_usage')
        .select('events_created')
        .eq('organizer_id', user.id)
        .eq('month', monthStr)
        .maybeSingle(),
    ])

    const nextEvents = (evRes.data ?? []) as OrgEvent[]
    const nextOrgName = orgRes.data?.business_name ?? ''
    const nextOrgStatus = orgRes.data?.status ?? null
    const nextSuspendReason = (orgRes.data as { suspend_reason?: string | null })?.suspend_reason ?? null
    const nextIsBanned = profileRes.data?.is_banned ?? false
    const nextTotalTips = (tipRes.data ?? []).reduce((s, t) => s + t.amount, 0)
    const nextPlanId = orgRes.data?.plan_id ?? 'org_basic'
    const planData = orgRes.data?.plan as unknown as { events_per_month: number | null; platform_fee_pct: number } | null
    const nextEventsLimit = planData?.events_per_month ?? 3
    const nextEventsUsed = usageRes.data?.events_created ?? 0

    setEvents(nextEvents)
    setOrgName(nextOrgName)
    setOrgStatus(nextOrgStatus)
    setSuspendReason(nextSuspendReason)
    setIsBanned(nextIsBanned)
    setTotalTips(nextTotalTips)
    setPlanId(nextPlanId)
    setEventsLimit(nextEventsLimit)
    setEventsUsed(nextEventsUsed)

    organizerDashboardCache = {
      updatedAt: now,
      events: nextEvents,
      orgName: nextOrgName,
      orgStatus: nextOrgStatus,
      suspendReason: nextSuspendReason,
      isBanned: nextIsBanned,
      totalTips: nextTotalTips,
      planId: nextPlanId,
      eventsUsed: nextEventsUsed,
      eventsLimit: nextEventsLimit,
    }

    setLoading(false)
    setRefreshing(false)
  }, [user])

  useEffect(() => { load() }, [load])

  async function togglePublish(ev: OrgEvent) {
    if (ev.is_cancelled) return
    const next = !ev.is_published
    const { error } = await apiPatch(`/api/events/${ev.id}`, { is_published: next })
    if (!error) {
      setEvents((prev) => prev.map((e) => e.id === ev.id ? { ...e, is_published: next } : e))
    }
  }

  async function cancelEvent(ev: OrgEvent) {
    Alert.alert('Cancel Event', `Cancel "${ev.title}"? This cannot be undone.\n\nAll confirmed attendees will be notified.`, [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Cancel Event',
        style: 'destructive',
        onPress: async () => {
          const { error } = await apiPatch(`/api/events/${ev.id}`, { is_cancelled: true, is_published: false })
          if (!error) {
            setEvents((prev) => prev.map((e) => e.id === ev.id ? { ...e, is_cancelled: true, is_published: false } : e))
          }
        },
      },
    ])
  }

  const active        = events.filter((e) => e.is_published && !e.is_cancelled).length
  const totalBookings = events.reduce((s, e) => s + e.bookings_count, 0)
  const headerTopSpacing = Math.max(Spacing.sm, Math.min(insets.top * 0.18, Spacing.md))

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={Colors.brand[500]} />
      </View>
    )
  }

  // Banned account
  if (isBanned) {
    return (
      <View style={styles.centered}>
        <Text style={{ fontSize: 48, marginBottom: 12 }}>🚫</Text>
        <Text style={styles.blockedTitle}>Account Banned</Text>
        <Text style={styles.blockedSub}>Your account has been suspended. Contact support for assistance.</Text>
      </View>
    )
  }

  // Organizer not approved
  if (!orgStatus || orgStatus === 'pending') {
    return (
      <View style={styles.centered}>
        <Text style={{ fontSize: 48, marginBottom: 12 }}>⏳</Text>
        <Text style={styles.blockedTitle}>Pending Approval</Text>
        <Text style={styles.blockedSub}>Your organizer account is under review. You'll be notified once approved.</Text>
      </View>
    )
  }

  if (orgStatus === 'rejected') {
    return (
      <View style={styles.centered}>
        <Text style={{ fontSize: 48, marginBottom: 12 }}>❌</Text>
        <Text style={styles.blockedTitle}>Application Rejected</Text>
        <Text style={styles.blockedSub}>Your organizer application was not approved. Contact support for details.</Text>
      </View>
    )
  }

  if (orgStatus === 'suspended') {
    return (
      <View style={styles.centered}>
        <Text style={{ fontSize: 48, marginBottom: 12 }}>⛔</Text>
        <Text style={styles.blockedTitle}>Account Suspended</Text>
        <Text style={styles.blockedSub}>
          {suspendReason
            ? `Your account has been suspended.\nReason: ${suspendReason}`
            : 'Your account has been suspended. Contact support if you think this is an error.'}
        </Text>
      </View>
    )
  }

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingTop: headerTopSpacing }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(true) }} tintColor={Colors.brand[500]} />}
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>{orgName || 'My Dashboard'}</Text>
          <Text style={styles.headerSub}>Manage your events</Text>
        </View>
        <TouchableOpacity
          style={styles.createBtn}
          onPress={() => router.push('/organizer/event-form')}
        >
          <Text style={styles.createBtnText}>+ Create</Text>
        </TouchableOpacity>
      </View>

      {/* Stats */}
      <View style={styles.statsRow}>
        {[
          { icon: '📅', label: 'Active', value: active },
          { icon: '🎟️', label: 'Bookings', value: totalBookings },
          { icon: '💝', label: 'Donations', value: `SAR ${totalTips.toFixed(0)}` },
          { icon: '📊', label: 'Total', value: events.length },
        ].map((s) => (
          <View key={s.label} style={styles.statCard}>
            <Text style={styles.statIcon}>{s.icon}</Text>
            <Text style={styles.statValue}>{s.value}</Text>
            <Text style={styles.statLabel}>{s.label}</Text>
          </View>
        ))}
      </View>

      {/* Plan card */}
      <TouchableOpacity style={styles.planCard} onPress={() => router.push('/plans')} activeOpacity={0.85}>
        <View style={styles.planCardLeft}>
          <Text style={styles.planCardTitle}>
            {{
              org_basic: '🔵 Basic Plan',
              org_pro:   '🟣 Pro Plan',
              org_elite: '🟡 Elite Plan',
            }[planId] ?? '🔵 Basic Plan'}
          </Text>
          <Text style={styles.planCardSub}>
            {eventsLimit !== null
              ? `${eventsUsed} / ${eventsLimit} events this month`
              : `${eventsUsed} events this month (unlimited)`}
          </Text>
        </View>
        {planId === 'org_basic' && (
          <View style={styles.upgradeBadge}>
            <Text style={styles.upgradeBadgeText}>Upgrade ›</Text>
          </View>
        )}
        {planId !== 'org_basic' && (
          <Text style={styles.planArrow}>›</Text>
        )}
      </TouchableOpacity>

      {/* Events list */}
      <Text style={styles.sectionTitle}>Your Events</Text>

      {events.length === 0 ? (
        <View style={styles.onboardingCard}>
          <Text style={styles.onboardingEmoji}>🎉</Text>
          <Text style={styles.onboardingTitle}>Welcome, organizer!</Text>
          <Text style={styles.onboardingSub}>
            You're all set to start creating events. Share your passion, bring people together, and grow your audience.
          </Text>
          <View style={styles.onboardingSteps}>
            {[
              { icon: '📝', text: 'Create your first event' },
              { icon: '🎟️', text: 'Add ticket types and pricing' },
              { icon: '📣', text: 'Publish and share with followers' },
            ].map((step) => (
              <View key={step.text} style={styles.onboardingStep}>
                <Text style={styles.onboardingStepIcon}>{step.icon}</Text>
                <Text style={styles.onboardingStepText}>{step.text}</Text>
              </View>
            ))}
          </View>
          <TouchableOpacity style={[styles.createBtn, { marginTop: Spacing.lg, paddingHorizontal: Spacing['2xl'] }]} onPress={() => router.push('/organizer/event-form')}>
            <Text style={styles.createBtnText}>Create your first event</Text>
          </TouchableOpacity>
        </View>
      ) : (
        events.map((ev) => {
          const statusColor = ev.is_cancelled
            ? Colors.red
            : ev.is_published
            ? Colors.green
            : { DEFAULT: Colors.gray[400], light: Colors.gray[100], text: Colors.gray[600] }
          return (
            <View key={ev.id} style={styles.eventCard}>
              <View style={styles.eventRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.eventTitle} numberOfLines={1}>{ev.title}</Text>
                  <Text style={styles.eventMeta}>{formatDate(ev.start_at)}</Text>
                  <Text style={styles.eventMeta}>{EVENT_FREQUENCY_LABELS[ev.event_frequency ?? 'one_time']}</Text>
                  <Text style={styles.eventMeta}>
                    {ev.bookings_count}{ev.capacity ? `/${ev.capacity}` : ''} booked
                  </Text>
                </View>
                <View style={[styles.badge, { backgroundColor: statusColor.light }]}>
                  <Text style={[styles.badgeText, { color: statusColor.text }]}>
                    {ev.is_cancelled ? 'Cancelled' : ev.is_published ? 'Live' : 'Draft'}
                  </Text>
                </View>
              </View>

              <View style={styles.actionRow}>
                  {ev.bookings_count > 0 && (
                    <TouchableOpacity
                      style={[styles.actionBtn, { backgroundColor: Colors.brand[50] ?? '#EEF2FF' }]}
                      onPress={() => router.push(`/organizer/attendees?eventId=${ev.id}&title=${encodeURIComponent(ev.title)}`)}
                    >
                      <Text style={[styles.actionBtnText, { color: Colors.brand[600] ?? Colors.brand[500] }]}>
                        🎟 Attendees ({ev.bookings_count})
                      </Text>
                    </TouchableOpacity>
                  )}
                {!ev.is_cancelled && (
                  <>
                    <TouchableOpacity
                      style={[styles.actionBtn, { backgroundColor: ev.is_published ? Colors.gray[100] : Colors.brand[500] }]}
                      onPress={() => togglePublish(ev)}
                    >
                      <Text style={[styles.actionBtnText, { color: ev.is_published ? Colors.gray[700] : Colors.white }]}>
                        {ev.is_published ? 'Unpublish' : 'Publish'}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.actionBtn, { backgroundColor: Colors.gray[100] }]}
                      onPress={() => router.push(`/organizer/event-form?id=${ev.id}`)}
                    >
                      <Text style={[styles.actionBtnText, { color: Colors.gray[700] }]}>Edit</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.actionBtn, { backgroundColor: Colors.red.light }]}
                      onPress={() => cancelEvent(ev)}
                    >
                      <Text style={[styles.actionBtnText, { color: Colors.red.text }]}>Cancel</Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>
            </View>
          )
        })
      )}
    </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.gray[50] },
  content:   { padding: Spacing.lg, paddingBottom: Spacing['4xl'] },
  centered:     { flex: 1, justifyContent: 'center', alignItems: 'center', padding: Spacing['2xl'] },
  blockedTitle: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.gray[900], textAlign: 'center', marginBottom: 8 },
  blockedSub:   { fontSize: FontSize.sm, color: Colors.gray[500], textAlign: 'center', lineHeight: 20 },
  header:    { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.lg },
  headerTitle: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.gray[900] },
  headerSub:   { fontSize: FontSize.sm, color: Colors.gray[500], marginTop: 2 },
  createBtn: { backgroundColor: Colors.brand[500], borderRadius: Radius.lg, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm },
  createBtnText: { color: Colors.white, fontWeight: FontWeight.semibold, fontSize: FontSize.sm },
  statsRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.lg },
  statCard: { flex: 1, backgroundColor: Colors.white, borderRadius: Radius.md, padding: Spacing.md, alignItems: 'center', ...Shadow.card },
  statIcon: { fontSize: 20, marginBottom: 4 },
  statValue: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.gray[900] },
  statLabel: { fontSize: FontSize.xs, color: Colors.gray[500], marginTop: 2 },
  sectionTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.gray[500], textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: Spacing.sm },
  emptyCard: { backgroundColor: Colors.white, borderRadius: Radius.lg, padding: Spacing['3xl'], alignItems: 'center', gap: Spacing.md, ...Shadow.card },
  emptyTitle: { fontSize: FontSize.base, fontWeight: FontWeight.semibold, color: Colors.gray[700] },
  onboardingCard: { backgroundColor: Colors.white, borderRadius: Radius.xl, padding: Spacing['2xl'], alignItems: 'center', ...Shadow.card, marginBottom: Spacing.lg },
  onboardingEmoji: { fontSize: 48, marginBottom: Spacing.sm },
  onboardingTitle: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.gray[900], textAlign: 'center' },
  onboardingSub:   { fontSize: FontSize.sm, color: Colors.gray[500], textAlign: 'center', lineHeight: 20, marginTop: Spacing.sm },
  onboardingSteps: { width: '100%', gap: Spacing.sm, marginTop: Spacing.lg },
  onboardingStep:  { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, backgroundColor: Colors.gray[50], borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm },
  onboardingStepIcon: { fontSize: 18 },
  onboardingStepText: { fontSize: FontSize.sm, color: Colors.gray[700], fontWeight: FontWeight.medium },
  eventCard: { backgroundColor: Colors.white, borderRadius: Radius.lg, padding: Spacing.lg, marginBottom: Spacing.md, ...Shadow.card },
  eventRow:  { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md },
  eventTitle: { fontSize: FontSize.base, fontWeight: FontWeight.semibold, color: Colors.gray[900], marginBottom: 3 },
  eventMeta:  { fontSize: FontSize.xs, color: Colors.gray[500], marginTop: 1 },
  badge: { borderRadius: Radius.full, paddingHorizontal: Spacing.md, paddingVertical: 4 },
  badgeText: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold },
  actionRow: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md, paddingTop: Spacing.md, borderTopWidth: 1, borderTopColor: Colors.gray[100] },
  actionBtn: { flex: 1, borderRadius: Radius.md, paddingVertical: Spacing.sm, alignItems: 'center' },
  actionBtnText: { fontSize: FontSize.sm, fontWeight: FontWeight.medium },
  planCard:      { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.white, borderRadius: Radius.lg, padding: Spacing.lg, marginBottom: Spacing.lg, ...Shadow.card },
  planCardLeft:  { flex: 1 },
  planCardTitle: { fontSize: FontSize.base, fontWeight: FontWeight.semibold, color: Colors.gray[900] },
  planCardSub:   { fontSize: FontSize.xs, color: Colors.gray[500], marginTop: 3 },
  upgradeBadge:  { backgroundColor: Colors.brand[500], borderRadius: Radius.full, paddingHorizontal: Spacing.md, paddingVertical: 4 },
  upgradeBadgeText: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, color: Colors.white },
  planArrow:     { fontSize: 22, color: Colors.gray[400] },
})

