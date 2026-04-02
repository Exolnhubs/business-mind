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

  useFocusEffect(useCallback(() => { load(1, search, levelFilter, joinedOnly, false) }, [load, search, levelFilter, joinedOnly]))

  async function handleJoinLeave(community: CommunityWithMembership) {
    if (!user) { router.push('/auth/login'); return }
    setJoining(community.id)
    const { data, error } = community.is_member
      ? await apiDelete<MembershipMutationResponse>(`/api/communities/${community.slug}/leave`)
      : await apiPost<MembershipMutationResponse>(`/api/communities/${community.slug}/join`, {})
    if (!error) {
      setCommunities((prev) =>
        prev.map((c) => c.id === community.id
          ? { ...c, is_member: data?.is_member ?? !c.is_member, member_count: data?.member_count ?? (!c.is_member ? c.member_count + 1 : Math.max(c.member_count - 1, 0)) }
          : c
        ).filter((c) => !joinedOnly || c.is_member)
      )
    }
    setJoining(null)
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

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerEyebrow}>Rawaq Communities</Text>
          <Text style={styles.headerTitle}>Find your people</Text>
        </View>
        {user && (
          <TouchableOpacity
            onPress={() => setJoinedOnly((v) => !v)}
            style={[styles.myBtn, joinedOnly && styles.myBtnActive]}
          >
            <Ionicons name={joinedOnly ? 'people' : 'people-outline'} size={16} color={joinedOnly ? '#fff' : Colors.brand[600]} />
            <Text style={[styles.myBtnText, joinedOnly && styles.myBtnTextActive]}>Mine</Text>
          </TouchableOpacity>
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
    paddingHorizontal: Spacing[4],
    paddingTop: Spacing[6],
    paddingBottom: Spacing[4],
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray[100],
  },
  headerEyebrow: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, color: Colors.brand[500], letterSpacing: 0.8, textTransform: 'uppercase' },
  headerTitle:   { fontSize: FontSize['2xl'], fontWeight: FontWeight.bold, color: Colors.gray[900], marginTop: 2 },

  myBtn:         { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: Spacing[3], paddingVertical: Spacing[2], borderRadius: Radius.full, backgroundColor: Colors.brand[50], borderWidth: 1, borderColor: Colors.brand[200] },
  myBtnActive:   { backgroundColor: Colors.brand[600], borderColor: Colors.brand[600] },
  myBtnText:     { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, color: Colors.brand[600] },
  myBtnTextActive: { color: '#fff' },

  searchWrap:  { flexDirection: 'row', alignItems: 'center', gap: Spacing[2], backgroundColor: '#fff', marginHorizontal: Spacing[4], marginTop: Spacing[3], marginBottom: Spacing[1], borderRadius: Radius.xl, paddingHorizontal: Spacing[3], paddingVertical: Spacing[2] + 2, borderWidth: 1, borderColor: Colors.gray[200], ...Shadow.sm },
  searchInput: { flex: 1, fontSize: FontSize.sm, color: Colors.gray[900] },

  filterRow: { paddingHorizontal: Spacing[4], paddingVertical: Spacing[3], gap: Spacing[2] },
  filterChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: Spacing[3], paddingVertical: Spacing[2], borderRadius: Radius.full, backgroundColor: '#fff', borderWidth: 1, borderColor: Colors.gray[200] },
  filterChipActive: { backgroundColor: Colors.brand[600], borderColor: Colors.brand[600] },
  filterChipText:   { fontSize: FontSize.xs, fontWeight: FontWeight.medium, color: Colors.gray[700] },
  filterChipTextActive: { color: '#fff' },

  list: { paddingHorizontal: Spacing[4], paddingBottom: Spacing[8], gap: Spacing[3] },

  card: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: Radius['2xl'],
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.gray[150] ?? Colors.gray[200],
    ...Shadow.sm,
  },
  cardAccent: { width: 4 },
  cardBody:   { flex: 1, padding: Spacing[4] },
  cardTop:    { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing[3] },

  iconWrap:  { width: 46, height: 46, borderRadius: Radius.xl, alignItems: 'center', justifyContent: 'center' },
  cardCenter:{ flex: 1 },
  nameRow:   { flexDirection: 'row', alignItems: 'center', gap: 5 },
  cardName:  { fontSize: FontSize.base, fontWeight: FontWeight.semibold, color: Colors.gray[900], flex: 1 },

  tagRow:      { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  levelTag:    { paddingHorizontal: Spacing[2], paddingVertical: 3, borderRadius: Radius.full },
  levelTagText:{ fontSize: 11, fontWeight: FontWeight.semibold },
  cityText:    { fontSize: 11, color: Colors.gray[500] },
  joinedTag:   { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: Spacing[2], paddingVertical: 3, borderRadius: Radius.full, backgroundColor: '#dcfce7' },
  joinedTagText: { fontSize: 11, fontWeight: FontWeight.semibold, color: '#15803d' },

  joinBtn:         { paddingHorizontal: 14, paddingVertical: 8, borderRadius: Radius.lg, alignItems: 'center', justifyContent: 'center', minWidth: 68 },
  joinBtnDefault:  { backgroundColor: Colors.brand[600] },
  joinBtnJoined:   { backgroundColor: '#f0fdf4', borderWidth: 1, borderColor: '#86efac' },
  joinBtnText:     { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: '#fff' },
  joinBtnTextJoined: { color: '#15803d' },

  desc:       { fontSize: FontSize.xs, color: Colors.gray[500], lineHeight: 18, marginTop: Spacing[3] },

  cardFooter: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: Spacing[3] },
  footerText: { fontSize: 11, color: Colors.gray[400] },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: Spacing[10] },
})
