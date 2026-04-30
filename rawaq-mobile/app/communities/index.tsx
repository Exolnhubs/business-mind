import { useEffect, useState, useCallback, useRef } from 'react'
import {
  View, Text, FlatList, TextInput, StyleSheet,
  TouchableOpacity, RefreshControl, ActivityIndicator,
} from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { useFocusEffect, useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { apiGet, apiPost, apiDelete } from '@/lib/api'
import { useAuth } from '@/contexts/auth-context'
import { useLocale } from '@/contexts/locale-context'
import { EmptyState } from '@/components/ui/EmptyState'
import { Spinner } from '@/components/ui/Spinner'
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadow } from '@/theme'
import type { Community, CommunityLevel } from '@/types/database'

type CommunityWithMembership = Community & { is_member: boolean; event_count?: number }
type TrendingCommunity = CommunityWithMembership & { trending_score?: number }
type MembershipMutationResponse = { is_member?: boolean; member_count?: number }

const LEVEL_META: Record<CommunityLevel, { label: string; icon: keyof typeof Ionicons.glyphMap; tint: string; bg: string; accent: string }> = {
  micro: { label: 'Micro', icon: 'home-outline', tint: '#166534', bg: '#dcfce7', accent: '#16a34a' },
  interest: { label: 'Interest', icon: 'sparkles-outline', tint: '#6d28d9', bg: '#ede9fe', accent: '#7c3aed' },
  district: { label: 'District', icon: 'business-outline', tint: '#92400e', bg: '#fef3c7', accent: '#d97706' },
  city: { label: 'City', icon: 'location-outline', tint: '#1e40af', bg: '#dbeafe', accent: '#2563eb' },
  country: { label: 'Country', icon: 'earth-outline', tint: '#9f1239', bg: '#ffe4e6', accent: '#e11d48' },
}

const LEVEL_FILTER_OPTIONS: { key: CommunityLevel | 'all'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'micro', label: 'Micro' },
  { key: 'interest', label: 'Interest' },
  { key: 'district', label: 'District' },
  { key: 'city', label: 'City' },
]

const DATA_REFRESH_STALE_MS = 90_000

