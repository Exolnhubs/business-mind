import { useEffect, useState, useCallback } from 'react'
import {
  View, Text, FlatList, TextInput, StyleSheet,
  TouchableOpacity, ScrollView, RefreshControl, Alert,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import * as Location from 'expo-location'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/auth-context'
import { EventCard, EventCardSkeleton } from '@/components/events/EventCard'
import { EmptyState } from '@/components/ui/EmptyState'
import { useLocale } from '@/contexts/locale-context'
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/theme'
import type { EventWithOrganizer } from '@/types/database'

interface Category { id: string; name_en: string; name_ar: string; icon: string | null }

const CITIES = [
  'All',
  // Saudi Arabia
  'Riyadh', 'Jeddah', 'Dammam', 'Mecca', 'Medina', 'Khobar',
  // UAE
  'Dubai', 'Abu Dhabi',
  // Egypt
  'Cairo', 'Alexandria', 'Giza',
  // Jordan
  'Amman', 'Aqaba',
  // Kuwait & Gulf
  'Kuwait City', 'Doha', 'Manama',
  // Oman
  'Muscat', 'Salalah',
  // Levant
  'Beirut', 'Ramallah',
  // North Africa
  'Casablanca', 'Marrakech', 'Tunis',
  // Iraq
  'Baghdad',
]

export default function EventsScreen() {
  const { t, locale } = useLocale()
  const { user } = useAuth()
  const [events, setEvents]         = useState<EventWithOrganizer[]>([])
  const [savedIds, setSavedIds]     = useState<Set<string>>(new Set())
  const [loading, setLoading]       = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [search, setSearch]         = useState('')
  const [categories, setCategories] = useState<Category[]>([])
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [city, setCity]             = useState('All')
  const [freeOnly, setFreeOnly]     = useState(false)
  const [nearMe, setNearMe]         = useState(false)
  const [geoCoords, setGeoCoords]   = useState<{ lat: number; lng: number } | null>(null)
  const [geoLoading, setGeoLoading] = useState(false)

  useEffect(() => {
    supabase
      .from('event_categories')
      .select('id, name_en, name_ar, icon')
      .eq('is_active', true)
      .order('sort_order')
      .then(({ data }) => setCategories((data ?? []) as Category[]))
  }, [])

  async function toggleNearMe() {
    if (nearMe) { setNearMe(false); setGeoCoords(null); return }
    setGeoLoading(true)
    const { status } = await Location.requestForegroundPermissionsAsync()
    if (status !== 'granted') {
      Alert.alert('Location denied', 'Enable location access to find events near you.')
      setGeoLoading(false); return
    }
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
    setGeoCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude })
    setNearMe(true)
    setGeoLoading(false)
  }

  const fetchEvents = useCallback(async () => {
    let query = supabase
      .from('events')
      .select(`
        *,
        organizer:profiles!organizer_id(
          id, display_name, avatar_url,
          organizer_profile:organizer_profiles!user_id(business_name, business_name_ar, logo_url, verified)
        ),
        category:event_categories(id, name_en, name_ar, icon)
      `)
      .eq('is_published', true)
      .eq('is_cancelled', false)
      .gte('start_at', new Date().toISOString())
      .order('start_at', { ascending: true })
      .limit(30)

    if (search) {
      const q = search.replace(/'/g, "''")
      query = query.or(`title.ilike.%${q}%,title_ar.ilike.%${q}%,description.ilike.%${q}%`)
    }
    if (city !== 'All')   query = query.eq('city', city)
    if (freeOnly)         query = query.eq('is_free', true)
    if (categoryId)       query = query.eq('category_id', categoryId)

    // Geo filter
    if (nearMe && geoCoords) {
      const { data: geoEvents } = await supabase.rpc('events_within_radius', {
        user_lat: geoCoords.lat,
        user_lng: geoCoords.lng,
        radius_meters: 25000,
      })
      if (geoEvents) {
        const ids = (geoEvents as { id: string }[]).map((e) => e.id)
        if (ids.length === 0) { setEvents([]); setLoading(false); setRefreshing(false); return }
        query = query.in('id', ids)
      }
    }

    const { data } = await query
    const list = (data ?? []) as EventWithOrganizer[]
    setEvents(list)

    // Fetch saved IDs for logged-in user
    if (user && list.length) {
      const { data: saves } = await supabase
        .from('saved_events').select('event_id').eq('user_id', user.id)
        .in('event_id', list.map((e) => e.id))
      setSavedIds(new Set((saves ?? []).map((s) => s.event_id)))
    }

    setLoading(false)
    setRefreshing(false)
  }, [search, categoryId, city, freeOnly, nearMe, geoCoords, user])

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
        <TouchableOpacity
          key="all"
          onPress={() => setCategoryId(null)}
          style={[styles.chip, !categoryId && styles.chipActive]}
        >
          <Text style={[styles.chipText, !categoryId && styles.chipTextActive]}>All</Text>
        </TouchableOpacity>
        {categories.map((c) => (
          <TouchableOpacity
            key={c.id}
            onPress={() => setCategoryId(categoryId === c.id ? null : c.id)}
            style={[styles.chip, categoryId === c.id && styles.chipActive]}
          >
            <Text style={[styles.chipText, categoryId === c.id && styles.chipTextActive]}>
              {c.icon ? `${c.icon} ` : ''}{c.name_en}
            </Text>
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

      {/* Near me chip */}
      <View style={styles.geoRow}>
        <TouchableOpacity
          onPress={toggleNearMe}
          disabled={geoLoading}
          style={[styles.miniChip, nearMe && styles.miniChipActive]}
        >
          <Text style={[styles.miniChipText, nearMe && styles.miniChipTextActive]}>
            {geoLoading ? '⌛' : '📍'} {nearMe ? 'Near me ✕' : 'Near me'}
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
          renderItem={({ item }) => <EventCard event={item} isSaved={savedIds.has(item.id)} />}
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
  chipRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, backgroundColor: Colors.white },
  chip: { flexShrink: 0, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: Radius.full, backgroundColor: Colors.gray[100], marginRight: Spacing.sm },
  chipActive: { backgroundColor: Colors.brand[500] },
  chipText: { fontSize: FontSize.sm, color: Colors.gray[600], fontWeight: FontWeight.medium },
  chipTextActive: { color: Colors.white },
  filterRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.gray[100] },
  geoRow: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.gray[100], marginBottom: Spacing.xs },
  miniChip: { paddingHorizontal: Spacing.md, paddingVertical: 5, borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.gray[200], marginRight: Spacing.xs, backgroundColor: Colors.white },
  miniChipActive: { borderColor: Colors.brand[400], backgroundColor: Colors.brand[50] },
  miniChipActiveGreen: { borderColor: Colors.green.DEFAULT, backgroundColor: Colors.green.light },
  miniChipText: { fontSize: FontSize.xs, color: Colors.gray[600] },
  miniChipTextActive: { color: Colors.brand[700] },
  list: { padding: Spacing.lg },
})
