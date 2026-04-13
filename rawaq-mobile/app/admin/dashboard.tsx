import { useEffect, useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, ActivityIndicator, Alert,
} from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/auth-context'
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadow } from '@/theme'
import { formatRelativeTime } from '@/lib/utils'
import type { Comment, OrganizerProfile, Profile } from '@/types/database'

const DATA_REFRESH_STALE_MS = 90_000

interface PendingOrganizer {
  id: string
  business_name: string
  created_at: string
  user: { id: string; display_name: string | null; city: string | null } | null
}

interface FlaggedComment {
  id: string
  content: string
  created_at: string
  event_id: string | null
  user_id: string
  author: { display_name: string | null } | null
}

interface Stats {
  totalUsers: number
  totalOrganizers: number
  activeEvents: number
  pendingOrganizers: number
  flaggedComments: number
  totalTips: number
}

type PendingOrganizerRow = Pick<OrganizerProfile, 'id' | 'business_name' | 'created_at' | 'user_id'>
type FlaggedCommentRow = Pick<Comment, 'id' | 'content' | 'created_at' | 'event_id' | 'user_id'>

type AdminDashboardCache = {
  updatedAt: number
  stats: Stats | null
  pending: PendingOrganizer[]
  flagged: FlaggedComment[]
}

let adminDashboardCache: AdminDashboardCache | null = null

async function hydratePendingOrganizers(rows: PendingOrganizerRow[]): Promise<PendingOrganizer[]> {
  const userIds = [...new Set(rows.map((row) => row.user_id))]
  const { data: users } = userIds.length
    ? await supabase.from('profiles').select('id, display_name, city').in('id', userIds)
    : { data: [] as Pick<Profile, 'id' | 'display_name' | 'city'>[] }

  const userById = new Map((users ?? []).map((user) => [user.id, user]))

  return rows.map((row) => ({
    id: row.id,
    business_name: row.business_name,
    created_at: row.created_at,
    user: userById.get(row.user_id) ?? null,
  }))
}

async function hydrateFlaggedComments(rows: FlaggedCommentRow[]): Promise<FlaggedComment[]> {
  const userIds = [...new Set(rows.map((row) => row.user_id))]
  const { data: authors } = userIds.length
    ? await supabase.from('profiles').select('id, display_name').in('id', userIds)
    : { data: [] as Pick<Profile, 'id' | 'display_name'>[] }

  const authorById = new Map((authors ?? []).map((author) => [author.id, author]))

  return rows.map((row) => ({
    id: row.id,
    content: row.content,
    created_at: row.created_at,
    event_id: row.event_id,
    user_id: row.user_id,
    author: authorById.get(row.user_id)
      ? { display_name: authorById.get(row.user_id)?.display_name ?? null }
      : null,
  }))
}

