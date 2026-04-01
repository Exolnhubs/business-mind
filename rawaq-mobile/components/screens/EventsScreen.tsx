import { useEffect, useRef, useState, useCallback } from 'react'
import {
  Animated, View, Text, FlatList, TextInput, StyleSheet,
  TouchableOpacity, ScrollView, RefreshControl, Alert, ActivityIndicator,
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
interface SavedSignalEvent {
  id: string
  category_id: string | null
  city: string
  organizer_id: string
}

function getThisWeekendRange(): { start: string; end: string } {
  const now = new Date()
  const day = now.getDay() // 0=Sun, 6=Sat
  if (day === 0) {
    // Sunday — treat today as the weekend
    const start = new Date(now); start.setHours(0, 0, 0, 0)
    const end   = new Date(now); end.setHours(23, 59, 59, 999)
    return { start: start.toISOString(), end: end.toISOString() }
  }
  const daysToSat = day === 6 ? 0 : (6 - day + 7) % 7
  const saturday  = new Date(now); saturday.setDate(now.getDate() + daysToSat); saturday.setHours(0, 0, 0, 0)
  const sunday    = new Date(saturday); sunday.setDate(saturday.getDate() + 1); sunday.setHours(23, 59, 59, 999)
  return { start: saturday.toISOString(), end: sunday.toISOString() }
}

function getWeekendLabel(): string {
  const now = new Date()
  const day = now.getDay()
  if (day === 0) return 'Today'
  const daysToSat = day === 6 ? 0 : (6 - day + 7) % 7
  const sat = new Date(now); sat.setDate(now.getDate() + daysToSat)
  const sun = new Date(sat);  sun.setDate(sat.getDate() + 1)
  const fmt = (d: Date) => d.toLocaleDateString('en', { month: 'short', day: 'numeric' })
  return `${fmt(sat)} – ${fmt(sun)}`
}

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

function getSpotsLeft(event: Pick<EventWithOrganizer, 'capacity' | 'bookings_count'>) {
  if (!event.capacity) return null
  return event.capacity - event.bookings_count
}

function isAlmostSoldOut(event: Pick<EventWithOrganizer, 'capacity' | 'bookings_count'>) {
  const spotsLeft = getSpotsLeft(event)
  if (spotsLeft === null || spotsLeft <= 0 || !event.capacity) return false
  return spotsLeft <= 10 || spotsLeft / event.capacity <= 0.15
}

export default function EventsScreen() {
  const { t, locale } = useLocale()
  const { user, profile } = useAuth()
  const [events, setEvents]         = useState<EventWithOrganizer[]>([])
  const [savedIds, setSavedIds]     = useState<Set<string>>(new Set())
  const [savedInspiredEvents, setSavedInspiredEvents]   = useState<EventWithOrganizer[]>([])
  const [almostSoldOutEvents, setAlmostSoldOutEvents]   = useState<EventWithOrganizer[]>([])
  const [nearYouWeekendEvents, setNearYouWeekendEvents] = useState<EventWithOrganizer[]>([])
  const [weekendCoords, setWeekendCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [weekendRadiusKm, setWeekendRadiusKm] = useState(25)
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
  const [radiusKm, setRadiusKm]     = useState(25)
  const showRecommendationRails = !search && !categoryId && city === 'All' && !freeOnly && !nearMe

  // Fade the pin icon out while the user is typing, back in when cleared
  const pinOpacity = useRef(new Animated.Value(1)).current
  useEffect(() => {
    Animated.timing(pinOpacity, {
      toValue: search.length > 0 ? 0 : 1,
      duration: 180,
      useNativeDriver: true,
    }).start()
  }, [search])

  useEffect(() => {
    supabase
      .from('event_categories')
      .select('id, name_en, name_ar, icon')
      .eq('is_active', true)
      .order('sort_order')
      .then(({ data }) => setCategories((data ?? []) as Category[]))
  }, [])

  // Silently grab coords for "Near You This Weekend":
  // 1. Last-known GPS (no prompt) if permission already granted
  // 2. Fall back to coordinates saved in the user's profile
  useEffect(() => {
    async function detectCoords() {
      try {
        const { status } = await Location.getForegroundPermissionsAsync()
        if (status === 'granted') {
          const pos = await Location.getLastKnownPositionAsync()
          if (pos) {
            setWeekendCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude })
            return
          }
        }
      } catch { /* ignore GPS errors */ }
      // GPS unavailable — use profile's saved coordinates if present
      const profileLat = (profile as Record<string, unknown>)?.lat as number | null | undefined
      const profileLng = (profile as Record<string, unknown>)?.lng as number | null | undefined
      if (profileLat != null && profileLng != null) {
        setWeekendCoords({ lat: profileLat, lng: profileLng })
      }
    }
    detectCoords()
  }, [profile])

  async function toggleNearMe() {
    if (nearMe) { setNearMe(false); setGeoCoords(null); return }
    setGeoLoading(true)
    try {
      const { status } = await Location.requestForegroundPermissionsAsync()
      if (status !== 'granted') {
        Alert.alert('Location denied', 'Enable location access to find events near you.')
        return
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
      const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude }
      setGeoCoords(coords)
      setNearMe(true)
    } catch {
      Alert.alert('Location error', 'Could not get your location. Please try again.')
    } finally {
      setGeoLoading(false)
    }
  }

  const fetchEvents = useCallback(async () => {
    const geoActive = nearMe ? geoCoords : null
    setLoading(true)
    const eventSelect = `
      *,
      organizer:profiles!organizer_id(
        id, display_name, avatar_url,
        organizer_profile:organizer_profiles!user_id(business_name, business_name_ar, logo_url, verified)
      ),
      category:event_categories(id, name_en, name_ar, icon)
    `
    let query = supabase
      .from('events')
      .select(eventSelect)
      .eq('is_published', true)
      .eq('is_cancelled', false)
      .gte('start_at', new Date().toISOString())
      .order('start_at', { ascending: true })
      .limit(48)

    if (search) {
      const q = search.replace(/'/g, "''")
      query = query.or(`title.ilike.%${q}%,title_ar.ilike.%${q}%,description.ilike.%${q}%`)
    }
    if (city !== 'All')   query = query.eq('city', city)
    if (freeOnly)         query = query.eq('is_free', true)
    if (categoryId)       query = query.eq('category_id', categoryId)

    if (geoActive) {
      const { data: geoEvents, error: rpcErr } = await supabase.rpc('events_within_radius', {
        user_lat: geoActive.lat,
        user_lng: geoActive.lng,
        radius_meters: radiusKm * 1000,
      })
      if (rpcErr) {
        Alert.alert('Location error', rpcErr.message ?? 'Could not find events near you.')
        setNearMe(false); setGeoCoords(null)
        setLoading(false); setRefreshing(false); return
      }
      const ids = ((geoEvents ?? []) as { id: string }[]).map((e) => e.id)
      if (ids.length === 0) {
        setEvents([])
        setLoading(false); setRefreshing(false); return
      }
      query = query.in('id', ids)
    }

    const { data } = await query
    const list = (data ?? []) as unknown as EventWithOrganizer[]
    setEvents(list)

    let nextSavedIds = new Set<string>()

    if (user && list.length) {
      const { data: saves } = await supabase
        .from('saved_events')
        .select('event_id')
        .eq('user_id', user.id)
        .in('event_id', list.map((e) => e.id))
      nextSavedIds = new Set((saves ?? []).map((s) => s.event_id))
      setSavedIds(nextSavedIds)
    } else {
      setSavedIds(new Set())
    }

    if (!showRecommendationRails) {
      setAlmostSoldOutEvents([])
      setSavedInspiredEvents([])
      setNearYouWeekendEvents([])
      setLoading(false)
      setRefreshing(false)
      return
    }

    const [urgencyRes, savedSignalsRes] = await Promise.all([
      supabase
        .from('events')
        .select(eventSelect)
        .eq('is_published', true)
        .eq('is_cancelled', false)
        .gte('start_at', new Date().toISOString())
        .not('capacity', 'is', null)
        .order('start_at', { ascending: true })
        .limit(40),
      user
        ? supabase
            .from('saved_events')
            .select(`
              event_id,
              event:events!event_id(id, category_id, city, organizer_id)
            `)
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(12)
        : Promise.resolve({ data: null, error: null }),
    ])

    const urgencyList = ((urgencyRes.data ?? []) as unknown as EventWithOrganizer[])
      .filter((event) => !event.is_cancelled && isAlmostSoldOut(event))
      .sort((a, b) => {
        const spotsA = getSpotsLeft(a) ?? Number.MAX_SAFE_INTEGER
        const spotsB = getSpotsLeft(b) ?? Number.MAX_SAFE_INTEGER
        if (spotsA !== spotsB) return spotsA - spotsB
        return new Date(a.start_at).getTime() - new Date(b.start_at).getTime()
      })
      .slice(0, 6)
    setAlmostSoldOutEvents(urgencyList)

    const savedSignals = ((savedSignalsRes.data ?? []) as unknown as Array<{ event_id: string; event: SavedSignalEvent | null }>)
      .map((row) => row.event)
      .filter(Boolean) as SavedSignalEvent[]

    let savedInspiredIds = new Set<string>()

    if (savedSignals.length) {
      const savedEventIds = new Set(((savedSignalsRes.data ?? []) as unknown as Array<{ event_id: string }>).map((row) => row.event_id))
      const savedCategories = [...new Set(savedSignals.map((event) => event.category_id).filter(Boolean))] as string[]
      const savedCities = [...new Set(savedSignals.map((event) => event.city).filter(Boolean))]
      const savedOrganizers = new Set(savedSignals.map((event) => event.organizer_id))

      let candidateQuery = supabase
        .from('events')
        .select(eventSelect)
        .eq('is_published', true)
        .eq('is_cancelled', false)
        .gte('start_at', new Date().toISOString())
        .order('start_at', { ascending: true })
        .limit(40)

      if (savedCategories.length > 0) {
        candidateQuery = candidateQuery.in('category_id', savedCategories)
      } else if (savedCities.length > 0) {
        candidateQuery = candidateQuery.in('city', savedCities)
      }

      const { data: candidateData } = await candidateQuery
      const candidateList = (candidateData ?? []) as unknown as EventWithOrganizer[]
      const featuredIds = new Set(urgencyList.map((event) => event.id))

      const ranked = candidateList
        .filter((event) => !savedEventIds.has(event.id) && !featuredIds.has(event.id))
        .map((event) => {
          let score = 0
          if (event.category_id && savedCategories.includes(event.category_id)) score += 3
          if (savedCities.includes(event.city)) score += 2
          if (savedOrganizers.has(event.organizer_id)) score += 1
          if (isAlmostSoldOut(event)) score += 1
          return { event, score }
        })
        .filter((item) => item.score > 0)
        .sort((a, b) => {
          if (b.score !== a.score) return b.score - a.score
          return new Date(a.event.start_at).getTime() - new Date(b.event.start_at).getTime()
        })
        .slice(0, 6)
        .map((item) => item.event)

      setSavedInspiredEvents(ranked)
      savedInspiredIds = new Set(ranked.map((e) => e.id))
    } else {
      setSavedInspiredEvents([])
    }

    // ── Near You This Weekend ─────────────────────────────────────────────────
    const { start: wStart, end: wEnd } = getThisWeekendRange()
    const shownIds = new Set([...urgencyList.map((e) => e.id), ...savedInspiredIds])

    if (weekendCoords) {
      // Prefer GPS radius — use same RPC as the Near Me toggle
      const { data: geoIds } = await supabase.rpc('events_within_radius', {
        user_lat:      weekendCoords.lat,
        user_lng:      weekendCoords.lng,
        radius_meters: weekendRadiusKm * 1000,
      })
      const ids = ((geoIds ?? []) as { id: string }[]).map((e) => e.id)
      if (ids.length > 0) {
        const { data: weekendData } = await supabase
          .from('events')
          .select(eventSelect)
          .in('id', ids)
          .eq('is_published', true)
          .eq('is_cancelled', false)
          .gte('start_at', wStart)
          .lte('start_at', wEnd)
          .order('start_at', { ascending: true })
          .limit(8)
        const weekendList = (weekendData ?? []) as unknown as EventWithOrganizer[]
        setNearYouWeekendEvents(weekendList.filter((e) => !shownIds.has(e.id)).slice(0, 6))
      } else {
        setNearYouWeekendEvents([])
      }
    } else if (city !== 'All') {
      // City-string fallback when no GPS coords are available
      const { data: weekendData } = await supabase
        .from('events')
        .select(eventSelect)
        .eq('is_published', true)
        .eq('is_cancelled', false)
        .eq('city', city)
        .gte('start_at', wStart)
        .lte('start_at', wEnd)
        .order('start_at', { ascending: true })
        .limit(8)
      const weekendList = (weekendData ?? []) as unknown as EventWithOrganizer[]
      setNearYouWeekendEvents(weekendList.filter((e) => !shownIds.has(e.id)).slice(0, 6))
    } else {
      setNearYouWeekendEvents([])
    }

    setLoading(false)
    setRefreshing(false)
  }, [search, categoryId, city, freeOnly, nearMe, geoCoords, radiusKm, showRecommendationRails, user, weekendCoords, weekendRadiusKm])

  useEffect(() => { fetchEvents() }, [fetchEvents])

  function onRefresh() {
    setRefreshing(true)
    fetchEvents()
  }

  function handleSaveChange(id: string, saved: boolean) {
    setSavedIds((prev) => {
      const next = new Set(prev)
      if (saved) next.add(id)
      else next.delete(id)
      return next
    })
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
          {/* Near-me pin — fades away while typing */}
          <Animated.View
            style={{ opacity: pinOpacity }}
            pointerEvents={search.length > 0 ? 'none' : 'auto'}
          >
            <TouchableOpacity
              onPress={toggleNearMe}
              disabled={geoLoading}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              {geoLoading
                ? <ActivityIndicator size="small" color={Colors.brand[500]} />
                : <Ionicons
                    name={nearMe ? 'location' : 'location-outline'}
                    size={20}
                    color={nearMe ? Colors.brand[500] : Colors.gray[400]}
                  />
              }
            </TouchableOpacity>
          </Animated.View>
        </View>
      </View>

      {/* Radius selector — visible only when Near Me is active */}
      {nearMe && (
        <View style={styles.radiusRow}>
          <Ionicons name="radio-outline" size={14} color={Colors.brand[500]} style={{ marginRight: Spacing.xs }} />
          <Text style={styles.radiusLabel}>Radius:</Text>
          {[5, 10, 25, 50, 100].map((km) => (
            <TouchableOpacity
              key={km}
              style={[styles.radiusChip, radiusKm === km && styles.radiusChipActive]}
              onPress={() => setRadiusKm(km)}
            >
              <Text style={[styles.radiusChipText, radiusKm === km && styles.radiusChipTextActive]}>
                {km} km
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Category chips */}
      <View style={styles.categoryRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <TouchableOpacity
            onPress={() => setCategoryId(null)}
            style={[styles.chip, !categoryId && styles.chipActive]}
          >
            <Text style={[styles.chipText, !categoryId && styles.chipTextActive]}>{t('events.all')}</Text>
          </TouchableOpacity>
          {categories.map((c) => (
            <TouchableOpacity
              key={c.id}
              onPress={() => setCategoryId(categoryId === c.id ? null : c.id)}
              style={[styles.chip, categoryId === c.id && styles.chipActive]}
            >
              <Text style={[styles.chipText, categoryId === c.id && styles.chipTextActive]} numberOfLines={1}>
                {c.icon ? `${c.icon} ` : ''}{locale === 'ar' && c.name_ar ? c.name_ar : c.name_en}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

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
                {c === 'All' ? t('events.all_cities') : c}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <TouchableOpacity
          onPress={() => setFreeOnly((v) => !v)}
          style={[styles.miniChip, freeOnly && styles.miniChipActiveGreen, { marginLeft: Spacing.sm }]}
        >
          <Text style={[styles.miniChipText, freeOnly && { color: Colors.green.text }]}>
            {t('events.free_filter')}
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
          ListHeaderComponent={
            showRecommendationRails && (nearYouWeekendEvents.length > 0 || savedInspiredEvents.length > 0)
              ? (
                <View>
                  {nearYouWeekendEvents.length > 0 && (
                    <RecommendationRail
                      title="Near You This Weekend"
                      subtitle={
                        weekendCoords
                          ? `Within ${weekendRadiusKm} km · ${getWeekendLabel()}`
                          : `${city} · ${getWeekendLabel()}`
                      }
                      events={nearYouWeekendEvents}
                      savedIds={savedIds}
                      onSaveChange={handleSaveChange}
                      accent="weekend"
                      radiusKm={weekendCoords ? weekendRadiusKm : undefined}
                      onRadiusChange={weekendCoords ? setWeekendRadiusKm : undefined}
                    />
                  )}
                  {savedInspiredEvents.length > 0 && (
                    <RecommendationRail
                      title="Because You Saved..."
                      subtitle="Fresh picks that match the events you bookmarked."
                      events={savedInspiredEvents}
                      savedIds={savedIds}
                      onSaveChange={handleSaveChange}
                    />
                  )}
                </View>
                )
              : null
          }
          renderItem={({ item, index }) => (
            <View>
              {index === 5 && showRecommendationRails && almostSoldOutEvents.length > 0 && (
                <RecommendationRail
                  title="Almost Sold Out"
                  subtitle="Popular events that are close to filling up."
                  events={almostSoldOutEvents}
                  savedIds={savedIds}
                  onSaveChange={handleSaveChange}
                  urgency
                />
              )}
              <EventCard event={item} isSaved={savedIds.has(item.id)} onSaveChange={handleSaveChange} />
            </View>
          )}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.brand[500]} />}
          ListFooterComponent={
            showRecommendationRails && events.length > 0 && events.length <= 6 && almostSoldOutEvents.length > 0
              ? (
                <RecommendationRail
                  title="Almost Sold Out"
                  subtitle="Popular events that are close to filling up."
                  events={almostSoldOutEvents}
                  savedIds={savedIds}
                  onSaveChange={handleSaveChange}
                  urgency
                />
                )
              : null
          }
          ListEmptyComponent={
            nearMe
              ? <EmptyState icon="📍" title="No events nearby" description={`No events found within ${radiusKm} km of your location`} />
              : <EmptyState icon="📭" title={t('events.empty')} description={t('events.try_filters')} />
          }
        />
      )}
    </View>
  )
}

const WEEKEND_RADIUS_OPTIONS = [5, 10, 25, 50, 100]

function RecommendationRail({
  title,
  subtitle,
  events,
  savedIds,
  onSaveChange,
  urgency = false,
  accent,
  radiusKm,
  onRadiusChange,
}: {
  title: string
  subtitle: string
  events: EventWithOrganizer[]
  savedIds: Set<string>
  onSaveChange: (id: string, saved: boolean) => void
  urgency?: boolean
  accent?: 'weekend'
  radiusKm?: number
  onRadiusChange?: (km: number) => void
}) {
  return (
    <View style={[styles.railSection, urgency && styles.railSectionUrgent, accent === 'weekend' && styles.railSectionWeekend]}>
      <View style={styles.railHeader}>
        <Text style={styles.railTitle}>{title}</Text>
        <View style={styles.railSubtitleRow}>
          <Text style={styles.railSubtitle}>{subtitle}</Text>
          {radiusKm !== undefined && onRadiusChange && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.radiusInlineScroll}>
              {WEEKEND_RADIUS_OPTIONS.map((km) => (
                <TouchableOpacity
                  key={km}
                  style={[styles.radiusInlineChip, radiusKm === km && styles.radiusInlineChipActive]}
                  onPress={() => onRadiusChange(km)}
                >
                  <Text style={[styles.radiusInlineChipText, radiusKm === km && styles.radiusInlineChipTextActive]}>
                    {km} km
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </View>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.railScroller}
      >
        {events.map((event) => (
          <EventCard
            key={event.id}
            event={event}
            isSaved={savedIds.has(event.id)}
            onSaveChange={onSaveChange}
            variant="rail"
          />
        ))}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.gray[50] },
  searchRow: { backgroundColor: Colors.white, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.gray[100] },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: Colors.gray[100], borderRadius: Radius.lg, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 2 },
  searchInput: { flex: 1, fontSize: FontSize.base, color: Colors.gray[900] },
  categoryRow: { backgroundColor: Colors.white, paddingVertical: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.gray[100], paddingLeft: Spacing.lg },
  chip: { flexShrink: 0, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: Radius.full, backgroundColor: Colors.gray[100], marginRight: Spacing.sm },
  chipActive: { backgroundColor: Colors.brand[500] },
  chipText: { fontSize: FontSize.sm, color: Colors.gray[600], fontWeight: FontWeight.medium },
  chipTextActive: { color: Colors.white },
  filterRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.gray[100] },
  miniChip: { paddingHorizontal: Spacing.md, paddingVertical: 5, borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.gray[200], marginRight: Spacing.xs, backgroundColor: Colors.white },
  miniChipActive: { borderColor: Colors.brand[400], backgroundColor: Colors.brand[50] },
  miniChipActiveGreen: { borderColor: Colors.green.DEFAULT, backgroundColor: Colors.green.light },
  miniChipText: { fontSize: FontSize.xs, color: Colors.gray[600] },
  miniChipTextActive: { color: Colors.brand[700] },
  list: { padding: Spacing.lg },
  railSection: {
    marginBottom: Spacing.lg,
    marginTop: Spacing.xs,
    marginHorizontal: -Spacing.lg,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.white,
    borderRadius: Radius.xl,
  },
  railSectionUrgent: {
    backgroundColor: '#fff7ed',
  },
  railSectionWeekend: {
    backgroundColor: '#f0fdf4',
  },
  railHeader: {
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  railTitle: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.gray[900],
  },
  railSubtitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginTop: 4,
  },
  railSubtitle: {
    fontSize: FontSize.sm,
    color: Colors.gray[500],
  },
  radiusInlineScroll: { flexShrink: 1 },
  radiusInlineChip: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.green.DEFAULT,
    backgroundColor: Colors.white,
    marginRight: Spacing.xs,
  },
  radiusInlineChipActive: {
    backgroundColor: Colors.green.DEFAULT,
  },
  radiusInlineChipText: {
    fontSize: FontSize.xs,
    color: Colors.green.text,
    fontWeight: FontWeight.medium,
  },
  radiusInlineChipTextActive: {
    color: Colors.white,
  },
  railScroller: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xs,
  },

  radiusRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.brand[50], paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.brand[100], gap: Spacing.xs },
  radiusLabel: { fontSize: FontSize.xs, color: Colors.brand[600], fontWeight: FontWeight.medium, marginRight: Spacing.xs },
  radiusChip: { paddingHorizontal: Spacing.sm + 2, paddingVertical: 4, borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.brand[200], backgroundColor: Colors.white },
  radiusChipActive: { backgroundColor: Colors.brand[500], borderColor: Colors.brand[500] },
  radiusChipText: { fontSize: FontSize.xs, color: Colors.brand[600] },
  radiusChipTextActive: { color: Colors.white, fontWeight: FontWeight.semibold },
})
