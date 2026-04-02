import { useEffect, useState, useCallback } from 'react'
import {
  View, Text, FlatList, TextInput, StyleSheet,
  TouchableOpacity, RefreshControl, ActivityIndicator,
} from 'react-native'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { apiGet, apiPost, apiDelete } from '@/lib/api'
import { useAuth } from '@/contexts/auth-context'
import { useLocale } from '@/contexts/locale-context'
import { EmptyState } from '@/components/ui/EmptyState'
import { Spinner } from '@/components/ui/Spinner'
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadow } from '@/theme'
import type { Community, CommunityLevel } from '@/types/database'

type CommunityWithMembership = Community & { is_member: boolean }

const LEVEL_ICONS: Record<CommunityLevel, string> = {
  micro:    '🏘️',
  interest: '🎯',
  district: '🏙️',
  city:     '🌆',
  country:  '🌍',
}

const LEVEL_FILTERS: { key: CommunityLevel | 'all'; label: string }[] = [
  { key: 'all',      label: 'All' },
  { key: 'micro',    label: '🏘️ Micro' },
  { key: 'interest', label: '🎯 Interest' },
  { key: 'district', label: '🏙️ District' },
  { key: 'city',     label: '🌆 City' },
]

export default function CommunitiesScreen() {
  const { user }       = useAuth()
  const { locale }     = useLocale()
  const router         = useRouter()
  const isRTL          = locale === 'ar'

  const [communities, setCommunities] = useState<CommunityWithMembership[]>([])
  const [loading, setLoading]         = useState(true)
  const [refreshing, setRefreshing]   = useState(false)
  const [search, setSearch]           = useState('')
  const [levelFilter, setLevelFilter] = useState<CommunityLevel | 'all'>('all')
  const [page, setPage]               = useState(1)
  const [hasMore, setHasMore]         = useState(false)
  const [joining, setJoining]         = useState<string | null>(null)

  const load = useCallback(async (p: number, q: string, lvl: CommunityLevel | 'all', append = false) => {
    const params = new URLSearchParams({ page: String(p), per_page: '20' })
    if (q.trim()) params.set('q', q.trim())
    if (lvl !== 'all') params.set('level', lvl)

    const { data } = await apiGet<{ data: CommunityWithMembership[]; has_more: boolean }>(
      `/api/communities?${params}`
    )
    if (data) {
      setCommunities((prev) => append ? [...prev, ...data.data] : data.data)
      setHasMore(data.has_more)
      setPage(p)
    }
    setLoading(false)
    setRefreshing(false)
  }, [])

  useEffect(() => {
    setLoading(true)
    const t = setTimeout(() => load(1, search, levelFilter, false), search ? 300 : 0)
    return () => clearTimeout(t)
  }, [search, levelFilter, load])

  async function handleJoinLeave(community: CommunityWithMembership) {
    if (!user) { router.push('/auth/login'); return }
    setJoining(community.id)
    const { error } = community.is_member
      ? await apiDelete(`/api/communities/${community.slug}/leave`)
      : await apiPost(`/api/communities/${community.slug}/join`, {})

    if (!error) {
      setCommunities((prev) =>
        prev.map((c) =>
          c.id === community.id
            ? {
                ...c,
                is_member: !c.is_member,
                member_count: !c.is_member ? c.member_count + 1 : Math.max(c.member_count - 1, 0),
              }
            : c
        )
      )
    }
    setJoining(null)
  }

  function renderItem({ item }: { item: CommunityWithMembership }) {
    const name = isRTL && item.name_ar ? item.name_ar : item.name
    const isJoining = joining === item.id

    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => router.push(`/communities/${item.slug}` as any)}
        activeOpacity={0.85}
      >
        <View style={styles.cardTop}>
          <View style={styles.iconCircle}>
            <Text style={styles.levelIcon}>{LEVEL_ICONS[item.level]}</Text>
          </View>
          <View style={styles.cardInfo}>
            <View style={styles.cardNameRow}>
              <Text style={styles.cardName} numberOfLines={1}>{name}</Text>
              {item.is_verified && (
                <Ionicons name="checkmark-circle" size={14} color={Colors.brand[500]} />
              )}
            </View>
            <Text style={styles.cardMeta}>
              {item.city ? `📍 ${item.city} · ` : ''}{item.member_count.toLocaleString()} members
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => handleJoinLeave(item)}
            disabled={!!isJoining}
            style={[styles.joinBtn, item.is_member && styles.joinBtnJoined]}
          >
            {isJoining ? (
              <ActivityIndicator size="small" color={item.is_member ? Colors.gray[600] : '#fff'} />
            ) : (
              <Text style={[styles.joinBtnText, item.is_member && styles.joinBtnTextJoined]}>
                {item.is_member ? 'Joined' : 'Join'}
              </Text>
            )}
          </TouchableOpacity>
        </View>
        {item.description ? (
          <Text style={styles.cardDesc} numberOfLines={2}>
            {isRTL && item.description_ar ? item.description_ar : item.description}
          </Text>
        ) : null}
      </TouchableOpacity>
    )
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Communities</Text>
        <Text style={styles.headerSub}>Find and join communities around you</Text>
      </View>

      {/* Search */}
      <View style={styles.searchRow}>
        <Ionicons name="search" size={16} color={Colors.gray[400]} style={styles.searchIcon} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search communities..."
          placeholderTextColor={Colors.gray[400]}
          style={styles.searchInput}
        />
      </View>

      {/* Level filter chips */}
      <FlatList
        horizontal
        data={LEVEL_FILTERS}
        keyExtractor={(f) => f.key}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
        renderItem={({ item: f }) => (
          <TouchableOpacity
            onPress={() => setLevelFilter(f.key)}
            style={[styles.filterChip, levelFilter === f.key && styles.filterChipActive]}
          >
            <Text style={[styles.filterChipText, levelFilter === f.key && styles.filterChipTextActive]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        )}
      />

      {/* List */}
      {loading ? (
        <View style={styles.center}><Spinner /></View>
      ) : communities.length === 0 ? (
        <EmptyState icon="🏘️" title="No communities found" description="Try a different search" />
      ) : (
        <FlatList
          data={communities}
          keyExtractor={(c) => c.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(1, search, levelFilter, false) }} />
          }
          onEndReached={() => { if (hasMore && !loading) load(page + 1, search, levelFilter, true) }}
          onEndReachedThreshold={0.4}
          ListFooterComponent={hasMore ? <View style={styles.center}><Spinner /></View> : null}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container:     { flex: 1, backgroundColor: Colors.gray[50] },
  header:        { paddingHorizontal: Spacing[4], paddingTop: Spacing[6], paddingBottom: Spacing[2] },
  headerTitle:   { fontSize: FontSize['2xl'], fontWeight: FontWeight.bold, color: Colors.gray[900] },
  headerSub:     { fontSize: FontSize.sm, color: Colors.gray[500], marginTop: 2 },
  searchRow:     { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', marginHorizontal: Spacing[4], marginVertical: Spacing[3], borderRadius: Radius.xl, paddingHorizontal: Spacing[3], borderWidth: 1, borderColor: Colors.gray[200] },
  searchIcon:    { marginRight: Spacing[2] },
  searchInput:   { flex: 1, paddingVertical: Spacing[3], fontSize: FontSize.sm, color: Colors.gray[900] },
  filterRow:     { paddingHorizontal: Spacing[4], gap: Spacing[2], paddingBottom: Spacing[2] },
  filterChip:    { paddingHorizontal: Spacing[3], paddingVertical: Spacing[1], borderRadius: Radius.full, backgroundColor: '#fff', borderWidth: 1, borderColor: Colors.gray[200] },
  filterChipActive: { backgroundColor: Colors.brand[600], borderColor: Colors.brand[600] },
  filterChipText:   { fontSize: FontSize.xs, fontWeight: FontWeight.medium, color: Colors.gray[600] },
  filterChipTextActive: { color: '#fff' },
  list:          { padding: Spacing[4], gap: Spacing[3] },
  card:          { backgroundColor: '#fff', borderRadius: Radius['2xl'], padding: Spacing[4], ...Shadow.sm },
  cardTop:       { flexDirection: 'row', alignItems: 'center', gap: Spacing[3] },
  iconCircle:    { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.brand[50], alignItems: 'center', justifyContent: 'center' },
  levelIcon:     { fontSize: 20 },
  cardInfo:      { flex: 1 },
  cardNameRow:   { flexDirection: 'row', alignItems: 'center', gap: 4 },
  cardName:      { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.gray[900], flex: 1 },
  cardMeta:      { fontSize: FontSize.xs, color: Colors.gray[500], marginTop: 2 },
  cardDesc:      { fontSize: FontSize.xs, color: Colors.gray[500], marginTop: Spacing[2], lineHeight: 18 },
  joinBtn:       { backgroundColor: Colors.brand[600], borderRadius: Radius.lg, paddingHorizontal: Spacing[3], paddingVertical: Spacing[1], minWidth: 56, alignItems: 'center' },
  joinBtnJoined: { backgroundColor: Colors.gray[100] },
  joinBtnText:   { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, color: '#fff' },
  joinBtnTextJoined: { color: Colors.gray[700] },
  center:        { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: Spacing[8] },
})