export default function AdminDashboard() {
  const { user }  = useAuth()
  const router    = useRouter()
  const insets    = useSafeAreaInsets()

  const [stats,     setStats]     = useState<Stats | null>(null)
  const [pending,   setPending]   = useState<PendingOrganizer[]>([])
  const [flagged,   setFlagged]   = useState<FlaggedComment[]>([])
  const [loading,   setLoading]   = useState(true)
  const [refreshing,setRefreshing]= useState(false)
  const [actioning, setActioning] = useState<string | null>(null)
  const headerTopSpacing = Math.max(Spacing.sm, Math.min(insets.top * 0.18, Spacing.md))

  useEffect(() => {
    if (!loading) {
      adminDashboardCache = {
        updatedAt: adminDashboardCache?.updatedAt ?? Date.now(),
        stats,
        pending,
        flagged,
      }
    }
  }, [flagged, loading, pending, stats])

  const load = useCallback(async (force = false) => {
    const now = Date.now()
    const canReuseCache =
      !force &&
      adminDashboardCache &&
      now - adminDashboardCache.updatedAt < DATA_REFRESH_STALE_MS

    if (canReuseCache) {
      const cache = adminDashboardCache
      if (!cache) return
      setStats(cache.stats)
      setPending(cache.pending)
      setFlagged(cache.flagged)
      setLoading(false)
      setRefreshing(false)
      return
    }

    const [
      { count: totalUsers },
      { count: totalOrganizers },
      { count: activeEvents },
      { count: pendingCount },
      { count: flaggedCount },
      { data: tipsData },
      { data: pendingOrgs },
      { data: flaggedCmts },
    ] = await Promise.all([
      supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'user'),
      supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'organizer'),
      supabase.from('events').select('*', { count: 'exact', head: true }).eq('is_published', true).eq('is_cancelled', false),
      supabase.from('organizer_profiles').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('comments').select('*', { count: 'exact', head: true }).eq('is_flagged', true).eq('is_deleted', false),
      supabase.from('tips').select('amount'),
      supabase
        .from('organizer_profiles')
        .select('id, business_name, created_at, user_id')
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
        .limit(20),
      supabase
        .from('comments')
        .select('id, content, created_at, event_id, user_id')
        .eq('is_flagged', true)
        .eq('is_deleted', false)
        .order('created_at', { ascending: false })
        .limit(20),
    ])

    const totalTips = (tipsData ?? []).reduce((s, t) => s + t.amount, 0)
    const hydratedPending = await hydratePendingOrganizers((pendingOrgs ?? []) as PendingOrganizerRow[])
    const hydratedFlagged = await hydrateFlaggedComments((flaggedCmts ?? []) as FlaggedCommentRow[])

    const nextStats = {
      totalUsers: totalUsers ?? 0,
      totalOrganizers: totalOrganizers ?? 0,
      activeEvents: activeEvents ?? 0,
      pendingOrganizers: pendingCount ?? 0,
      flaggedComments: flaggedCount ?? 0,
      totalTips,
    }

    setStats(nextStats)
    setPending(hydratedPending)
    setFlagged(hydratedFlagged)
    adminDashboardCache = {
      updatedAt: now,
      stats: nextStats,
      pending: hydratedPending,
      flagged: hydratedFlagged,
    }
    setLoading(false)
    setRefreshing(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function reviewOrganizer(org: PendingOrganizer, status: 'approved' | 'rejected') {
    Alert.alert(
      `${status === 'approved' ? 'Approve' : 'Reject'} Organizer`,
      `${status === 'approved' ? 'Approve' : 'Reject'} "${org.business_name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: status === 'approved' ? 'Approve' : 'Reject',
          style: status === 'approved' ? 'default' : 'destructive',
          onPress: async () => {
            setActioning(org.id)

            const { error: orgErr } = await supabase
              .from('organizer_profiles')
              .update({
                status,
                verified: status === 'approved',
                reviewed_by: user!.id,
                reviewed_at: new Date().toISOString(),
              })
              .eq('id', org.id)

            if (!orgErr && org.user?.id) {
              await supabase
                .from('profiles')
                .update({ role: status === 'approved' ? 'organizer' : 'user' })
                .eq('id', org.user.id)
            }

            if (!orgErr) {
              setPending((prev) => prev.filter((o) => o.id !== org.id))
              setStats((s) => s ? { ...s, pendingOrganizers: s.pendingOrganizers - 1, totalOrganizers: status === 'approved' ? s.totalOrganizers + 1 : s.totalOrganizers } : s)
            }

            setActioning(null)
          },
        },
      ],
    )
  }

  async function deleteComment(comment: FlaggedComment) {
    Alert.alert('Delete Comment', 'Permanently delete this flagged comment?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setActioning(comment.id)
          const { error } = await supabase
            .from('comments')
            .update({ is_deleted: true, deleted_at: new Date().toISOString() })
            .eq('id', comment.id)
          if (!error) {
            setFlagged((prev) => prev.filter((c) => c.id !== comment.id))
            setStats((s) => s ? { ...s, flaggedComments: s.flaggedComments - 1 } : s)
          }
          setActioning(null)
        },
      },
    ])
  }

  async function unflagComment(comment: FlaggedComment) {
    setActioning(comment.id)
    const { error } = await supabase
      .from('comments')
      .update({ is_flagged: false })
      .eq('id', comment.id)
    if (!error) {
      setFlagged((prev) => prev.filter((c) => c.id !== comment.id))
      setStats((s) => s ? { ...s, flaggedComments: s.flaggedComments - 1 } : s)
    }
    setActioning(null)
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
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingTop: headerTopSpacing }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(true) }} tintColor={Colors.brand[500]} />}
    >
      <Text style={styles.screenTitle}>🛡️ Admin Dashboard</Text>

      {/* Stats grid */}
      <View style={styles.statsGrid}>
        {[
          { icon: '👥', label: 'Users',    value: stats?.totalUsers },
          { icon: '🏢', label: 'Organizers', value: stats?.totalOrganizers },
          { icon: '📅', label: 'Live Events', value: stats?.activeEvents },
          { icon: '⏳', label: 'Pending',   value: stats?.pendingOrganizers, warn: (stats?.pendingOrganizers ?? 0) > 0 },
          { icon: '🚩', label: 'Flagged',   value: stats?.flaggedComments,   warn: (stats?.flaggedComments ?? 0) > 0 },
          { icon: '💝', label: 'Donations (SAR)', value: `${(stats?.totalTips ?? 0).toFixed(0)}` },
        ].map((s) => (
          <View key={s.label} style={[styles.statCard, s.warn && styles.statCardWarn]}>
            <Text style={styles.statIcon}>{s.icon}</Text>
            <Text style={[styles.statValue, s.warn && styles.statValueWarn]}>{s.value}</Text>
            <Text style={styles.statLabel}>{s.label}</Text>
          </View>
        ))}
      </View>

      {/* Pending organizer approvals */}
      <Text style={styles.sectionTitle}>
        Pending Approvals ({pending.length})
      </Text>

      {pending.length === 0 ? (
        <View style={styles.emptyRow}>
          <Text style={styles.emptyText}>No pending approvals</Text>
        </View>
      ) : (
        pending.map((org) => (
          <View key={org.id} style={styles.card}>
            <Text style={styles.cardTitle}>{org.business_name}</Text>
            <Text style={styles.cardMeta}>
              {org.user?.display_name ?? 'Unknown user'}{org.user?.city ? ` · ${org.user.city}` : ''}
            </Text>
            <Text style={styles.cardTime}>{formatRelativeTime(org.created_at)}</Text>
            <View style={styles.cardActions}>
              <TouchableOpacity
                style={[styles.actionBtn, styles.approveBtn]}
                onPress={() => reviewOrganizer(org, 'approved')}
                disabled={actioning === org.id}
              >
                {actioning === org.id
                  ? <ActivityIndicator size="small" color={Colors.white} />
                  : <Text style={styles.approveBtnText}>✓ Approve</Text>
                }
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, styles.rejectBtn]}
                onPress={() => reviewOrganizer(org, 'rejected')}
                disabled={actioning === org.id}
              >
                <Text style={styles.rejectBtnText}>✕ Reject</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))
      )}

      {/* Flagged comments */}
      <Text style={[styles.sectionTitle, { marginTop: Spacing['2xl'] }]}>
        Flagged Comments ({flagged.length})
      </Text>

      {flagged.length === 0 ? (
        <View style={styles.emptyRow}>
          <Text style={styles.emptyText}>No flagged comments</Text>
        </View>
      ) : (
        flagged.map((c) => (
          <View key={c.id} style={styles.card}>
            <Text style={styles.cardMeta}>{c.author?.display_name ?? 'Unknown'}</Text>
            <Text style={styles.commentContent} numberOfLines={3}>{c.content}</Text>
            <Text style={styles.cardTime}>{formatRelativeTime(c.created_at)}</Text>
            <View style={styles.cardActions}>
              <TouchableOpacity
                style={[styles.actionBtn, styles.rejectBtn]}
                onPress={() => deleteComment(c)}
                disabled={actioning === c.id}
              >
                {actioning === c.id
                  ? <ActivityIndicator size="small" color={Colors.red.text} />
                  : <Text style={styles.rejectBtnText}>🗑 Delete</Text>
                }
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, styles.dimBtn]}
                onPress={() => unflagComment(c)}
                disabled={actioning === c.id}
              >
                <Text style={styles.dimBtnText}>Unflag</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))
      )}
    </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container:      { flex: 1, backgroundColor: Colors.gray[50] },
  content:        { padding: Spacing.lg, paddingBottom: Spacing['4xl'] },
  centered:       { flex: 1, justifyContent: 'center', alignItems: 'center' },
  screenTitle:    { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.gray[900], marginBottom: Spacing.lg },
  statsGrid:      { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.lg },
  statCard:       { width: '31%', backgroundColor: Colors.white, borderRadius: Radius.md, padding: Spacing.md, alignItems: 'center', ...Shadow.card },
  statCardWarn:   { backgroundColor: Colors.yellow.light },
  statIcon:       { fontSize: 20, marginBottom: 2 },
  statValue:      { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.gray[900] },
  statValueWarn:  { color: Colors.yellow.text },
  statLabel:      { fontSize: FontSize.xs, color: Colors.gray[500], marginTop: 2, textAlign: 'center' },
  sectionTitle:   { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.gray[500], textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: Spacing.sm },
  emptyRow:       { backgroundColor: Colors.white, borderRadius: Radius.md, padding: Spacing.lg, alignItems: 'center', marginBottom: Spacing.md },
  emptyText:      { fontSize: FontSize.sm, color: Colors.gray[400] },
  card:           { backgroundColor: Colors.white, borderRadius: Radius.lg, padding: Spacing.lg, marginBottom: Spacing.md, ...Shadow.card },
  cardTitle:      { fontSize: FontSize.base, fontWeight: FontWeight.semibold, color: Colors.gray[900] },
  cardMeta:       { fontSize: FontSize.sm, color: Colors.gray[500], marginTop: 2 },
  cardTime:       { fontSize: FontSize.xs, color: Colors.gray[400], marginTop: 2, marginBottom: Spacing.sm },
  commentContent: { fontSize: FontSize.sm, color: Colors.gray[700], marginTop: Spacing.xs, lineHeight: 20 },
  cardActions:    { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.sm },
  actionBtn:      { flex: 1, borderRadius: Radius.md, paddingVertical: Spacing.sm, alignItems: 'center' },
  approveBtn:     { backgroundColor: Colors.green.DEFAULT },
  approveBtnText: { color: Colors.white, fontWeight: FontWeight.semibold, fontSize: FontSize.sm },
  rejectBtn:      { backgroundColor: Colors.red.light },
  rejectBtnText:  { color: Colors.red.text, fontWeight: FontWeight.semibold, fontSize: FontSize.sm },
  dimBtn:         { backgroundColor: Colors.gray[100] },
  dimBtnText:     { color: Colors.gray[600], fontWeight: FontWeight.medium, fontSize: FontSize.sm },
})