function formatCompactCount(value: number) {
  if (value >= 1000) return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k`
  return String(value)
}

export default function CommunitiesScreen() {
  const { user } = useAuth()
  const { locale, t } = useLocale()
  const router = useRouter()
  const isRTL = locale === 'ar'
  const insets = useSafeAreaInsets()
  const [communities, setCommunities] = useState<CommunityWithMembership[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [search, setSearch] = useState('')
  const [levelFilter, setLevelFilter] = useState<CommunityLevel | 'all'>('all')
  const [joinedOnly, setJoinedOnly] = useState(false)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [trending, setTrending] = useState<TrendingCommunity[]>([])
  const [recommended, setRecommended] = useState<CommunityWithMembership[]>([])
  const [popular, setPopular] = useState<CommunityWithMembership[]>([])
  const [joining, setJoining] = useState<string | null>(null)
  const isLoadingPageRef = useRef(false)
  const lastListLoadRef = useRef(0)
  const lastDiscoveryLoadRef = useRef(0)
  const popularCommunities = popular.filter(
    (community) =>
      !recommended.some((item) => item.id === community.id) &&
      !trending.some((item) => item.id === community.id),
  )

  const loadTrending = useCallback(async (force = false) => {
    try {
      const { data } = await apiGet<{ data: TrendingCommunity[] }>(`/api/communities/trending?per_page=8&page=1`, { force })
      setTrending(data?.data ?? [])
    } catch {
      setTrending([])
    }
  }, [])

  const loadRecommended = useCallback(async (force = false) => {
    if (!user) {
      setRecommended([])
      return
    }

    const { data } = await apiGet<{ data: CommunityWithMembership[] }>('/api/communities?recommended=true&per_page=6&page=1', { force })
    setRecommended((data?.data ?? []).filter((community) => !community.is_member))
  }, [user])

  const loadPopular = useCallback(async (force = false) => {
    const { data } = await apiGet<{ data: CommunityWithMembership[] }>('/api/communities?per_page=6&page=1', { force })
    setPopular((data?.data ?? []).filter((community) => !community.is_member))
  }, [])

  const load = useCallback(async (p: number, q: string, lvl: CommunityLevel | 'all', memberOnly = false, append = false, force = false) => {
    if (isLoadingPageRef.current) return
    isLoadingPageRef.current = true
    if (p === 1 && !append) {
      lastListLoadRef.current = Date.now()
    }
    const params = new URLSearchParams({ page: String(p), per_page: '20' })
    if (q.trim()) params.set('q', q.trim())
    if (lvl !== 'all') params.set('level', lvl)
    if (memberOnly) params.set('member_only', 'true')
    try {
      const { data } = await apiGet<{ data: CommunityWithMembership[]; has_more: boolean }>(`/api/communities?${params}`, { force })
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
    const t = setTimeout(() => {
      void load(1, search, levelFilter, joinedOnly, false)
    }, search ? 300 : 0)
    return () => clearTimeout(t)
  }, [search, levelFilter, joinedOnly, load])

  const loadDiscovery = useCallback(async (force = false) => {
    const now = Date.now()
    if (!force && now - lastDiscoveryLoadRef.current < DATA_REFRESH_STALE_MS) return
    lastDiscoveryLoadRef.current = now
    await Promise.all([loadTrending(force), loadRecommended(force), loadPopular(force)])
  }, [loadPopular, loadRecommended, loadTrending])

  const refreshListIfNeeded = useCallback(async (force = false) => {
    const now = Date.now()
    if (!force && now - lastListLoadRef.current < DATA_REFRESH_STALE_MS) return
    await load(1, search, levelFilter, joinedOnly, false, force)
  }, [joinedOnly, levelFilter, load, search])

  useEffect(() => {
    void loadDiscovery(true)
  }, [loadDiscovery])

  useFocusEffect(useCallback(() => { void refreshListIfNeeded() }, [refreshListIfNeeded]))
  useFocusEffect(useCallback(() => { void loadDiscovery() }, [loadDiscovery]))

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

  function communityText(item: CommunityWithMembership) {
    return {
      name: isRTL && item.name_ar ? item.name_ar : item.name,
      description: isRTL && item.description_ar ? item.description_ar : item.description,
    }
  }

  function renderCommunityAvatar(item: CommunityWithMembership, size = 48) {
    const meta = LEVEL_META[item.level]
    return (
      <View
        style={[
          styles.communityAvatar,
          {
            width: size,
            height: size,
            borderRadius: Math.round(size * 0.32),
            backgroundColor: meta.bg,
            borderColor: `${meta.accent}33`,
          },
        ]}
      >
        <Ionicons name={meta.icon} size={Math.round(size * 0.44)} color={meta.tint} />
      </View>
    )
  }

  function renderDiscoveryCard(item: CommunityWithMembership) {
    const meta = LEVEL_META[item.level]
    const { name, description } = communityText(item)
    const isJoining = joining === item.id

    return (
      <TouchableOpacity
        key={item.id}
        onPress={() => router.push(`/communities/${item.slug}` as any)}
        activeOpacity={0.88}
        style={[styles.recommendedCard, { borderColor: `${meta.accent}30` }]}
      >
        <View style={[styles.cardGlow, { backgroundColor: `${meta.accent}10` }]} />
        <View style={styles.recommendedTopRow}>
          {renderCommunityAvatar(item, 46)}
          {item.is_member && (
            <View style={[styles.compactJoinedBadge, { backgroundColor: meta.bg }]}>
              <Ionicons name="checkmark" size={11} color={meta.tint} />
              <Text style={[styles.compactJoinedText, { color: meta.tint }]}>{t('community.joined')}</Text>
            </View>
          )}
        </View>
        <Text style={[styles.discoveryMiniName, {textAlign: 'left' }]} numberOfLines={2}>{name}</Text>
        <Text style={[styles.discoveryMiniDesc, {textAlign: 'left' }]} numberOfLines={2}>
          {description || t(`community.level.${item.level}`)}
        </Text>
        <View style={styles.discoveryStatsRow}>
          <View style={styles.inlineMeta}>
            <Ionicons name="people-outline" size={12} color={Colors.gray[500]} />
            <Text style={[styles.discoveryMiniMeta, {textAlign: 'left' }]}>{formatCompactCount(item.member_count)}</Text>
          </View>
          <View style={styles.activityPill}>
            <View style={[styles.activityDot, { backgroundColor: item.member_count > 1000 ? Colors.green.DEFAULT : Colors.brand[400] }]} />
            <Text style={[styles.activityText, {textAlign: 'left' }]} numberOfLines={1}>
              {item.member_count > 1000 ? t('community.trending_title') : t(`community.level.${item.level}`)}
            </Text>
          </View>
        </View>
        <TouchableOpacity
          onPress={() => handleJoinLeave(item)}
          disabled={isJoining}
          style={[styles.discoveryJoinBtn, item.is_member && styles.discoveryJoinBtnJoined]}
        >
          {isJoining
            ? <ActivityIndicator size="small" color={item.is_member ? Colors.gray[500] : '#fff'} />
            : (
              <>
                <Ionicons name={item.is_member ? 'checkmark' : 'add'} size={13} color={item.is_member ? Colors.gray[500] : '#fff'} />
                <Text style={[styles.discoveryJoinText, item.is_member && styles.discoveryJoinTextJoined]}>
                  {item.is_member ? t('community.joined') : t('community.join')}
                </Text>
              </>
            )}
        </TouchableOpacity>
      </TouchableOpacity>
    )
  }

  function renderCommunityRow(item: CommunityWithMembership, rank?: number) {
    const meta = LEVEL_META[item.level]
    const { name, description } = communityText(item)
    const isJoining = joining === item.id

    return (
      <TouchableOpacity
        key={item.id}
        style={styles.listRow}
        onPress={() => router.push(`/communities/${item.slug}` as any)}
        activeOpacity={0.88}
      >
        {rank !== undefined && (
          <Text style={[styles.rankText, rank < 3 && styles.rankTextHot]}>{rank + 1}</Text>
        )}
        {renderCommunityAvatar(item, 48)}

        <View style={styles.rowCenter}>
          <View style={styles.nameRow}>
            <Text style={[styles.rowName, {textAlign: 'left' }]} numberOfLines={1}>{name}</Text>
            {item.is_verified && <Ionicons name="checkmark-circle" size={15} color={Colors.brand[500]} />}
          </View>
          <Text style={[styles.rowDesc, {textAlign: 'left' }]} numberOfLines={1}>
            {description || t(`community.level.${item.level}`)}
          </Text>
          <View style={styles.rowMetaLine}>
            <View style={styles.inlineMeta}>
              <Ionicons name="people-outline" size={12} color={Colors.gray[400]} />
              <Text style={[styles.rowMetaText, {textAlign: 'left' }]}>{formatCompactCount(item.member_count)} {t('community.members')}</Text>
            </View>
            {item.city ? (
              <>
                <View style={styles.metaSeparator} />
                <View style={styles.inlineMeta}>
                  <Ionicons name="location-outline" size={12} color={Colors.gray[400]} />
                  <Text style={[styles.rowMetaText, {textAlign: 'left' }]} numberOfLines={1}>{item.city}</Text>
                </View>
              </>
            ) : null}
          </View>
        </View>

        <TouchableOpacity
          onPress={() => handleJoinLeave(item)}
          disabled={!!isJoining}
          style={[
            styles.rowJoinBtn,
            item.is_member
              ? styles.rowJoinBtnJoined
              : { backgroundColor: meta.bg, borderColor: `${meta.accent}55` },
          ]}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          {isJoining
            ? <ActivityIndicator size="small" color={item.is_member ? Colors.gray[500] : meta.tint} />
            : (
              <>
                {item.is_member && <Ionicons name="checkmark" size={11} color={Colors.gray[500]} />}
                <Text style={[styles.rowJoinText, !item.is_member && { color: meta.tint }]}>
                  {item.is_member ? t('community.joined') : t('community.join')}
                </Text>
                {!item.is_member && <Ionicons name="add" size={11} color={meta.tint} />}
              </>
            )}
        </TouchableOpacity>
      </TouchableOpacity>
    )
  }

  function renderCommunityChip(item: CommunityWithMembership) {
    const meta = LEVEL_META[item.level]
    const { name } = communityText(item)

    return (
      <TouchableOpacity
        key={item.id}
        onPress={() => router.push(`/communities/${item.slug}` as any)}
        activeOpacity={0.88}
        style={styles.nearChip}
      >
        {renderCommunityAvatar(item, 34)}
        <View style={styles.nearChipTextWrap}>
          <Text style={[styles.nearChipTitle, {textAlign: 'left' }]} numberOfLines={1}>{name}</Text>
          <View style={styles.inlineMeta}>
            <View style={[styles.activityDot, { backgroundColor: meta.accent }]} />
            <Text style={[styles.nearChipMeta, {textAlign: 'left' }]}>{formatCompactCount(item.member_count)}</Text>
          </View>
        </View>
        <Ionicons name={item.is_member ? 'checkmark' : 'chevron-forward'} size={14} color={meta.tint} />
      </TouchableOpacity>
    )
  }

  function renderSectionHeader({
    icon,
    title,
    subtitle,
    color = Colors.brand[500],
  }: {
    icon: keyof typeof Ionicons.glyphMap
    title: string
    subtitle?: string
    color?: string
  }) {
    return (
      <View style={styles.sectionHeader}>
        <View style={styles.sectionTitleCluster}>
          <View style={[styles.sectionIcon, { backgroundColor: `${color}18` }]}>
            <Ionicons name={icon} size={15} color={color} />
          </View>
          <View style={styles.sectionTextWrap}>
            <Text style={[styles.discoveryTitle, {textAlign: 'left' }]}>{title}</Text>
            {subtitle ? <Text style={[styles.discoveryHint, {textAlign: 'left' }]}>{subtitle}</Text> : null}
          </View>
        </View>
      </View>
    )
  }

  function renderItem({ item }: { item: CommunityWithMembership }) {
    return renderCommunityRow(item)
  }

  const headerTopSpacing = Math.max(Spacing.sm, Math.min(insets.top * 0.18, Spacing.md))

  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.topChrome}>
        {/* Header */}
        <View style={[styles.header, { paddingTop: headerTopSpacing }]}>
          <View style={styles.headerTopRow}>
            <View>
              <Text style={styles.headerEyebrow}>RAWAQ</Text>
              <Text style={styles.headerTitle}>{t('community.header_title')}</Text>
            </View>
            {user && (
              <View style={styles.headerActions}>
                <TouchableOpacity
                  onPress={() => router.push('/communities/create' as any)}
                  style={styles.addBtn}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="add" size={19} color={Colors.brand[700]} />
                </TouchableOpacity>
              </View>
            )}
          </View>
          <Text style={styles.headerSubtitle}>{t('community.header_subtitle')}</Text>
          <View style={styles.tabSwitch}>
            <TouchableOpacity
              onPress={() => setJoinedOnly(false)}
              style={[styles.tabButton, !joinedOnly && styles.tabButtonActive]}
            >
              <Text style={[styles.tabButtonText, !joinedOnly && styles.tabButtonTextActive]}>
                {locale === 'ar' ? 'اكتشف' : 'Discover'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setJoinedOnly(true)}
              style={[styles.tabButton, joinedOnly && styles.tabButtonActive]}
            >
              <Text style={[styles.tabButtonText, joinedOnly && styles.tabButtonTextActive]}>
                {t('community.mine_btn')}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Search */}
        <View style={styles.searchSection}>
          <View style={styles.searchWrap}>
            <Ionicons name="search-outline" size={17} color={Colors.brand[600]} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder={t('community.search_placeholder')}
              placeholderTextColor={Colors.gray[400]}
              style={styles.searchInput}
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch('')}>
                <Ionicons name="close-circle" size={16} color={Colors.gray[400]} />
              </TouchableOpacity>
            )}
          </View>
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
                  color={levelFilter === f.key ? Colors.brand[700] : Colors.gray[600]}
                />
              )}
              <Text style={[styles.filterChipText, levelFilter === f.key && styles.filterChipTextActive]}>
                {t(`community.level.${f.key}`)}
              </Text>
            </TouchableOpacity>
          )}
        />
      </SafeAreaView>

      <FlatList
        data={communities}
        keyExtractor={(c) => c.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          !joinedOnly && search.trim().length === 0 ? (
            <>
              {user && recommended.length > 0 && (
                <View style={styles.discoverySection}>
                  {renderSectionHeader({
                    icon: 'star',
                    title: t('community.recommended_title'),
                    subtitle: t('community.recommended_hint'),
                    color: Colors.brand[500],
                  })}
                  <FlatList
                    horizontal
                    data={recommended}
                    keyExtractor={(item) => item.id}
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.discoveryRow}
                    renderItem={({ item }) => renderDiscoveryCard(item)}
                  />
                </View>
              )}

              {trending.length > 0 && (
                <View style={styles.trendingSection}>
                  {renderSectionHeader({
                    icon: 'flame',
                    title: t('community.trending_title'),
                    subtitle: t('community.trending_hint'),
                    color: Colors.brand[600],
                  })}
                  <View style={styles.rankedList}>
                    {trending.slice(0, 5).map((item, index) => renderCommunityRow(item, index))}
                  </View>
                </View>
              )}

              {popularCommunities.length > 0 && (
                <View style={styles.nearSection}>
                  {renderSectionHeader({
                    icon: 'location-outline',
                    title: t('community.popular_title'),
                    subtitle: t('community.popular_hint'),
                    color: Colors.green.DEFAULT,
                  })}
                  <FlatList
                    horizontal
                    data={popularCommunities}
                    keyExtractor={(item) => item.id}
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.nearRow}
                    renderItem={({ item }) => renderCommunityChip(item)}
                  />
                </View>
              )}
            </>
          ) : null
        }
        ListEmptyComponent={
          loading
            ? <View style={styles.center}><Spinner /></View>
            : <EmptyState icon="🏘️" title={t('community.empty_title')} description={t('community.empty_desc')} />
        }
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(1, search, levelFilter, joinedOnly, false, true) }} />
        }
        onEndReached={() => { if (hasMore && !loading && !isLoadingPageRef.current) void load(page + 1, search, levelFilter, joinedOnly, true) }}
        onEndReachedThreshold={0.4}
        ListFooterComponent={hasMore ? <View style={styles.center}><Spinner /></View> : null}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#faf8f5' },
  rtlText: { textAlign: 'right', writingDirection: 'rtl' },
  ltrText: { textAlign: 'left', writingDirection: 'ltr' },
  topChrome: {
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#efe9dc',
  },

  header: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
  headerEyebrow: { fontSize: 10, fontWeight: FontWeight.semibold, color: Colors.brand[700], letterSpacing: 1.1, textTransform: 'uppercase' },
  headerTitle: { fontSize: FontSize['3xl'], fontWeight: FontWeight.bold, color: Colors.gray[900], marginTop: 3, maxWidth: 260 },
  headerSubtitle: { fontSize: FontSize.xs, color: Colors.gray[500], lineHeight: 18, maxWidth: '92%' },

  headerActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginStart: 'auto' },
  addBtn: {
    width: 40,
    height: 40,
    borderRadius: Radius.lg,
    backgroundColor: Colors.brand[50],
    borderWidth: 1,
    borderColor: Colors.brand[200],
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadow.card,
  },

  tabSwitch: {
    flexDirection: 'row',
    backgroundColor: '#f5f1e8',
    borderRadius: Radius.lg,
    padding: 3,
    borderWidth: 1,
    borderColor: '#ebe3d3',
    marginTop: Spacing.xs,
  },
  tabButton: {
    flex: 1,
    paddingVertical: Spacing.sm + 1,
    borderRadius: Radius.md,
    alignItems: 'center',
  },
  tabButtonActive: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ece5d8',
    ...Shadow.card,
  },
  tabButtonText: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.gray[500] },
  tabButtonTextActive: { color: Colors.gray[900] },

  searchSection: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xs },
  searchWrap: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: '#fffdf8', borderRadius: Radius.lg, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 3, borderWidth: 1.5, borderColor: '#eadfcb', ...Shadow.card },
  searchInput: { flex: 1, fontSize: FontSize.sm, color: Colors.gray[900] },

  filterList: { minHeight: 56 },
  filterRow: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm, paddingBottom: Spacing.md, gap: Spacing.sm, alignItems: 'center' },
  filterChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: Radius.full, backgroundColor: '#f8f4ec', borderWidth: 1.5, borderColor: '#ebe3d3', minHeight: 38 },
  filterChipActive: { backgroundColor: Colors.brand[50], borderColor: Colors.brand[300] },
  filterChipText: { fontSize: FontSize.xs, fontWeight: FontWeight.medium, color: Colors.gray[700] },
  filterChipTextActive: { color: Colors.brand[700] },

  discoverySection: { marginBottom: Spacing.xl },
  sectionHeader: { paddingHorizontal: Spacing.lg, marginBottom: Spacing.sm },
  sectionTitleCluster: { flexDirection: 'row', textAlign: 'left', alignItems: 'flex-start', gap: Spacing.sm },
  sectionTextWrap: { flex: 1 },
  sectionIcon: { width: 30, height: 30, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  discoveryTitle: { fontSize: FontSize.base, fontWeight: FontWeight.bold, color: Colors.gray[900] },
  discoveryHint: { marginTop: 2, fontSize: FontSize.xs, color: Colors.gray[500] },
  discoveryRow: { paddingHorizontal: Spacing.lg, gap: Spacing.md, paddingBottom: 2 },
  recommendedCard: {
    width: 176,
    minHeight: 202,
    padding: 14,
    borderRadius: Radius.xl,
    textAlign: 'left', 
    backgroundColor: '#fff',
    borderWidth: 1,
    overflow: 'hidden',
    ...Shadow.card,
  },
  cardGlow: { position: 'absolute', top: 0, left: 0, right: 0, height: 64 },
  recommendedTopRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: Spacing.sm },
  communityAvatar: { alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, flexShrink: 0 },
  compactJoinedBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: Radius.sm, paddingHorizontal: 7, paddingVertical: 3 },
  compactJoinedText: { fontSize: 10, fontWeight: FontWeight.bold },
  discoveryMiniName: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.gray[900], lineHeight: 18 },
  discoveryMiniDesc: { marginTop: 3, fontSize: FontSize.xs, color: Colors.gray[500], lineHeight: 16 },
  discoveryStatsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm, marginTop: Spacing.sm },
  inlineMeta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  discoveryMiniMeta: { fontSize: FontSize.xs, color: Colors.gray[500] },
  activityPill: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 },
  activityDot: { width: 6, height: 6, borderRadius: 3 },
  activityText: { fontSize: 10, color: Colors.gray[500], maxWidth: 78 },
  discoveryJoinBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginTop: Spacing.md,
    backgroundColor: Colors.brand[600],
    borderRadius: Radius.md,
    paddingVertical: Spacing.sm + 1,
    borderWidth: 1,
    borderColor: Colors.brand[600],
  },
  discoveryJoinBtnJoined: { backgroundColor: '#fff', borderColor: Colors.gray[200] },
  discoveryJoinText: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, color: '#fff' },
  discoveryJoinTextJoined: { color: Colors.gray[500] },
  trendingSection: { marginBottom: Spacing.xl },
  rankedList: { marginHorizontal: Spacing.lg, backgroundColor: '#fff', borderRadius: Radius.xl, borderWidth: 1, borderColor: '#ede7dc', overflow: 'hidden', ...Shadow.card },
  nearSection: { marginBottom: Spacing.xl },
  nearRow: { paddingHorizontal: Spacing.lg, gap: Spacing.sm, paddingBottom: 2 },
  nearChip: {
    width: 164,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.lg,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ede7dc',
    ...Shadow.card,
  },
  nearChipTextWrap: { flex: 1, minWidth: 0 },
  nearChipTitle: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.gray[900] },
  nearChipMeta: { fontSize: 10, color: Colors.gray[500] },
  list: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm, paddingBottom: Spacing['3xl'], gap: Spacing.sm },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    backgroundColor: '#fff',
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: '#ede7dc',
    ...Shadow.card,
  },
  rankText: { width: 20, textAlign: 'center', fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.gray[300] },
  rankTextHot: { color: Colors.brand[500] },
  rowCenter: { flex: 1, minWidth: 0 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  rowName: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.gray[900], flex: 1 },
  rowDesc: { marginTop: 2, fontSize: FontSize.xs, color: Colors.gray[500] },
  rowMetaLine: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 5 },
  rowMetaText: { fontSize: 11, color: Colors.gray[500], maxWidth: 90 },
  metaSeparator: { width: 3, height: 3, borderRadius: 2, backgroundColor: Colors.gray[300] },
  rowJoinBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: Spacing.sm + 3,
    paddingVertical: 7,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    flexShrink: 0,
  },
  rowJoinBtnJoined: { backgroundColor: '#fff', borderColor: Colors.gray[200] },
  rowJoinText: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.gray[500] },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: Spacing['4xl'] },
})
