import { useEffect, useState, useCallback, useRef } from 'react'
import {
  View, Text, FlatList, TextInput, StyleSheet,
  TouchableOpacity, RefreshControl, ActivityIndicator,
} from 'react-native'
import { useFocusEffect, useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { apiGet, apiPost, apiDelete } from '@/lib/api'
import { useAuth } from '@/contexts/auth-context'
import { useLocale } from '@/contexts/locale-context'
import { EmptyState } from '@/components/ui/EmptyState'
import { Spinner } from '@/components/ui/Spinner'
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadow } from '@/theme'
import type { Community, CommunityLevel } from '@/types/database'

type CommunityWithMembership = Community & { is_member: boolean }
type MembershipMutationResponse = { is_member?: boolean; member_count?: number }

const LEVEL_META: Record<CommunityLevel, { label: string; icon: keyof typeof Ionicons.glyphMap; tint: string; bg: string }> = {
  micro:    { label: 'Micro', icon: 'home-outline', tint: '#166534', bg: '#dcfce7' },
  interest: { label: 'Interest', icon: 'sparkles-outline', tint: '#7c3aed', bg: '#f3e8ff' },
  district: { label: 'District', icon: 'business-outline', tint: '#b45309', bg: '#fef3c7' },
  city:     { label: 'City', icon: 'location-outline', tint: '#1d4ed8', bg: '#dbeafe' },
  country:  { label: 'Country', icon: 'earth-outline', tint: '#be123c', bg: '#ffe4e6' },
}

