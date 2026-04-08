import { useEffect, useState, useCallback, useRef } from 'react'
import {
  View, Text, FlatList, TextInput, StyleSheet,
  TouchableOpacity, RefreshControl, ActivityIndicator,
  Animated,
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
type TrendingCommunity = CommunityWithMembership & { trending_score?: number }
type MembershipMutationResponse = { is_member?: boolean; member_count?: number }

const LEVEL_META: Record<CommunityLevel, { label: string; icon: keyof typeof Ionicons.glyphMap; tint: string; bg: string; accent: string }> = {
  micro:    { label: 'Micro',    icon: 'home-outline',     tint: '#166534', bg: '#dcfce7', accent: '#16a34a' },
  interest: { label: 'Interest', icon: 'sparkles-outline', tint: '#6d28d9', bg: '#ede9fe', accent: '#7c3aed' },
  district: { label: 'District', icon: 'business-outline', tint: '#92400e', bg: '#fef3c7', accent: '#d97706' },
  city:     { label: 'City',     icon: 'location-outline', tint: '#1e40af', bg: '#dbeafe', accent: '#2563eb' },
  country:  { label: 'Country',  icon: 'earth-outline',    tint: '#9f1239', bg: '#ffe4e6', accent: '#e11d48' },
}

const LEVEL_FILTER_OPTIONS: { key: CommunityLevel | 'all'; label: string }[] = [
  { key: 'all',      label: 'All' },
  { key: 'micro',    label: 'Micro' },
  { key: 'interest', label: 'Interest' },
  { key: 'district', label: 'District' },
  { key: 'city',     label: 'City' },
]

export default function CommunitiesScreen() {
  const { user }   = useAuth()
  const { locale } = useLocale()
  const router     = useRouter()
  const isRTL      = locale === 'ar'

  const [communities, setCommunities] = useState<CommunityWithMembership[]>([])
  const [loading, setLoading]         = useState(true)
  const [refreshing, setRefreshing]   = useState(false)
  const [search, setSearch]           = useState('')
  const [levelFilter, setLevelFilter] = useState<CommunityLevel | 'all'>('all')
  const [joinedOnly, setJoinedOnly]   = useState(false)
  const [page, setPage]               = useState(1)
  const [hasMore, setHasMore]         = useState(false)
  const [trending, setTrending]       = useState<TrendingCommunity[]>([])
  const [recommended, setRecommended] = useState<CommunityWithMembership[]>([])
  const [popular, setPopular]         = useState<CommunityWithMembership[]>([])
  const [joining, setJoining]         = useState<string | null>(null)
  const isLoadingPageRef              = useRef(false)
  const discoveryVisibility           = useRef(new Animated.Value(1)).current
  const [discoveryVisible, setDiscoveryVisible] = useState(true)
  const lastScrollYRef                = useRef(0)
  const scrollDirectionLockRef        = useRef<'up' | 'down' | null>(null)
  const popularCommunities = popular.filter(
    (community) =>
      !recommended.some((item) => item.id === community.id) &&
      !trending.some((item) => item.id === community.id),
  )

  const loadTrending = useCallback(async () => {
    try {
      const { data } = await apiGet<{ data: TrendingCommunity[] }>(`/api/communities/trending?per_page=8&page=1`)
      setTrending(data?.data ?? [])
    } catch {
      setTrending([])
    }
  }, [])

  const loadRecommended = useCallback(async () => {
    if (!user) {
      setRecommended([])
      return
    }

    const { data } = await apiGet<{ data: CommunityWithMembership[] }>('/api/communities?recommended=true&per_page=6&page=1')
    setRecommended((data?.data ?? []).filter((community) => !community.is_member))
  }, [user])

  const loadPopular = useCallback(async () => {
    if (!user) {
      setPopular([])
      return
    }

    const { data } = await apiGet<{ data: CommunityWithMembership[] }>('/api/communities?per_page=6&page=1')
    setPopular((data?.data ?? []).filter((community) => !community.is_member))
  }, [user])

  const load = useCallback(async (p: number, q: string, lvl: CommunityLevel | 'all', memberOnly = false, append = false) => {
    if (isLoadingPageRef.current) return
    isLoadingPageRef.current = true
    const params = new URLSearchParams({ page: String(p), per_page: '20' })
    if (q.trim()) params.set('q', q.trim())
    if (lvl !== 'all') params.set('level', lvl)
    if (memberOnly) params.set('member_only', 'true')
    try {
      const { data } = await apiGet<{ data: CommunityWithMembership[]; has_more: boolean }>(`/api/communities?${params}`)
      if (data) {
        setCommunities((prev) => {
          const next = append ? [...prev, ...data.data] : data.data
          const seen = new Set<string>()
          return next.filter((c) => { if (seen.has(c.id)) return false; seen.add(c.id); return true })
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

  useEffect(() => {
    void loadTrending()
  }, [loadTrending])
  useEffect(() => {
    void loadRecommended()
    void loadPopular()
  }, [loadRecommended, loadPopular])

  useFocusEffect(useCallback(() => { load(1, search, levelFilter, joinedOnly, false) }, [load, search, levelFilter, joinedOnly]))
  useFocusEffect(useCallback(() => { void loadTrending() }, [loadTrending]))
  useFocusEffect(useCallback(() => { void loadRecommended(); void loadPopular() }, [loadRecommended, loadPopular]))

  function applyMembershipUpdate(
    communityId: string,
    nextMemberState: boolean,
    nextMemberCount?: number,
  ) {
    const patchList = (items: CommunityWithMembership[]) =>
      items
        .map((community) =>
          community.id === communityId
            ? {
                ...community,
                is_member: nextMemberState,
                member_count: nextMemberCount ?? (nextMemberState ? community.member_count + 1 : Math.max(community.member_count - 1, 0)),
              }
            : community,
        )
        .filter((community) => !joinedOnly || community.is_member)

    setCommunities((prev) => patchList(prev))
    setTrending((prev) => patchList(prev))
    setRecommended((prev) => patchList(prev).filter((community) => !community.is_member))
    setPopular((prev) => patchList(prev).filter((community) => !community.is_member))
  }

  async function handleJoinLeave(community: CommunityWithMembership) {
    if (!user) { router.push('/auth/login' as any); return }
    setJoining(community.id)
    const { data, error } = community.is_member
      ? await apiDelete<MembershipMutationResponse>(`/api/communities/${community.slug}/leave`)
      : await apiPost<MembershipMutationResponse>(`/api/communities/${community.slug}/join`, {})
    if (!error) {
      applyMembershipUpdate(
        community.id,
        data?.is_member ?? !community.is_member,
        data?.member_count,
      )
    }
    setJoining(null)
  }

  function renderDiscoveryCard(item: CommunityWithMembership, tone: 'recommended' | 'popular' | 'trending') {
    const meta = LEVEL_META[item.level]
    const name = isRTL && item.name_ar ? item.name_ar : item.name
    const isJoining = joining === item.id
    const toneStyle = tone === 'recommended'
      ? styles.recommendedCard
      : tone === 'trending'
        ? styles.trendingCard
        : styles.popularCard

    return (
      <TouchableOpacity
        key={item.id}
        onPress={() => router.push(`/communities/${item.slug}` as any)}
        activeOpacity={0.88}
        style={toneStyle}
      >
        <View style={[styles.discoveryMiniIcon, { backgroundColor: meta.bg }]}>
          <Ionicons name={meta.icon} size={18} color={meta.tint} />
        </View>
        <Text style={styles.discoveryMiniName} numberOfLines={1}>{name}</Text>
        <Text style={styles.discoveryMiniMeta} numberOfLines={1}>
          {tone !== 'popular' ? `${meta.label}${item.city ? ` · ${item.city}` : ''} · ` : ''}
          {item.member_count.toLocaleString()} members
        </Text>
        <TouchableOpacity
          onPress={() => handleJoinLeave(item)}
          disabled={isJoining}
          style={styles.discoveryJoinBtn}
        >
          {isJoining
            ? <ActivityIndicator size="small" color="#fff" />
            : <Text style={styles.discoveryJoinText}>Join</Text>}
        </TouchableOpacity>
      </TouchableOpacity>
    )
  }

  function renderItem({ item }: { item: CommunityWithMembership }) {
    const name        = isRTL && item.name_ar ? item.name_ar : item.name
    const description = isRTL && item.description_ar ? item.description_ar : item.description
    const isJoining   = joining === item.id
    const meta        = LEVEL_META[item.level]

    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => router.push(`/communities/${item.slug}` as any)}
        activeOpacity={0.88}
      >
        {/* Left accent bar */}
        <View style={[styles.cardAccent, { backgroundColor: meta.accent }]} />

        <View style={styles.cardBody}>
          {/* Top row */}
          <View style={styles.cardTop}>
            <View style={[styles.iconWrap, { backgroundColor: meta.bg }]}>
              <Ionicons name={meta.icon} size={22} color={meta.tint} />
            </View>

            <View style={styles.cardCenter}>
              <View style={styles.nameRow}>
                <Text style={styles.cardName} numberOfLines={1}>{name}</Text>
                {item.is_verified && <Ionicons name="checkmark-circle" size={15} color={Colors.brand[500]} />}
              </View>
              <View style={styles.tagRow}>
                <View style={[styles.levelTag, { backgroundColor: meta.bg }]}>
                  <Text style={[styles.levelTagText, { color: meta.tint }]}>{meta.label}</Text>
                </View>
                {item.city ? <Text style={styles.cityText}>{item.city}</Text> : null}
                {item.is_member && (
                  <View style={styles.joinedTag}>
                    <Ionicons name="checkmark-circle" size={11} color="#15803d" />
                    <Text style={styles.joinedTagText}>Joined</Text>
                  </View>
                )}
              </View>
            </View>

            <TouchableOpacity
              onPress={() => handleJoinLeave(item)}
              disabled={!!isJoining}
              style={[styles.joinBtn, item.is_member ? styles.joinBtnJoined : styles.joinBtnDefault]}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              {isJoining
                ? <ActivityIndicator size="small" color={item.is_member ? '#15803d' : '#fff'} />
                : <Text style={[styles.joinBtnText, item.is_member && styles.joinBtnTextJoined]}>
                    {item.is_member ? 'Joined' : 'Join'}
                  </Text>
              }
            </TouchableOpacity>
          </View>

          {/* Description */}
          {description
            ? <Text style={styles.desc} numberOfLines={2}>{description}</Text>
            : null
          }

          {/* Footer */}
          <View style={styles.cardFooter}>
            <Ionicons name="people-outline" size={13} color={Colors.gray[400]} />
            <Text style={styles.footerText}>{item.member_count.toLocaleString()} members</Text>
          </View>
        </View>
      </TouchableOpacity>
    )
  }

  function setDiscoveryExpanded(visible: boolean) {
    if (visible === discoveryVisible) return
    setDiscoveryVisible(visible)
    Animated.timing(discoveryVisibility, {
      toValue: visible ? 1 : 0,
      duration: 180,
      useNativeDriver: false,
    }).start()
  }

  function handleListScroll(event: { nativeEvent: { contentOffset: { y: number } } }) {
    const nextY = Math.max(0, event.nativeEvent.contentOffset.y)
    const delta = nextY - lastScrollYRef.current
    lastScrollYRef.current = nextY

    if (nextY < 24) {
      scrollDirectionLockRef.current = null
      setDiscoveryExpanded(true)
      return
    }

    if (Math.abs(delta) < 6) return

    if (delta > 0 && scrollDirectionLockRef.current !== 'down') {
      scrollDirectionLockRef.current = 'down'
      setDiscoveryExpanded(false)
      return
    }

    if (delta < 0 && scrollDirectionLockRef.current !== 'up') {
      scrollDirectionLockRef.current = 'up'
      setDiscoveryExpanded(true)
    }
  }

  const discoveryContainerStyle = {
    opacity: discoveryVisibility,
    maxHeight: discoveryVisibility.interpolate({
      inputRange: [0, 1],
      outputRange: [0, 520],
    }),
    transform: [
      {
        translateY: discoveryVisibility.interpolate({
          inputRange: [0, 1],
          outputRange: [-12, 0],
        }),
      },
    ],
    overflow: 'hidden' as const,
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerEyebrow}>Rawaq Communities</Text>
          <Text style={styles.headerTitle}>Find your people</Text>
        </View>
        {user && (
          <View style={styles.headerActions}>
            <TouchableOpacity
              onPress={() => router.push('/communities/create' as any)}
              style={styles.addBtn}
            >
              <Ionicons name="add" size={18} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setJoinedOnly((v) => !v)}
              style={[styles.myBtn, joinedOnly && styles.myBtnActive]}
            >
              <Ionicons name={joinedOnly ? 'people' : 'people-outline'} size={16} color={joinedOnly ? '#fff' : Colors.brand[600]} />
              <Text style={[styles.myBtnText, joinedOnly && styles.myBtnTextActive]}>Mine</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Search */}
      <View style={styles.searchWrap}>
        <Ionicons name="search-outline" size={16} color={Colors.gray[400]} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search communities..."
          placeholderTextColor={Colors.gray[400]}
          style={styles.searchInput}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={16} color={Colors.gray[400]} />
          </TouchableOpacity>
        )}
      </View>

      {/* Level filter chips */}
      <FlatList
        horizontal
        data={LEVEL_FILTER_OPTIONS}
        keyExtractor={(f) => f.key}
        style={styles.filterList}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
        renderItem={({ item: f }) => (
          <TouchableOpacity
            onPress={() => setLevelFilter(f.key)}
            style={[styles.filterChip, levelFilter === f.key && styles.filterChipActive]}
          >
            {f.key !== 'all' && (
              <Ionicons
                name={LEVEL_META[f.key as CommunityLevel].icon}
                size={13}
                color={levelFilter === f.key ? '#fff' : Colors.gray[600]}
              />
            )}
            <Text style={[styles.filterChipText, levelFilter === f.key && styles.filterChipTextActive]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        )}
      />

      <Animated.View style={discoveryContainerStyle} pointerEvents={discoveryVisible ? 'auto' : 'none'}>
      {user && !joinedOnly && search.trim().length === 0 && recommended.length > 0 && (
        <View style={styles.discoverySection}>
          <View style={styles.discoveryHeader}>
            <Text style={styles.discoveryTitle}>Recommended for you</Text>
            <Text style={styles.discoveryHint}>Personalized by your interests and city</Text>
          </View>
          <FlatList
            horizontal
            data={recommended}
            keyExtractor={(item) => item.id}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.discoveryRow}
            renderItem={({ item }) => renderDiscoveryCard(item, 'recommended')}
          />
        </View>
      )}

      {!joinedOnly && search.trim().length === 0 && trending.length > 0 && (
        <View style={styles.trendingSection}>
          <View style={styles.trendingHeader}>
            <Text style={styles.trendingTitle}>Trending now</Text>
            <Text style={styles.trendingHint}>Fast-growing communities this week</Text>
          </View>
          <FlatList
            horizontal
            data={trending}
            keyExtractor={(item) => item.id}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.trendingRow}
            renderItem={({ item }) => {
              const meta = LEVEL_META[item.level]
              const name = isRTL && item.name_ar ? item.name_ar : item.name
              return (
                <TouchableOpacity
                  onPress={() => router.push(`/communities/${item.slug}` as any)}
                  activeOpacity={0.88}
                  style={styles.trendingCard}
                >
                  <View style={[styles.trendingIcon, { backgroundColor: meta.bg }]}>
                    <Ionicons name={meta.icon} size={18} color={meta.tint} />
                  </View>
                  <Text style={styles.trendingName} numberOfLines={1}>{name}</Text>
                  <Text style={styles.trendingMeta} numberOfLines={1}>
                    {item.city ? `${item.city} · ` : ''}{item.member_count.toLocaleString()} members
                  </Text>
                </TouchableOpacity>
              )
            }}
          />
        </View>
      )}

      {user && !joinedOnly && search.trim().length === 0 && popularCommunities.length > 0 && (
        <View style={styles.discoverySection}>
          <View style={styles.discoveryHeader}>
            <Text style={styles.discoveryTitle}>Popular communities</Text>
            <Text style={styles.discoveryHint}>Established groups people are already joining</Text>
          </View>
          <FlatList
            horizontal
            data={popularCommunities}
            keyExtractor={(item) => item.id}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.discoveryRow}
            renderItem={({ item }) => renderDiscoveryCard(item, 'popular')}
          />
        </View>
      )}
      </Animated.View>

      {/* List */}
      {loading
        ? <View style={styles.center}><Spinner /></View>
        : communities.length === 0
          ? <EmptyState icon="🏘️" title="No communities found" description="Try a different search or filter" />
          : (
            <FlatList
              data={communities}
              keyExtractor={(c) => c.id}
              renderItem={renderItem}
              contentContainerStyle={styles.list}
              onScroll={handleListScroll}
              scrollEventThrottle={16}
              refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(1, search, levelFilter, joinedOnly, false) }} />
              }
              onEndReached={() => { if (hasMore && !loading && !isLoadingPageRef.current) load(page + 1, search, levelFilter, joinedOnly, true) }}
              onEndReachedThreshold={0.4}
              ListFooterComponent={hasMore ? <View style={styles.center}><Spinner /></View> : null}
            />
          )
      }
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f4f5f9' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing['2xl'],
    paddingBottom: Spacing.lg,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray[100],
  },
  headerEyebrow: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, color: Colors.brand[500], letterSpacing: 0.8, textTransform: 'uppercase' },
  headerTitle:   { fontSize: FontSize['2xl'], fontWeight: FontWeight.bold, color: Colors.gray[900], marginTop: 2 },

  myBtn:         { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: Radius.full, backgroundColor: Colors.brand[50], borderWidth: 1, borderColor: Colors.brand[200] },
  myBtnActive:   { backgroundColor: Colors.brand[600], borderColor: Colors.brand[600] },
  myBtnText:     { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, color: Colors.brand[600] },
  myBtnTextActive: { color: '#fff' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  addBtn: {
    width: 38,
    height: 38,
    borderRadius: Radius.full,
    backgroundColor: Colors.brand[600],
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadow.card,
  },

  searchWrap:  { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: '#fff', marginHorizontal: Spacing.lg, marginTop: Spacing.md, marginBottom: Spacing.xs, borderRadius: Radius.xl, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 2, borderWidth: 1, borderColor: Colors.gray[200], ...Shadow.card },
  searchInput: { flex: 1, fontSize: FontSize.sm, color: Colors.gray[900] },

  filterList: { minHeight: 56 },
  filterRow: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, gap: Spacing.sm, alignItems: 'center' },
  filterChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: Radius.full, backgroundColor: '#fff', borderWidth: 1, borderColor: Colors.gray[200] },
  filterChipActive: { backgroundColor: Colors.brand[600], borderColor: Colors.brand[600] },
  filterChipText:   { fontSize: FontSize.xs, fontWeight: FontWeight.medium, color: Colors.gray[700] },
  filterChipTextActive: { color: '#fff' },

  discoverySection: { marginBottom: Spacing.md },
  discoveryHeader: { paddingHorizontal: Spacing.lg, marginBottom: Spacing.sm },
  discoveryTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.gray[900] },
  discoveryHint: { marginTop: 2, fontSize: FontSize.xs, color: Colors.gray[500] },
  discoveryRow: { paddingHorizontal: Spacing.lg, gap: Spacing.sm },
  recommendedCard: {
    width: 220,
    padding: Spacing.md,
    borderRadius: Radius.xl,
    backgroundColor: '#eef6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
    ...Shadow.card,
  },
  popularCard: {
    width: 220,
    padding: Spacing.md,
    borderRadius: Radius.xl,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: Colors.gray[200],
    ...Shadow.card,
  },
  discoveryMiniIcon: {
    width: 36,
    height: 36,
    borderRadius: Radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  discoveryMiniName: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.gray[900] },
  discoveryMiniMeta: { marginTop: 4, fontSize: FontSize.xs, color: Colors.gray[500] },
  discoveryJoinBtn: {
    alignSelf: 'flex-start',
    marginTop: Spacing.md,
    backgroundColor: Colors.brand[600],
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    minWidth: 68,
    alignItems: 'center',
  },
  discoveryJoinText: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, color: '#fff' },

  trendingSection: { marginBottom: Spacing.md },
  trendingHeader: { paddingHorizontal: Spacing.lg, marginBottom: Spacing.sm },
  trendingTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.gray[900] },
  trendingHint: { marginTop: 2, fontSize: FontSize.xs, color: Colors.gray[500] },
  trendingRow: { paddingHorizontal: Spacing.lg, gap: Spacing.sm },
  trendingCard: {
    width: 180,
    padding: Spacing.md,
    borderRadius: Radius.xl,
    backgroundColor: '#fff7ed',
    borderWidth: 1,
    borderColor: '#fdba74',
    ...Shadow.card,
  },
  trendingIcon: {
    width: 36,
    height: 36,
    borderRadius: Radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  trendingName: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.gray[900] },
  trendingMeta: { marginTop: 4, fontSize: FontSize.xs, color: Colors.gray[500] },

  list: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing['3xl'], gap: Spacing.md },

  card: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: Radius['sm'],
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.gray[100] ?? Colors.gray[200],
    ...Shadow.card,
  },
  cardAccent: { width: 4 },
  cardBody:   { flex: 1, padding: Spacing.lg },
  cardTop:    { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md },

  iconWrap:  { width: 46, height: 46, borderRadius: Radius.xl, alignItems: 'center', justifyContent: 'center' },
  cardCenter:{ flex: 1 },
  nameRow:   { flexDirection: 'row', alignItems: 'center', gap: 5 },
  cardName:  { fontSize: FontSize.base, fontWeight: FontWeight.semibold, color: Colors.gray[900], flex: 1 },

  tagRow:      { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  levelTag:    { paddingHorizontal: Spacing.sm, paddingVertical: 3, borderRadius: Radius.full },
  levelTagText:{ fontSize: 11, fontWeight: FontWeight.semibold },
  cityText:    { fontSize: 11, color: Colors.gray[500] },
  joinedTag:   { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: Spacing.sm, paddingVertical: 3, borderRadius: Radius.full, backgroundColor: '#dcfce7' },
  joinedTagText: { fontSize: 11, fontWeight: FontWeight.semibold, color: '#15803d' },

  joinBtn:         { paddingHorizontal: 14, paddingVertical: 8, borderRadius: Radius.lg, alignItems: 'center', justifyContent: 'center', minWidth: 68 },
  joinBtnDefault:  { backgroundColor: Colors.brand[600] },
  joinBtnJoined:   { backgroundColor: '#f0fdf4', borderWidth: 1, borderColor: '#86efac' },
  joinBtnText:     { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: '#fff' },
  joinBtnTextJoined: { color: '#15803d' },

  desc:       { fontSize: FontSize.xs, color: Colors.gray[500], lineHeight: 18, marginTop: Spacing.md },

  cardFooter: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: Spacing.md },
  footerText: { fontSize: 11, color: Colors.gray[400] },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: Spacing['4xl'] },
})
