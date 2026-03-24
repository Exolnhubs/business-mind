import { useEffect, useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, ActivityIndicator, Alert,
} from 'react-native'
import { useRouter } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/auth-context'
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadow } from '@/theme'
import { formatDate } from '@/lib/utils'

interface OrgEvent {
  id: string
  title: string
  start_at: string
  is_published: boolean
  is_cancelled: boolean
  bookings_count: number
  capacity: number | null
  tips_total: number
}

export default function OrganizerDashboard() {
  const { user } = useAuth()
  const router  = useRouter()

  const [events,     setEvents]     = useState<OrgEvent[]>([])
  const [orgName,    setOrgName]    = useState('')
  const [totalTips,  setTotalTips]  = useState(0)
  const [loading,    setLoading]    = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async () => {
    if (!user) return
    const [evRes, orgRes, tipRes] = await Promise.all([
      supabase
        .from('events')
        .select('id, title, start_at, is_published, is_cancelled, bookings_count, capacity, tips_total')
        .eq('organizer_id', user.id)
        .order('start_at', { ascending: false })
        .limit(30),
      supabase
        .from('organizer_profiles')
        .select('business_name')
        .eq('user_id', user.id)
        .single(),
      supabase
        .from('tips')
        .select('amount')
        .eq('organizer_id', user.id),
    ])

    setEvents((evRes.data ?? []) as OrgEvent[])
    setOrgName(orgRes.data?.business_name ?? '')
    setTotalTips((tipRes.data ?? []).reduce((s, t) => s + t.amount, 0))
    setLoading(false)
    setRefreshing(false)
  }, [user])

  useEffect(() => { load() }, [load])

  async function togglePublish(ev: OrgEvent) {
    if (ev.is_cancelled) return
    const next = !ev.is_published
    const { error } = await supabase
      .from('events')
      .update({ is_published: next })
      .eq('id', ev.id)
      .eq('organizer_id', user!.id)
    if (!error) {
      setEvents((prev) => prev.map((e) => e.id === ev.id ? { ...e, is_published: next } : e))
    }
  }

  async function cancelEvent(ev: OrgEvent) {
    Alert.alert('Cancel Event', `Cancel "${ev.title}"? This cannot be undone.`, [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Cancel Event',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase
            .from('events')
            .update({ is_cancelled: true, is_published: false })
            .eq('id', ev.id)
            .eq('organizer_id', user!.id)
          if (!error) {
            setEvents((prev) => prev.map((e) => e.id === ev.id ? { ...e, is_cancelled: true, is_published: false } : e))
          }
        },
      },
    ])
  }

  const active        = events.filter((e) => e.is_published && !e.is_cancelled).length
  const totalBookings = events.reduce((s, e) => s + e.bookings_count, 0)

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={Colors.brand[500]} />
      </View>
    )
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load() }} tintColor={Colors.brand[500]} />}
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
          { icon: '💝', label: 'Tips', value: `SAR ${totalTips.toFixed(0)}` },
          { icon: '📊', label: 'Total', value: events.length },
        ].map((s) => (
          <View key={s.label} style={styles.statCard}>
            <Text style={styles.statIcon}>{s.icon}</Text>
            <Text style={styles.statValue}>{s.value}</Text>
            <Text style={styles.statLabel}>{s.label}</Text>
          </View>
        ))}
      </View>

      {/* Events list */}
      <Text style={styles.sectionTitle}>Your Events</Text>

      {events.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={{ fontSize: 40 }}>📭</Text>
          <Text style={styles.emptyTitle}>No events yet</Text>
          <TouchableOpacity style={styles.createBtn} onPress={() => router.push('/organizer/event-form')}>
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

              {!ev.is_cancelled && (
                <View style={styles.actionRow}>
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
                </View>
              )}
            </View>
          )
        })
      )}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.gray[50] },
  content:   { padding: Spacing.lg, paddingBottom: Spacing['4xl'] },
  centered:  { flex: 1, justifyContent: 'center', alignItems: 'center' },
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
  eventCard: { backgroundColor: Colors.white, borderRadius: Radius.lg, padding: Spacing.lg, marginBottom: Spacing.md, ...Shadow.card },
  eventRow:  { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md },
  eventTitle: { fontSize: FontSize.base, fontWeight: FontWeight.semibold, color: Colors.gray[900], marginBottom: 3 },
  eventMeta:  { fontSize: FontSize.xs, color: Colors.gray[500], marginTop: 1 },
  badge: { borderRadius: Radius.full, paddingHorizontal: Spacing.md, paddingVertical: 4 },
  badgeText: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold },
  actionRow: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md, paddingTop: Spacing.md, borderTopWidth: 1, borderTopColor: Colors.gray[100] },
  actionBtn: { flex: 1, borderRadius: Radius.md, paddingVertical: Spacing.sm, alignItems: 'center' },
  actionBtnText: { fontSize: FontSize.sm, fontWeight: FontWeight.medium },
})