const LEVEL_FILTER_OPTIONS: { key: CommunityLevel | 'all'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'micro', label: 'Micro' },
  { key: 'interest', label: 'Interest' },
  { key: 'district', label: 'District' },
  { key: 'city', label: 'City' },
]

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
  const [joinedOnly, setJoinedOnly]   = useState(false)
  const [page, setPage]               = useState(1)
  const [hasMore, setHasMore]         = useState(false)
  const [joining, setJoining]         = useState<string | null>(null)
  const isLoadingPageRef              = useRef(false)

  const load = useCallback(async (p: number, q: string, lvl: CommunityLevel | 'all', memberOnly = false, append = false) => {
    if (isLoadingPageRef.current) return
    isLoadingPageRef.current = true

    const params = new URLSearchParams({ page: String(p), per_page: '20' })
    if (q.trim()) params.set('q', q.trim())
    if (lvl !== 'all') params.set('level', lvl)
    if (memberOnly) params.set('member_only', 'true')

    try {
      const { data } = await apiGet<{ data: CommunityWithMembership[]; has_more: boolean }>(
        `/api/communities?${params}`
      )

      if (data) {
        setCommunities((prev) => {
          const next = append ? [...prev, ...data.data] : data.data
          const seen = new Set<string>()
          return next.filter((community) => {
            if (seen.has(community.id)) return false
            seen.add(community.id)
            return true
          })
        })
        setHasMore(data.has_more)
        setPage(p)
      }
    } finally {
      isLoadingPageRef.current = false
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    setLoading(true)
    const t = setTimeout(() => load(1, search, levelFilter, joinedOnly, false), search ? 300 : 0)
    return () => clearTimeout(t)
  }, [search, levelFilter, joinedOnly, load])

  useFocusEffect(
    useCallback(() => {
      load(1, search, levelFilter, joinedOnly, false)
    }, [load, search, levelFilter, joinedOnly]),
  )

  async function handleJoinLeave(community: CommunityWithMembership) {
    if (!user) { router.push('/auth/login'); return }
    setJoining(community.id)
    const { data, error } = community.is_member
      ? await apiDelete<MembershipMutationResponse>(`/api/communities/${community.slug}/leave`)
      : await apiPost<MembershipMutationResponse>(`/api/communities/${community.slug}/join`, {})

    if (!error) {
      setCommunities((prev) =>
        prev
        .map((c) =>
          c.id === community.id
            ? {
                ...c,
                is_member: data?.is_member ?? !c.is_member,
                member_count: data?.member_count ?? (!c.is_member ? c.member_count + 1 : Math.max(c.member_count - 1, 0)),
              }
            : c
        )
        .filter((c) => !joinedOnly || c.is_member)
      )
    }
    setJoining(null)
  }

  function renderItem({ item }: { item: CommunityWithMembership }) {
    const name = isRTL && item.name_ar ? item.name_ar : item.name
    const description = isRTL && item.description_ar ? item.description_ar : item.description
    const isJoining = joining === item.id
    const levelMeta = LEVEL_META[item.level]

    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => router.push(`/communities/${item.slug}` as any)}
        activeOpacity={0.85}
      >
        <View style={styles.cardTop}>
          <View style={[styles.iconCircle, { backgroundColor: levelMeta.bg }]}>
            <Ionicons name={levelMeta.icon} size={20} color={levelMeta.tint} />
          </View>
          <View style={styles.cardInfo}>
            <View style={styles.cardNameRow}>
              <Text style={styles.cardName} numberOfLines={1}>{name}</Text>
              {item.is_verified && (
                <Ionicons name="checkmark-circle" size={14} color={Colors.brand[500]} />
              )}
            </View>
            <View style={styles.pillRow}>
              <View style={[styles.levelPill, { backgroundColor: levelMeta.bg }]}>
                <Text style={[styles.levelPillText, { color: levelMeta.tint }]}>{levelMeta.label}</Text>
              </View>
              {item.is_member && (
                <View style={styles.memberBadge}>
                  <Ionicons name="checkmark-circle" size={12} color={Colors.green.text} />
                  <Text style={styles.memberBadgeText}>Joined</Text>
                </View>
              )}
            </View>
            <Text style={styles.cardMeta}>
              {item.city ? `📍 ${item.city} · ` : ''}{item.member_count.toLocaleString()} members
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => handleJoinLeave(item)}
            disabled={!!isJoining}
            style={[styles.joinBtn, item.is_member ? styles.joinBtnJoined : styles.joinBtnNotJoined]}
          >
            {isJoining ? (
              <ActivityIndicator size="small" color={item.is_member ? Colors.green.text : '#fff'} />
            ) : (
              <View style={styles.joinBtnContent}>
                <Ionicons
                  name={item.is_member ? 'checkmark-circle' : 'add-circle-outline'}
                  size={14}
                  color={item.is_member ? Colors.green.text : '#fff'}
                />
                <Text style={[styles.joinBtnText, item.is_member && styles.joinBtnTextJoined]}>
                  {item.is_member ? 'Joined' : 'Join'}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
        {description ? (
          <Text style={styles.cardDesc} numberOfLines={2}>
            {description}
          </Text>
        ) : null}
      </TouchableOpacity>
    )
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerEyebrow}>Community Explorer</Text>
        <Text style={styles.headerTitle}>Find your people</Text>
        <Text style={styles.headerSub}>Browse local groups, interest circles, and city communities that fit your real-world life.</Text>
      </View>

      <View style={styles.filtersCard}>
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

        <View style={styles.filterHeaderRow}>
          <Text style={styles.filterTitle}>Filter by type</Text>
          {user ? (
            <TouchableOpacity
              onPress={() => setJoinedOnly((prev) => !prev)}
              style={[styles.memberFilterChip, joinedOnly && styles.memberFilterChipActive]}
            >
              <Ionicons
                name={joinedOnly ? 'people' : 'people-outline'}
                size={14}
                color={joinedOnly ? Colors.white : Colors.brand[600]}
              />
              <Text style={[styles.memberFilterText, joinedOnly && styles.memberFilterTextActive]}>
                My Communities
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>

        <FlatList
          horizontal
          data={LEVEL_FILTER_OPTIONS}
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
      </View>

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
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(1, search, levelFilter, joinedOnly, false) }} />
          }
          onEndReached={() => {
            if (hasMore && !loading && !isLoadingPageRef.current) {
              load(page + 1, search, levelFilter, joinedOnly, true)
            }
          }}
          onEndReachedThreshold={0.4}
          ListFooterComponent={hasMore ? <View style={styles.center}><Spinner /></View> : null}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f7f8fc' },
  header: {
    paddingHorizontal: Spacing[4],
    paddingTop: Spacing[6],
    paddingBottom: Spacing[3],
    backgroundColor: '#eef3ff',
    borderBottomWidth: 1,
    borderBottomColor: '#dbe7ff',
  },
  headerEyebrow: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    color: Colors.brand[600],
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  headerTitle: { fontSize: FontSize['2xl'], fontWeight: FontWeight.bold, color: Colors.gray[900], marginTop: 6 },
  headerSub: { fontSize: FontSize.sm, color: Colors.gray[600], marginTop: 6, lineHeight: 20 },
  filtersCard: {
    marginHorizontal: Spacing[4],
    marginTop: Spacing[4],
    marginBottom: Spacing[3],
    backgroundColor: Colors.white,
    borderRadius: Radius['2xl'],
    padding: Spacing[4],
    borderWidth: 1,
    borderColor: Colors.gray[200],
    ...Shadow.sm,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.gray[50],
    borderRadius: Radius.xl,
    paddingHorizontal: Spacing[3],
    borderWidth: 1,
    borderColor: Colors.gray[200],
  },
  searchIcon: { marginRight: Spacing[2] },
  searchInput: { flex: 1, paddingVertical: Spacing[3], fontSize: FontSize.sm, color: Colors.gray[900] },
  filterHeaderRow: {
    marginTop: Spacing[4],
    marginBottom: Spacing[2],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing[2],
  },
  filterTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.gray[800] },
  memberFilterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Spacing[3],
    paddingVertical: Spacing[2],
    borderRadius: Radius.full,
    backgroundColor: Colors.brand[50],
    borderWidth: 1,
    borderColor: Colors.brand[100],
  },
  memberFilterChipActive: { backgroundColor: Colors.brand[600], borderColor: Colors.brand[600] },
  memberFilterText: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, color: Colors.brand[600] },
  memberFilterTextActive: { color: Colors.white },
  filterRow: { paddingTop: Spacing[1], gap: Spacing[2] },
  filterChip: {
    paddingHorizontal: Spacing[3],
    paddingVertical: Spacing[2],
    borderRadius: Radius.full,
    backgroundColor: Colors.gray[50],
    borderWidth: 1,
    borderColor: Colors.gray[200],
    marginRight: Spacing[2],
  },
  filterChipActive: { backgroundColor: Colors.brand[600], borderColor: Colors.brand[600] },
  filterChipText: { fontSize: FontSize.xs, fontWeight: FontWeight.medium, color: Colors.gray[700] },
  filterChipTextActive: { color: '#fff' },
  list: { paddingHorizontal: Spacing[4], paddingBottom: Spacing[6], gap: Spacing[3] },
  card: {
    backgroundColor: '#fff',
    borderRadius: Radius['2xl'],
    padding: Spacing[4],
    borderWidth: 1,
    borderColor: Colors.gray[200],
    ...Shadow.sm,
  },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing[3] },
  iconCircle: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  levelIcon: { fontSize: 20 },
  cardInfo: { flex: 1 },
  cardNameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  cardName: { fontSize: FontSize.base, fontWeight: FontWeight.semibold, color: Colors.gray[900], flex: 1 },
  pillRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 8 },
  levelPill: { paddingHorizontal: Spacing[2], paddingVertical: 4, borderRadius: Radius.full },
  levelPillText: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold },
  memberBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing[2],
    paddingVertical: 4,
    borderRadius: Radius.full,
    backgroundColor: Colors.green.light,
  },
  memberBadgeText: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, color: Colors.green.text },
  cardMeta: { fontSize: FontSize.xs, color: Colors.gray[500], marginTop: 8 },
  cardDesc: { fontSize: FontSize.xs, color: Colors.gray[600], marginTop: Spacing[3], lineHeight: 18 },
  joinBtn: {
    borderRadius: Radius.xl,
    paddingHorizontal: Spacing[3],
    paddingVertical: Spacing[2],
    minWidth: 88,
    alignItems: 'center',
    justifyContent: 'center',
  },
  joinBtnContent: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  joinBtnNotJoined: { backgroundColor: Colors.brand[600] },
  joinBtnJoined: { backgroundColor: Colors.green.light, borderWidth: 1, borderColor: '#86efac' },
  joinBtnText: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, color: '#fff' },
  joinBtnTextJoined: { color: Colors.green.text },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: Spacing[8] },
})
