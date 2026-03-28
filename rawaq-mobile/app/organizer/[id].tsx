import { useEffect, useState } from 'react'
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  Linking, ActivityIndicator, Alert,
} from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { apiPost, apiDelete } from '@/lib/api'
import { useAuth } from '@/contexts/auth-context'
import { EventCard } from '@/components/events/EventCard'
import { EmptyState } from '@/components/ui/EmptyState'
import { Badge } from '@/components/ui/Badge'
import { formatDate } from '@/lib/utils'
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadow } from '@/theme'
import type { EventWithOrganizer, OrganizerProfile, Profile } from '@/types/database'

type OrganizerData = {
  profile: Pick<Profile, 'id' | 'display_name' | 'avatar_url' | 'city' | 'bio' | 'created_at'>
  orgProfile: Pick<OrganizerProfile, 'business_name' | 'business_name_ar' | 'description' | 'description_ar' | 'logo_url' | 'website' | 'phone' | 'verified' | 'status'> & { followers_count: number }
  events: EventWithOrganizer[]
  savedIds: Set<string>
  isFollowing: boolean
  isBlocking: boolean
}

export default function OrganizerProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { user } = useAuth()
  const router = useRouter()
  const [data, setData] = useState<OrganizerData | null>(null)
  const [loading, setLoading] = useState(true)
  const [followLoading, setFollowLoading] = useState(false)
  const [blockLoading, setBlockLoading]   = useState(false)

  useEffect(() => {
    if (!id) return

    async function load() {
      const queries: Promise<unknown>[] = [
        supabase.from('profiles').select('id, display_name, avatar_url, city, bio, created_at').eq('id', id).single(),
        supabase.from('organizer_profiles')
          .select('business_name, business_name_ar, description, description_ar, logo_url, website, phone, verified, status, followers_count')
          .eq('user_id', id).single(),
        supabase.from('events')
          .select(`*,
            organizer:profiles!organizer_id(id, display_name, avatar_url,
              organizer_profile:organizer_profiles!user_id(business_name, business_name_ar, logo_url, verified)),
            category:event_categories(id, name_en, name_ar, icon)
          `)
          .eq('organizer_id', id).eq('is_published', true).eq('is_cancelled', false)
          .gte('start_at', new Date().toISOString())
          .order('start_at', { ascending: true }).limit(12),
      ]

      const [{ data: profile }, { data: orgProfile }, { data: events }] =
        await Promise.all(queries) as [{ data: OrganizerData['profile'] | null }, { data: (OrganizerData['orgProfile'] & { status: string }) | null }, { data: EventWithOrganizer[] | null }]

      if (!profile || !orgProfile || orgProfile.status !== 'approved') {
        setLoading(false); return
      }

      let savedIds   = new Set<string>()
      let isFollowing = false
      let isBlocking  = false

      if (user && user.id !== id) {
        const socialQueries = [
          events?.length
            ? supabase.from('saved_events').select('event_id').eq('user_id', user.id).in('event_id', events.map((e) => e.id))
            : Promise.resolve({ data: [] as { event_id: string }[] }),
          supabase.from('organizer_follows').select('id').eq('follower_id', user.id).eq('organizer_id', id).maybeSingle(),
          supabase.from('user_blocks').select('id').eq('blocker_id', user.id).eq('blocked_id', id).maybeSingle(),
        ]
        const [savesRes, followRes, blockRes] = await Promise.all(socialQueries) as [
          { data: { event_id: string }[] | null },
          { data: { id: string } | null },
          { data: { id: string } | null },
        ]
        savedIds    = new Set((savesRes.data ?? []).map((s) => s.event_id))
        isFollowing = !!followRes.data
        isBlocking  = !!blockRes.data
      } else if (user && events?.length) {
        const { data: saves } = await supabase
          .from('saved_events').select('event_id').eq('user_id', user.id)
          .in('event_id', events.map((e) => e.id))
        savedIds = new Set((saves ?? []).map((s) => s.event_id))
      }

      setData({ profile, orgProfile, events: (events ?? []) as EventWithOrganizer[], savedIds, isFollowing, isBlocking })
      setLoading(false)
    }

    load()
  }, [id, user])

  async function toggleFollow() {
    if (!data || !user) return
    setFollowLoading(true)
    const next = !data.isFollowing
    setData((d) => d ? {
      ...d,
      isFollowing: next,
      orgProfile: { ...d.orgProfile, followers_count: next ? d.orgProfile.followers_count + 1 : Math.max(0, d.orgProfile.followers_count - 1) },
    } : d)
    if (next) {
      await apiPost(`/api/organizer/${id}/follow`, {})
    } else {
      await apiDelete(`/api/organizer/${id}/follow`)
    }
    setFollowLoading(false)
  }

  async function toggleBlock() {
    if (!data || !user) return
    setBlockLoading(true)
    const next = !data.isBlocking
    setData((d) => d ? { ...d, isBlocking: next } : d)
    if (next) {
      await supabase.from('user_blocks').upsert({ blocker_id: user.id, blocked_id: id as string }, { onConflict: 'blocker_id,blocked_id' })
    } else {
      await supabase.from('user_blocks').delete().eq('blocker_id', user.id).eq('blocked_id', id as string)
    }
    setBlockLoading(false)
  }

  if (loading) {
    return <View style={styles.centered}><ActivityIndicator size="large" color={Colors.brand[500]} /></View>
  }

  if (!data) {
    return (
      <View style={styles.centered}>
        <Text style={{ color: Colors.gray[500] }}>Organizer not found</Text>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: Spacing.md }}>
          <Text style={{ color: Colors.brand[500] }}>← Go back</Text>
        </TouchableOpacity>
      </View>
    )
  }

  const { profile, orgProfile, events, savedIds } = data
  const displayName = orgProfile.business_name ?? profile.display_name
  const initials = displayName.split(' ').slice(0, 2).map((w: string) => w[0]).join('').toUpperCase()

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: Spacing.xs }}>
            <Text style={styles.name}>{displayName}</Text>
            {orgProfile.verified && <Badge label="✅ Verified" variant="green" />}
          </View>
          {orgProfile.business_name_ar && (
            <Text style={[styles.nameAr]} numberOfLines={1}>{orgProfile.business_name_ar}</Text>
          )}
          {profile.city && <Text style={styles.meta}>📍 {profile.city}</Text>}
          <Text style={styles.since}>Member since {formatDate(profile.created_at)}</Text>
        </View>
      </View>

      {/* Social actions */}
      {user && user.id !== id && (
        <View style={styles.socialRow}>
          <TouchableOpacity
            onPress={toggleFollow}
            disabled={followLoading}
            style={[styles.followBtn, data?.isFollowing && styles.followBtnActive]}
          >
            <Text style={[styles.followBtnText, data?.isFollowing && styles.followBtnTextActive]}>
              {followLoading ? '…' : data?.isFollowing ? '✓ Following' : '+ Follow'}
            </Text>
          </TouchableOpacity>
          {orgProfile.followers_count > 0 && (
            <Text style={styles.followCount}>
              {orgProfile.followers_count.toLocaleString()} follower{orgProfile.followers_count !== 1 ? 's' : ''}
            </Text>
          )}
          <TouchableOpacity
            onPress={() =>
              Alert.alert(
                data?.isBlocking ? 'Unblock user?' : 'Block user?',
                data?.isBlocking ? 'They will be able to interact with you again.' : 'They will not be able to interact with you.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  { text: data?.isBlocking ? 'Unblock' : 'Block', style: data?.isBlocking ? 'default' : 'destructive', onPress: toggleBlock },
                ]
              )
            }
            disabled={blockLoading}
            style={[styles.blockBtn, data?.isBlocking && styles.blockBtnActive]}
          >
            <Text style={[styles.blockBtnText, data?.isBlocking && styles.blockBtnTextActive]}>
              {data?.isBlocking ? '🚫 Blocked' : '⋯'}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Links */}
      <View style={styles.links}>
        {orgProfile.website && (
          <TouchableOpacity onPress={() => Linking.openURL(orgProfile.website!)} style={styles.linkBtn}>
            <Text style={styles.linkText}>🌐 Website</Text>
          </TouchableOpacity>
        )}
        {orgProfile.phone && (
          <TouchableOpacity onPress={() => Linking.openURL(`tel:${orgProfile.phone}`)} style={styles.linkBtn}>
            <Text style={styles.linkText}>📞 {orgProfile.phone}</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Description */}
      {orgProfile.description && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>About</Text>
          <Text style={styles.description}>{orgProfile.description}</Text>
        </View>
      )}

      {/* Events */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>
          Upcoming Events {events.length ? `(${events.length})` : ''}
        </Text>
        {events.length === 0 ? (
          <EmptyState icon="📭" title="No upcoming events" description="Check back soon" />
        ) : (
          events.map((event) => (
            <EventCard key={event.id} event={event} isSaved={savedIds.has(event.id)} />
          ))
        )}
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.gray[50] },
  content: { paddingBottom: Spacing['4xl'] },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: Spacing['3xl'] },
  header: { flexDirection: 'row', gap: Spacing.md, backgroundColor: Colors.white, padding: Spacing.lg, borderBottomWidth: 1, borderBottomColor: Colors.gray[100], alignItems: 'flex-start' },
  avatar: { width: 64, height: 64, borderRadius: Radius.lg, backgroundColor: Colors.brand[100], justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  avatarText: { fontSize: 22, fontWeight: FontWeight.bold, color: Colors.brand[700] },
  name: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.gray[900] },
  nameAr: { fontSize: FontSize.sm, color: Colors.gray[500], marginTop: 2 },
  meta: { fontSize: FontSize.sm, color: Colors.gray[500], marginTop: 2 },
  since: { fontSize: FontSize.xs, color: Colors.gray[400], marginTop: 4 },
  socialRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.gray[100] },
  followBtn: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.white },
  followBtnActive: { borderColor: Colors.brand[300], backgroundColor: Colors.brand[50] },
  followBtnText: { fontSize: FontSize.sm, fontWeight: FontWeight.medium, color: Colors.gray[700] },
  followBtnTextActive: { color: Colors.brand[700] },
  followCount: { fontSize: FontSize.xs, color: Colors.gray[400] },
  blockBtn: { marginLeft: 'auto' as const, paddingHorizontal: Spacing.sm, paddingVertical: Spacing.sm, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.gray[200] },
  blockBtnActive: { borderColor: Colors.red.DEFAULT, backgroundColor: Colors.red.light },
  blockBtnText: { fontSize: FontSize.sm, color: Colors.gray[500] },
  blockBtnTextActive: { color: Colors.red.text },
  links: { flexDirection: 'row', gap: Spacing.sm, padding: Spacing.lg, backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.gray[100] },
  linkBtn: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.brand[200], backgroundColor: Colors.brand[50] },
  linkText: { fontSize: FontSize.sm, color: Colors.brand[600], fontWeight: FontWeight.medium },
  section: { margin: Spacing.lg },
  sectionTitle: { fontSize: FontSize.base, fontWeight: FontWeight.semibold, color: Colors.gray[900], marginBottom: Spacing.sm },
  description: { fontSize: FontSize.sm, color: Colors.gray[600], lineHeight: 20 },
})
