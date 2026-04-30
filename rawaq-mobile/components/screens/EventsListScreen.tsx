import { useCallback, useEffect, useRef, useState } from 'react'
import {
  View, Text, FlatList, TextInput, StyleSheet,
  TouchableOpacity, ScrollView, RefreshControl,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '@/lib/supabase'
import { apiGet } from '@/lib/api'
import { EventCard, EventCardSkeleton } from '@/components/events/EventCard'
import { EmptyState } from '@/components/ui/EmptyState'
import { useLocale } from '@/contexts/locale-context'
import { Colors, Spacing, Radius, FontSize } from '@/theme'
import type { EventWithOrganizer } from '@/types/database'

type DateFilter = 'all' | 'today' | 'weekend' | 'week'
interface Category { id: string; name_en: string; name_ar: string; icon: string | null }
type EventsApiListResponse = { data: EventWithOrganizer[]; total: number; has_more: boolean }

const SEARCH_DEBOUNCE_MS = 350
const DATE_CHIPS: { labelKey: string; value: DateFilter }[] = [
  { labelKey: 'events.date_filter.all', value: 'all' },
  { labelKey: 'events.date_filter.today', value: 'today' },
  { labelKey: 'events.date_filter.weekend', value: 'weekend' },
  { labelKey: 'events.date_filter.this_week', value: 'week' },
]

function getDateRange(filter: DateFilter): { date_from: string; date_to?: string } {
  const now = new Date()
  if (filter === 'today') {
    const end = new Date(now); end.setHours(23, 59, 59, 999)
    return { date_from: now.toISOString(), date_to: end.toISOString() }
  }
  if (filter === 'weekend') {
    const day = now.getDay()
    const daysToSat = day === 0 ? 0 : 6 - day
    const sat = new Date(now); sat.setDate(now.getDate() + daysToSat); sat.setHours(0, 0, 0, 0)
    const sun = new Date(sat); sun.setDate(sat.getDate() + (day === 0 ? 0 : 1)); sun.setHours(23, 59, 59, 999)
    return { date_from: sat.toISOString(), date_to: sun.toISOString() }
  }
  if (filter === 'week') {
    const end = new Date(now); end.setDate(now.getDate() + 7); end.setHours(23, 59, 59, 999)
    return { date_from: now.toISOString(), date_to: end.toISOString() }
  }
  return { date_from: now.toISOString() }
}

export default function EventsListScreen() {
  const insets = useSafeAreaInsets()
  const { locale, t } = useLocale()

  const [events, setEvents] = useState<EventWithOrganizer[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [categories, setCategories] = useState<Category[]>([])
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [freeOnly, setFreeOnly] = useState(false)
  const [dateFilter, setDateFilter] = useState<DateFilter>('all')
  const requestRef = useRef(0)

  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedSearch(search.trim()), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timeout)
  }, [search])

  useEffect(() => {
    supabase
      .from('event_categories')
      .select('id, name_en, name_ar, icon')
      .eq('is_active', true)
      .order('sort_order')
      .then(({ data }) => setCategories((data ?? []) as Category[]))
  }, [])

  const fetchEvents = useCallback(async (force = false) => {
    const reqId = ++requestRef.current
    setLoading(true)
    const { date_from, date_to } = getDateRange(dateFilter)
    const params = new URLSearchParams({ per_page: '48', date_from })
    if (date_to) params.set('date_to', date_to)
    if (debouncedSearch) params.set('search', debouncedSearch)
    if (categoryId) params.set('category_id', categoryId)
    if (freeOnly) params.set('is_free', 'true')
    const { data } = await apiGet<EventsApiListResponse>(`/api/events?${params.toString()}`, { force })
    if (reqId !== requestRef.current) return
    setEvents(data?.data ?? [])
    setLoading(false)
    setRefreshing(false)
  }, [debouncedSearch, categoryId, freeOnly, dateFilter])

  useEffect(() => { void fetchEvents() }, [fetchEvents])

  const keyExtractor = useCallback((e: EventWithOrganizer) => e.id, [])

  return (
    <View style={styles.container}>
      <View style={[styles.topBar, { paddingTop: insets.top + Spacing.sm }]}>
        {/* Search + free toggle */}
        <View style={styles.searchRow}>
          <View style={styles.searchBox}>
            <Ionicons name="search-outline" size={16} color={Colors.gray[400]} />
            <TextInput
              style={styles.searchInput}
              placeholder={t('events.search')}
              placeholderTextColor={Colors.gray[400]}
              value={search}
              onChangeText={setSearch}
              returnKeyType="search"
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close-circle" size={16} color={Colors.gray[400]} />
              </TouchableOpacity>
            )}
          </View>
          <TouchableOpacity
            onPress={() => setFreeOnly(v => !v)}
            style={[styles.iconBtn, freeOnly && styles.iconBtnActive]}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons
              name={freeOnly ? 'cash' : 'cash-outline'}
              size={18}
              color={freeOnly ? Colors.green.text : Colors.gray[500]}
            />
          </TouchableOpacity>
        </View>

        {/* Date chips */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
          {DATE_CHIPS.map(chip => (
            <TouchableOpacity
              key={chip.value}
              onPress={() => setDateFilter(chip.value)}
              style={[styles.chip, dateFilter === chip.value && styles.chipActive]}
            >
              <Text style={[styles.chipText, dateFilter === chip.value && styles.chipTextActive]}>
                {t(chip.labelKey)}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Category chips */}
        {categories.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
            <TouchableOpacity
              onPress={() => setCategoryId(null)}
              style={[styles.chip, categoryId === null && styles.chipActive]}
            >
              <Text style={[styles.chipText, categoryId === null && styles.chipTextActive]}>{t('events.category_all')}</Text>
            </TouchableOpacity>
            {categories.map(cat => {
              const name = locale === 'ar' && cat.name_ar ? cat.name_ar : cat.name_en
              const active = categoryId === cat.id
              return (
                <TouchableOpacity
                  key={cat.id}
                  onPress={() => setCategoryId(active ? null : cat.id)}
                  style={[styles.chip, active && styles.chipActive]}
                >
                  {cat.icon ? <Text style={styles.chipIcon}>{cat.icon}</Text> : null}
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>{name}</Text>
                </TouchableOpacity>
              )
            })}
          </ScrollView>
        )}
      </View>

      {loading && !refreshing ? (
        <View>
          {[1, 2, 3].map(i => <EventCardSkeleton key={i} />)}
        </View>
      ) : (
        <FlatList
          data={events}
          keyExtractor={keyExtractor}
          renderItem={({ item }) => <EventCard event={item} />}
          contentContainerStyle={events.length === 0 ? styles.emptyContainer : styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); void fetchEvents(true) }}
              tintColor={Colors.brand[500]}
            />
          }
          ListEmptyComponent={
            <EmptyState title={t('events.empty')} description={t('events.try_filters')} icon="📅" />
          }
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.gray[50] },
  topBar: {
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray[100],
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.sm,
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.gray[100],
    borderRadius: 100,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
    borderWidth: 1,
    borderColor: Colors.gray[200],
  },
  searchInput: { flex: 1, fontSize: FontSize.sm, color: Colors.gray[900], padding: 0 },
  iconBtn: { padding: Spacing.xs, borderRadius: Radius.sm },
  iconBtnActive: { backgroundColor: Colors.green.light },
  chipsRow: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.sm,
    gap: Spacing.xs,
    flexDirection: 'row',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: 100,
    borderWidth: 1,
    borderColor: Colors.gray[200],
    backgroundColor: Colors.white,
  },
  chipActive: { backgroundColor: Colors.brand[500], borderColor: Colors.brand[500] },
  chipText: { fontSize: FontSize.xs, fontWeight: '500', color: Colors.gray[700] },
  chipTextActive: { color: Colors.white },
  chipIcon: { fontSize: 13 },
  listContent: { padding: Spacing.md, gap: Spacing.sm },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: Spacing.xl },
})
