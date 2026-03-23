import { useEffect, useState, useCallback } from 'react'
import {
  View, Text, FlatList, TextInput, StyleSheet,
  TouchableOpacity, ScrollView, RefreshControl,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '@/lib/supabase'
import { EventCard, EventCardSkeleton } from '@/components/events/EventCard'
import { EmptyState } from '@/components/ui/EmptyState'
import { useLocale } from '@/contexts/locale-context'
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/theme'
import type { EventWithOrganizer } from '@/types/database'

const CATEGORIES = ['All', 'Sports', 'Art', 'Music', 'Tech', 'Food', 'Community', 'Education']
const CITIES     = ['All', 'Riyadh', 'Jeddah', 'Dammam', 'Mecca', 'Medina', 'Khobar']

export default function EventsScreen() {
  const { t, locale } = useLocale()
  const [events, setEvents]         = useState<EventWithOrganizer[]>([])
  const [loading, setLoading]       = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [search, setSearch]         = useState('')
  const [category, setCategory]     = useState('All')
  const [city, setCity]             = useState('All')
  const [freeOnly, setFreeOnly]     = useState(false)

  const fetchEvents = useCallback(async () => {
    let query = supabase
      .from('events')
      .select(`
        *,
        organizer:profiles!organizer_id(id, display_name, avatar_url),
        organizer_profile:organizer_profiles!organizer_id(business_name, business_name_ar, logo_url, verified),
        category:event_categories(id, name_en, name_ar, icon)
      `)
      .eq('is_published', true)
      .eq('is_cancelled', false)
      .gte('start_at', new Date().toISOString())
      .order('start_at', { ascending: true })
      .limit(30)

    if (search)           query = query.ilike('title', `%${search}%`)
    if (city !== 'All')   query = query.eq('city', city)
    if (freeOnly)         query = query.eq('is_free', true)
    if (category !== 'All') {
      const { data: cat } = await supabase
        .from('event_categories')
        .select('id')
        .ilike('name_en', category)
        .single()
      if (cat) query = query.eq('category_id', cat.id)
      else { setEvents([]); setLoading(false); return }
    }

    const { data } = await query
    setEvents((data ?? []) as EventWithOrganizer[])
    setLoading(false)
    setRefreshing(false)
  }, [search, category, city, freeOnly])

  useEffect(() => { fetchEvents() }, [fetchEvents])

  function onRefresh() {
    setRefreshing(true)
    fetchEvents()
  }

  return (
    <View style={styles.container}>
      {/* Search bar */}
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
            <TouchableOpacity onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={16} color={Colors.gray[400]} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Category chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipRow}
      >
        {CATEGORIES.map((c) => (
          <TouchableOpacity
            key={c}
            onPress={() => setCategory(c)}
            style={[styles.chip, category === c && styles.chipActive]}
          >
            <Text style={[styles.chipText, category === c && styles.chipTextActive]}>{c}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* City + free filter row */}
      <View style={styles.filterRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {CITIES.map((c) => (
            <TouchableOpacity
              key={c}
              onPress={() => setCity(c)}
              style={[styles.miniChip, city === c && styles.miniChipActive]}
            >
              <Text style={[styles.miniChipText, city === c && styles.miniChipTextActive]}>
                {c === 'All' ? '📍 All cities' : c}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <TouchableOpacity
          onPress={() => setFreeOnly((v) => !v)}
          style={[styles.miniChip, freeOnly && styles.miniChipActiveGreen, { marginLeft: Spacing.sm }]}
        >
          <Text style={[styles.miniChipText, freeOnly && { color: Colors.green.text }]}>
            Free
          </Text>
        </TouchableOpacity>
      </View>

      {/* List */}
      {loading ? (
        <View style={styles.list}>
          {[1, 2, 3].map((i) => <EventCardSkeleton key={i} />)}
        </View>
      ) : (
        <FlatList
          data={events}
          keyExtractor={(e) => e.id}
          renderItem={({ item }) => <EventCard event={item} />}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.brand[500]} />}
          ListEmptyComponent={
            <EmptyState icon="📭" title={t('events.empty')} description="Try different filters" />
          }
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.gray[50] },
  searchRow: { backgroundColor: Colors.white, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.gray[100] },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: Colors.gray[100], borderRadius: Radius.lg, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 2 },
  searchInput: { flex: 1, fontSize: FontSize.base, color: Colors.gray[900] },
  chipRow: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, gap: Spacing.sm, backgroundColor: Colors.white },
  chip: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, borderRadius: Radius.full, backgroundColor: Colors.gray[100] },
  chipActive: { backgroundColor: Colors.brand[500] },
  chipText: { fontSize: FontSize.sm, color: Colors.gray[600], fontWeight: FontWeight.medium },
  chipTextActive: { color: Colors.white },
  filterRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.gray[100], marginBottom: Spacing.xs },
  miniChip: { paddingHorizontal: Spacing.md, paddingVertical: 5, borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.gray[200], marginRight: Spacing.xs, backgroundColor: Colors.white },
  miniChipActive: { borderColor: Colors.brand[400], backgroundColor: Colors.brand[50] },
  miniChipActiveGreen: { borderColor: Colors.green.DEFAULT, backgroundColor: Colors.green.light },
  miniChipText: { fontSize: FontSize.xs, color: Colors.gray[600] },
  miniChipTextActive: { color: Colors.brand[700] },
  list: { padding: Spacing.lg },
})
