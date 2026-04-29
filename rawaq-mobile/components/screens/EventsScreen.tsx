import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import {
  Animated, View, Text, FlatList, TextInput, StyleSheet, Image,
  TouchableOpacity, ScrollView, RefreshControl, Alert, ActivityIndicator,
  Dimensions,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router'
import * as Location from 'expo-location'
import { supabase } from '@/lib/supabase'
import { apiDelete, apiGet, apiPost } from '@/lib/api'
import { useAuth } from '@/contexts/auth-context'
import { EventCard, EventCardSkeleton, RailSkeleton } from '@/components/events/EventCard'
import { HappeningDiscoveryCard, type HappeningDiscoveryItem } from '@/components/happenings/HappeningDiscoveryCard'
import { HappeningCommentsSheet } from '@/components/happenings/HappeningCommentsSheet'
import { EmptyState } from '@/components/ui/EmptyState'
import { Badge } from '@/components/ui/Badge'
import { useLocale } from '@/contexts/locale-context'
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/theme'
import type { Community, EventWithOrganizer } from '@/types/database'
import { applyResolvedEventWindow, compareEventsByResolvedStartAt } from '@/lib/event-recurrence'
import { formatCurrency } from '@/lib/utils'

type JoinedCommunity = Pick<Community, 'id' | 'name' | 'name_ar' | 'slug' | 'level'>
type CommunityListItem = JoinedCommunity & { is_member: boolean; member_count: number }
type ActiveCommunity = Pick<Community, 'id' | 'name' | 'name_ar' | 'slug' | 'level' | 'cover_url'> & { is_member: boolean; happening_count: number }
type EventsApiListResponse = {
  data: EventWithOrganizer[]
  total: number
  page: number
  per_page: number
  has_more: boolean
}
type HappeningsDiscoverResponse = {
  happenings: HappeningDiscoveryItem[]
}
type DiscoveryRailItem =
  | { kind: 'event'; id: string; event: EventWithOrganizer }
  | { kind: 'happening'; id: string; happening: HappeningDiscoveryItem }

interface Category { id: string; name_en: string; name_ar: string; icon: string | null }
interface SavedSignalEvent {
  id: string
  category_id: string | null
  city: string
  organizer_id: string
}
interface OrganizerResult {
  id: string
  display_name: string
  avatar_url: string | null
  city: string | null
  organizer_profile: { business_name: string; logo_url: string | null } | null
}
interface CommunitySearchResult {
  id: string
  name: string
  name_ar: string | null
  slug: string
  member_count: number
  level: string
}

function getThisWeekendRange(): { start: string; end: string } {
  const now = new Date()
  const day = now.getDay() // 0=Sun, 6=Sat
  if (day === 0) {
    // Sunday — treat today as the weekend
    const start = new Date(now); start.setHours(0, 0, 0, 0)
    const end = new Date(now); end.setHours(23, 59, 59, 999)
    return { start: start.toISOString(), end: end.toISOString() }
  }
  const daysToSat = day === 6 ? 0 : (6 - day + 7) % 7
  const saturday = new Date(now); saturday.setDate(now.getDate() + daysToSat); saturday.setHours(0, 0, 0, 0)
  const sunday = new Date(saturday); sunday.setDate(saturday.getDate() + 1); sunday.setHours(23, 59, 59, 999)
  return { start: saturday.toISOString(), end: sunday.toISOString() }
}

function getWeekendLabel(): string {
  const now = new Date()
  const day = now.getDay()
  if (day === 0) return 'Today'
  const daysToSat = day === 6 ? 0 : (6 - day + 7) % 7
  const sat = new Date(now); sat.setDate(now.getDate() + daysToSat)
  const sun = new Date(sat); sun.setDate(sat.getDate() + 1)
  const fmt = (d: Date) => d.toLocaleDateString('en', { month: 'short', day: 'numeric' })
  return `${fmt(sat)} - ${fmt(sun)}`
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

function interleaveDiscoveryItems(
  events: EventWithOrganizer[],
  happenings: HappeningDiscoveryItem[],
  maxItems = 8,
): DiscoveryRailItem[] {
  const result: DiscoveryRailItem[] = []
  let eventIndex = 0
  let happeningIndex = 0
  let nextKind: 'event' | 'happening' =
    happenings.length > events.length ? 'happening' : 'event'

  while (result.length < maxItems && (eventIndex < events.length || happeningIndex < happenings.length)) {
    if (nextKind === 'event' && eventIndex < events.length) {
      const event = events[eventIndex++]
      result.push({ kind: 'event', id: `event:${event.id}`, event })
      nextKind = 'happening'
      continue
    }

    if (nextKind === 'happening' && happeningIndex < happenings.length) {
      const happening = happenings[happeningIndex++]
      result.push({ kind: 'happening', id: `happening:${happening.id}`, happening })
      nextKind = 'event'
      continue
    }

    if (eventIndex < events.length) {
      const event = events[eventIndex++]
      result.push({ kind: 'event', id: `event:${event.id}`, event })
    } else if (happeningIndex < happenings.length) {
      const happening = happenings[happeningIndex++]
      result.push({ kind: 'happening', id: `happening:${happening.id}`, happening })
    }
  }

  return result
}

function dedupeHappeningItems(items: HappeningDiscoveryItem[]) {
  const seen = new Set<string>()
  return items.filter((item) => {
    if (seen.has(item.id)) return false
    seen.add(item.id)
    return true
  })
}

function claimUniqueHappenings(
  items: HappeningDiscoveryItem[],
  claimedIds: Set<string>,
) {
  return dedupeHappeningItems(items).filter((item) => {
    if (claimedIds.has(item.id)) return false
    claimedIds.add(item.id)
    return true
  })
}

const DATA_REFRESH_STALE_MS = 90_000
const SEARCH_DEBOUNCE_MS = 350

function resolveUpcomingEvents(rows: EventWithOrganizer[]) {
  return rows
    .map((event) => applyResolvedEventWindow(event))
    .filter((event) => new Date(event.start_at).getTime() >= Date.now())
    .sort((left, right) => compareEventsByResolvedStartAt(left, right))
}

export default function EventsScreen() {
  const { t, locale } = useLocale()
  const { user, profile } = useAuth()
  const router = useRouter()
  const params = useLocalSearchParams<{ community?: string; reset?: string }>()
  const routeCommunitySlug = typeof params.community === 'string' ? params.community : null
  const routeResetToken = typeof params.reset === 'string' ? params.reset : null
  const [events, setEvents] = useState<EventWithOrganizer[]>([])
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set())
  const [, setSavedInspiredEvents] = useState<EventWithOrganizer[]>([])
  const [almostSoldOutEvents, setAlmostSoldOutEvents] = useState<EventWithOrganizer[]>([])
  const [nearYouWeekendEvents, setNearYouWeekendEvents] = useState<EventWithOrganizer[]>([])
  const [, setMyCommunityEvents] = useState<EventWithOrganizer[]>([])
  const [hotOfferEvents, setHotOfferEvents] = useState<EventWithOrganizer[]>([])
  const [nearYouWeekendHappenings, setNearYouWeekendHappenings] = useState<HappeningDiscoveryItem[]>([])
  const [, setMyCommunityHappenings] = useState<HappeningDiscoveryItem[]>([])
  const [activeHappenings, setActiveHappenings] = useState<HappeningDiscoveryItem[]>([])
  const [nearbyHappenings, setNearbyHappenings] = useState<HappeningDiscoveryItem[]>([])
  const [filteredCommunityHappenings, setFilteredCommunityHappenings] = useState<HappeningDiscoveryItem[]>([])
  const [featuredEvents, setFeaturedEvents] = useState<EventWithOrganizer[]>([])
  const [suggestedCommunities, setSuggestedCommunities] = useState<CommunityListItem[]>([])
  const [joiningSlug, setJoiningSlug] = useState<string | null>(null)
  const [weekendCoords, setWeekendCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [weekendRadiusKm, setWeekendRadiusKm] = useState(25)
  const [loading, setLoading] = useState(true)
  const [featuredLoading, setFeaturedLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [categories, setCategories] = useState<Category[]>([])
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [city, setCity] = useState('All')
  const [freeOnly, setFreeOnly] = useState(false)
  const [nearMe, setNearMe] = useState(false)
  const [geoCoords, setGeoCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [geoLoading, setGeoLoading] = useState(false)
  const [radiusKm, setRadiusKm] = useState(25)
  const [communitySlug, setCommunitySlug] = useState<string | null>(null)
  const [joinedCommunities, setJoinedCommunities] = useState<JoinedCommunity[]>([])
  const [activeCommunities, setActiveCommunities] = useState<ActiveCommunity[]>([])
  const [selectedHappening, setSelectedHappening] = useState<HappeningDiscoveryItem | null>(null)
  const [orgResults, setOrgResults] = useState<OrganizerResult[]>([])
  const [comResults, setComResults] = useState<CommunitySearchResult[]>([])
  const lastDiscoveryLoadRef = useRef(0)
  const lastEventsLoadRef = useRef(0)
  const latestEventsRequestRef = useRef(0)
  const isDefaultFeed = !debouncedSearch && !freeOnly && !nearMe && !communitySlug
  const showRecommendationRails = isDefaultFeed
  const savedEventsList = useMemo(
    () => events.filter((e) => savedIds.has(e.id)),
    [events, savedIds],
  )

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
    const timeout = setTimeout(() => {
      setDebouncedSearch(search.trim())
    }, SEARCH_DEBOUNCE_MS)

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

  useEffect(() => {
    if (!debouncedSearch) { setOrgResults([]); setComResults([]); return }
    const q = debouncedSearch.trim()
    Promise.all([
      supabase
        .from('profiles')
        .select('id, display_name, avatar_url, city, organizer_profile:organizer_profiles!user_id(business_name, logo_url)')
        .eq('role', 'organizer')
        .ilike('display_name', `%${q}%`)
        .limit(4),
      supabase
        .from('communities')
        .select('id, name, name_ar, slug, member_count, level')
        .eq('is_private', false)
        .or(`name.ilike.%${q}%,name_ar.ilike.%${q}%`)
        .limit(4),
    ]).then(([orgRes, comRes]) => {
      setOrgResults((orgRes.data ?? []) as unknown as OrganizerResult[])
      setComResults((comRes.data ?? []) as unknown as CommunitySearchResult[])
    })
  }, [debouncedSearch])

  const loadJoinedCommunities = useCallback(async (force = false) => {
    if (!user) {
      setJoinedCommunities([])
      setCommunitySlug(routeCommunitySlug)
      return
    }

    const { data, error } = await apiGet<{ data: CommunityListItem[] }>(
      '/api/communities?member_only=true&per_page=20',
      { force },
    )

    if (error) {
      setJoinedCommunities([])
      setCommunitySlug(routeCommunitySlug)
      return
    }

    const nextCommunities = data?.data ?? []
    setJoinedCommunities(nextCommunities)
    setCommunitySlug((current) =>
      current && current !== routeCommunitySlug && !nextCommunities.some((community) => community.slug === current)
        ? null
        : current,
    )
  }, [routeCommunitySlug, user])

  useEffect(() => {
    setCommunitySlug(routeCommunitySlug)
    if (!routeCommunitySlug) return

    setSearch('')
    setCategoryId(null)
    setFreeOnly(false)
    setNearMe(false)
    setGeoCoords(null)
    setRadiusKm(25)
    setCity('All')
    lastDiscoveryLoadRef.current = 0
    lastEventsLoadRef.current = 0
  }, [routeCommunitySlug, routeResetToken])

  const loadDiscoveryMetadata = useCallback(async (force = false) => {
    const now = Date.now()
    if (!force && now - lastDiscoveryLoadRef.current < DATA_REFRESH_STALE_MS) return
    lastDiscoveryLoadRef.current = now

    await loadJoinedCommunities(force)

    const [{ data: activeData }, suggestedResponse] = await Promise.all([
      apiGet<{ communities: ActiveCommunity[] }>('/api/happenings/active?limit=10', { force }),
      user
        ? apiGet<{ data: { data: CommunityListItem[] } }>('/api/communities?per_page=15', { force })
        : Promise.resolve({ data: null, error: null }),
    ])

    setActiveCommunities(activeData?.communities ?? [])

    if (user) {
      const unjoined = (suggestedResponse.data?.data?.data ?? []).filter(
        (community) =>
          !community.is_member &&
          (community.level === 'micro' || community.level === 'interest' || community.level === 'district'),
      )
      setSuggestedCommunities(unjoined.slice(0, 6))
    } else {
      setSuggestedCommunities([])
    }

  }, [loadJoinedCommunities, user])

  // Silently grab coords for "Near You This Weekend" only if permission
  // was already granted. If not, we can later prompt from the rail itself.
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
    }
    detectCoords()
  }, [])

  async function requestWeekendLocation() {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync()
      if (status !== 'granted') {
        Alert.alert('Location denied', 'Enable location access to see events near you this weekend.')
        return
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
      setWeekendCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude })
    } catch {
      Alert.alert('Location error', 'Could not get your location. Please try again.')
    }
  }

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

  const fetchDiscoverHappenings = useCallback(async (
    query: Record<string, string | number | boolean | undefined>,
    force = false,
  ) => {
    const params = new URLSearchParams()
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== false) {
        params.set(key, String(value))
      }
    })
    const { data, error } = await apiGet<HappeningsDiscoverResponse>(`/api/happenings/discover?${params.toString()}`, { force })
    return error ? [] : (data?.happenings ?? [])
  }, [])

  const fetchFeaturedEvents = useCallback(async (force = false) => {
    const { data, error } = await apiGet<{ featured: EventWithOrganizer[]; total: number }>(
      '/api/events/featured',
      { force, ttlMs: 300_000 }, // 5 min cache
    )
    if (error || !data) {
      setFeaturedEvents([])
      setFeaturedLoading(false)
      return
    }
    setFeaturedEvents(data.featured ?? [])
    setFeaturedLoading(false)
  }, [])

  const fallbackSearchEvents = useCallback(async (queryText: string) => {
    const trimmed = queryText.trim()
    if (!trimmed) return [] as EventWithOrganizer[]

    const eventSelect = `
      id, title, title_ar, description, cover_image_url, start_at, end_at,
      venue_name, city, country, lat, lng, capacity, is_free, price, currency,
      gender_restriction, is_family_friendly, bookings_count, views_count,
      organizer_id, category_id, is_published, is_cancelled, visibility_type,
      organizer:profiles!organizer_id(
        id, display_name, avatar_url,
        organizer_profile:organizer_profiles!user_id(business_name, business_name_ar, logo_url, verified)
      ),
      category:event_categories(id, name_en, name_ar, icon)
    `

    let queryBuilder = supabase
      .from('events')
      .select(eventSelect)
      .eq('is_published', true)
      .eq('is_cancelled', false)
      .limit(48)
      .or([
        `title.ilike.%${trimmed}%`,
        `title_ar.ilike.%${trimmed}%`,
        `description.ilike.%${trimmed}%`,
        `venue_name.ilike.%${trimmed}%`,
        `city.ilike.%${trimmed}%`,
      ].join(','))

    if (city !== 'All') queryBuilder = queryBuilder.ilike('city', `%${city}%`)
    if (freeOnly) queryBuilder = queryBuilder.eq('is_free', true)
    if (categoryId) queryBuilder = queryBuilder.eq('category_id', categoryId)

    if (communitySlug) {
      const { data: communityRow } = await supabase
        .from('communities')
        .select('id')
        .eq('slug', communitySlug)
        .maybeSingle()

      if (!communityRow?.id) return [] as EventWithOrganizer[]

      const { data: eventCommunityRows } = await supabase
        .from('event_communities')
        .select('event_id')
        .eq('community_id', communityRow.id)

      const communityEventIds = [...new Set((eventCommunityRows ?? []).map((row) => row.event_id))]
      if (communityEventIds.length === 0) return [] as EventWithOrganizer[]
      queryBuilder = queryBuilder.in('id', communityEventIds)
    }

    const geoActive = nearMe ? geoCoords : null
    if (geoActive) {
      const { data: geoEvents } = await supabase.rpc('events_within_radius', {
        user_lat: geoActive.lat,
        user_lng: geoActive.lng,
        radius_meters: radiusKm * 1000,
      })
      const nearbyIds = [...new Set(((geoEvents ?? []) as { id: string }[]).map((item) => item.id))]
      if (nearbyIds.length === 0) return [] as EventWithOrganizer[]
      queryBuilder = queryBuilder.in('id', nearbyIds)
    }

    const { data } = await queryBuilder
    return resolveUpcomingEvents((data ?? []) as unknown as EventWithOrganizer[])
  }, [categoryId, city, communitySlug, freeOnly, geoCoords, nearMe, radiusKm])

  const patchHappeningAcrossRails = useCallback((
    happeningId: string,
    updater: (happening: HappeningDiscoveryItem) => HappeningDiscoveryItem,
  ) => {
    const applyPatch = (items: HappeningDiscoveryItem[]) =>
      items.map((item) => (item.id === happeningId ? updater(item) : item))

    setNearYouWeekendHappenings(applyPatch)
    setMyCommunityHappenings(applyPatch)
    setActiveHappenings(applyPatch)
    setNearbyHappenings(applyPatch)
    setFilteredCommunityHappenings(applyPatch)
  }, [])

  async function toggleDiscoveryHappeningRsvp(happening: HappeningDiscoveryItem) {
    if (!user) {
      router.push('/auth/login' as any)
      return
    }

    const { data, error } = happening.user_has_rsvp
      ? await apiDelete<{ rsvp: boolean; rsvp_count: number }>(`/api/happenings/${happening.id}/rsvp`)
      : await apiPost<{ rsvp: boolean; rsvp_count: number }>(`/api/happenings/${happening.id}/rsvp`, {})

    if (error) {
      Alert.alert('Happenings unavailable', error)
      return
    }
    if (!data) {
      return
    }

    patchHappeningAcrossRails(happening.id, (item) => ({
      ...item,
      user_has_rsvp: data.rsvp,
      rsvp_count: data.rsvp_count,
    }))
  }

  async function toggleDiscoveryHappeningReact(happening: HappeningDiscoveryItem) {
    if (!user) {
      router.push('/auth/login' as any)
      return
    }

    const { data, error } = happening.user_has_reacted
      ? await apiDelete<{ reacted: boolean; reaction_count: number }>(`/api/happenings/${happening.id}/react`)
      : await apiPost<{ reacted: boolean; reaction_count: number }>(`/api/happenings/${happening.id}/react`, {})

    if (error) {
      Alert.alert('Happenings unavailable', error)
      return
    }
    if (!data) {
      return
    }

    patchHappeningAcrossRails(happening.id, (item) => ({
      ...item,
      user_has_reacted: data.reacted,
      reaction_count: data.reaction_count,
    }))
  }

  const fetchEvents = useCallback(async (force = false) => {
    const requestId = ++latestEventsRequestRef.current
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
    const params = new URLSearchParams({
      per_page: '48',
      date_from: new Date().toISOString(),
    })

    if (debouncedSearch) params.set('search', debouncedSearch)
    if (city !== 'All') params.set('city', city)
    if (freeOnly) params.set('is_free', 'true')
    if (categoryId) params.set('category_id', categoryId)

    // Community filter: resolve slug → event IDs via event_communities
    if (communitySlug) params.set('community', communitySlug)

    if (geoActive) {
      params.set('lat', String(geoActive.lat))
      params.set('lng', String(geoActive.lng))
      params.set('radius_km', String(radiusKm))
    }

    const { data: eventsPayload, error: eventsError } = await apiGet<EventsApiListResponse>(
      `/api/events?${params.toString()}`,
      { force },
    )

    if (requestId !== latestEventsRequestRef.current) return

    let list = eventsPayload?.data ?? []

    if (eventsError) {
      const canFallbackSearch =
        debouncedSearch.length > 0
        && (eventsError.includes('events.fts') || eventsError.includes('column fts does not exist'))

      if (canFallbackSearch) {
        list = await fallbackSearchEvents(debouncedSearch)
      } else {
        setEvents([])
        setSavedIds(new Set())
        setHotOfferEvents([])
        setAlmostSoldOutEvents([])
        setSavedInspiredEvents([])
        setNearYouWeekendEvents([])
        setNearYouWeekendHappenings([])
        setMyCommunityEvents([])
        setMyCommunityHappenings([])
        setActiveHappenings([])
        setNearbyHappenings([])
        setFilteredCommunityHappenings([])
        setLoading(false)
        setRefreshing(false)
        Alert.alert('Events unavailable', eventsError)
        return
      }
    }

    if (requestId !== latestEventsRequestRef.current) return

    if (eventsError && list.length === 0 && debouncedSearch.length > 0) {
      setEvents([])
      setSavedIds(new Set())
      setHotOfferEvents([])
      setAlmostSoldOutEvents([])
      setSavedInspiredEvents([])
      setNearYouWeekendEvents([])
      setNearYouWeekendHappenings([])
      setMyCommunityEvents([])
      setMyCommunityHappenings([])
      setActiveHappenings([])
      setNearbyHappenings([])
      setFilteredCommunityHappenings([])
      setLoading(false)
      setRefreshing(false)
      setLoading(false)
      setRefreshing(false)
      return
    }
    setEvents(list)

    // Hot offers — sorted by soonest expiry so the most urgent deal is first
    const nowMs = Date.now()
    const hotOffers = list
      .filter((event) =>
        !event.is_cancelled &&
        (event.ticket_types ?? []).some(
          (tt) => tt.is_hot_offer && !!tt.hot_offer_ends_at && new Date(tt.hot_offer_ends_at).getTime() > nowMs,
        ),
      )
      .sort((a, b) => {
        const earliest = (ev: EventWithOrganizer) => {
          const times = (ev.ticket_types ?? [])
            .filter((tt) => tt.is_hot_offer && tt.hot_offer_ends_at)
            .map((tt) => new Date(tt.hot_offer_ends_at!).getTime())
          return times.length ? Math.min(...times) : Infinity
        }
        return earliest(a) - earliest(b)
      })
      .slice(0, 8)
    setHotOfferEvents(hotOffers)

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

    const [nearbyHappeningResults, communityHappeningResults] = await Promise.all([
      geoActive
        ? fetchDiscoverHappenings({
          lat: geoActive.lat,
          lng: geoActive.lng,
          radius_km: radiusKm,
          limit: 8,
        }, force)
        : Promise.resolve([]),
      communitySlug
        ? fetchDiscoverHappenings({
          community: communitySlug,
          limit: 8,
        }, force)
        : Promise.resolve([]),
    ])

    setNearbyHappenings(nearbyHappeningResults)
    setFilteredCommunityHappenings(communityHappeningResults)

    if (!showRecommendationRails) {
      setAlmostSoldOutEvents([])
      setSavedInspiredEvents([])
      setNearYouWeekendEvents([])
      setNearYouWeekendHappenings([])
      setMyCommunityEvents([])
      setMyCommunityHappenings([])
      setActiveHappenings([])
      setLoading(false)
      setRefreshing(false)
      return
    }

    const rawUrgencyList = list
      .filter((event) => !event.is_cancelled && isAlmostSoldOut(event))
      .sort((a, b) => {
        const spotsA = getSpotsLeft(a) ?? Number.MAX_SAFE_INTEGER
        const spotsB = getSpotsLeft(b) ?? Number.MAX_SAFE_INTEGER
        if (spotsA !== spotsB) return spotsA - spotsB
        return new Date(a.start_at).getTime() - new Date(b.start_at).getTime()
      })
      .slice(0, 6)

    const [
      savedSignalsRes,
      weekendHappeningResults,
      myCommunityHappeningResults,
      activeHappeningResults,
      weekendGeoRes,
      communityLinksRes,
    ] = await Promise.all([
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
      weekendCoords
        ? fetchDiscoverHappenings({
          lat: weekendCoords.lat,
          lng: weekendCoords.lng,
          radius_km: weekendRadiusKm,
          limit: 6,
        }, force)
        : Promise.resolve([]),
      joinedCommunities.length > 0
        ? fetchDiscoverHappenings({
          joined_only: true,
          limit: 8,
        }, force)
        : Promise.resolve([]),
      fetchDiscoverHappenings({ limit: 8 }, force),
      weekendCoords
        ? supabase.rpc('events_within_radius', {
          user_lat: weekendCoords.lat,
          user_lng: weekendCoords.lng,
          radius_meters: weekendRadiusKm * 1000,
        })
        : Promise.resolve({ data: null }),
      joinedCommunities.length > 0
        ? supabase
          .from('event_communities')
          .select('event_id')
          .in('community_id', joinedCommunities.slice(0, 6).map((community) => community.id))
          .limit(30)
        : Promise.resolve({ data: null }),
    ])
    const savedSignals = ((savedSignalsRes.data ?? []) as unknown as Array<{ event_id: string; event: SavedSignalEvent | null }>)
      .map((row) => row.event)
      .filter(Boolean) as SavedSignalEvent[]
    let rankedSavedEvents: EventWithOrganizer[] = []

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
        .limit(40)

      if (savedCategories.length > 0) {
        candidateQuery = candidateQuery.in('category_id', savedCategories)
      } else if (savedCities.length > 0) {
        candidateQuery = candidateQuery.in('city', savedCities)
      }

      const { data: candidateData } = await candidateQuery
      const candidateList = resolveUpcomingEvents((candidateData ?? []) as unknown as EventWithOrganizer[])

      rankedSavedEvents = candidateList
        .filter((event) => !savedEventIds.has(event.id))
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
          return compareEventsByResolvedStartAt(a.event, b.event)
        })
        .slice(0, 6)
        .map((item) => item.event)
    }


    const { start: wStart, end: wEnd } = getThisWeekendRange()

    const weekendCandidateIds = [...new Set(((weekendGeoRes.data ?? []) as { id: string }[]).map((entry) => entry.id))]
    const communityEventIds = [...new Set(((communityLinksRes.data ?? []) as { event_id: string }[]).map((entry) => entry.event_id))]
    const combinedRailIds = [...new Set([...weekendCandidateIds, ...communityEventIds])]

    let railEventMap = new Map<string, EventWithOrganizer>()
    if (combinedRailIds.length > 0) {
      const { data: railEventRows } = await supabase
        .from('events')
        .select(eventSelect)
        .in('id', combinedRailIds)
        .eq('is_published', true)
        .eq('is_cancelled', false)

      railEventMap = new Map(
        resolveUpcomingEvents((railEventRows ?? []) as unknown as EventWithOrganizer[]).map((event) => [event.id, event]),
      )
    }

    const weekendRailEvents = weekendCandidateIds
      .map((id) => railEventMap.get(id))
      .filter((event): event is EventWithOrganizer => Boolean(event))
      .filter((event) => event.start_at >= wStart && event.start_at <= wEnd)
      .sort((a, b) => compareEventsByResolvedStartAt(a, b))
      .slice(0, 6)
    const weekendIds = new Set(weekendRailEvents.map((event) => event.id))
    setNearYouWeekendEvents(weekendRailEvents)
    setNearYouWeekendHappenings(weekendHappeningResults)

    const nextCommunityEvents = communityEventIds
      .map((id) => railEventMap.get(id))
      .filter((event): event is EventWithOrganizer => Boolean(event))
      .sort((a, b) => compareEventsByResolvedStartAt(a, b))
      .slice(0, 8)
    setMyCommunityEvents(nextCommunityEvents)
    setMyCommunityHappenings(myCommunityHappeningResults)
    setActiveHappenings(activeHappeningResults)

    const filteredUrgencyEvents = rawUrgencyList
      .filter((event) => !weekendIds.has(event.id))
      .slice(0, 6)
    setAlmostSoldOutEvents(filteredUrgencyEvents)

    const filteredSavedEvents = rankedSavedEvents
      .filter((event) => !weekendIds.has(event.id) && !filteredUrgencyEvents.some((urgencyEvent) => urgencyEvent.id === event.id))
      .slice(0, 6)
    setSavedInspiredEvents(filteredSavedEvents)

    setLoading(false)
    setRefreshing(false)
  }, [debouncedSearch, categoryId, city, freeOnly, nearMe, geoCoords, radiusKm, communitySlug, showRecommendationRails, user, weekendCoords, weekendRadiusKm, joinedCommunities, fallbackSearchEvents])

  const refreshEventsIfNeeded = useCallback(async (force = false) => {
    const now = Date.now()
    if (!force && now - lastEventsLoadRef.current < DATA_REFRESH_STALE_MS) return
    lastEventsLoadRef.current = now
    await fetchEvents(force)
  }, [fetchEvents])

  useEffect(() => {
    void loadDiscoveryMetadata(true)
  }, [loadDiscoveryMetadata])

  useEffect(() => {
    void fetchFeaturedEvents(true)
  }, [fetchFeaturedEvents])

  useEffect(() => {
    void refreshEventsIfNeeded(true)
  }, [refreshEventsIfNeeded])

  useEffect(() => {
    if (!routeCommunitySlug) return
    void loadDiscoveryMetadata(true)
    void refreshEventsIfNeeded(true)
  }, [routeCommunitySlug, routeResetToken, loadDiscoveryMetadata, refreshEventsIfNeeded])

  useFocusEffect(
    useCallback(() => {
      void loadDiscoveryMetadata()
      void refreshEventsIfNeeded()
    }, [loadDiscoveryMetadata, refreshEventsIfNeeded]),
  )

  function onRefresh() {
    setRefreshing(true)
    void loadDiscoveryMetadata(true)
    void refreshEventsIfNeeded(true)
  }

  const handleSaveChange = useCallback((id: string, saved: boolean) => {
    setSavedIds((prev) => {
      const next = new Set(prev)
      if (saved) next.add(id)
      else next.delete(id)
      return next
    })
  }, [])

  async function handleJoinSuggested(slug: string) {
    setJoiningSlug(slug)
    const { error } = await apiPost<unknown>(`/api/communities/${slug}/join`, {})
    if (!error) {
      setSuggestedCommunities((prev) => prev.filter((c) => c.slug !== slug))
      void loadJoinedCommunities(true)
    }
    setJoiningSlug(null)
  }

  const {
    weekendDiscoveryItems,
    filteredCommunityItems,
    activeNowItems,
    nearbyHappeningItems,
  } = useMemo(() => {
    const claimedIds = new Set<string>()
    const filteredCommunityRail = claimUniqueHappenings(filteredCommunityHappenings, claimedIds)
    const nearbyRail = claimUniqueHappenings(nearbyHappenings, claimedIds)
    const weekendRail = claimUniqueHappenings(nearYouWeekendHappenings, claimedIds)
    const activeRail = claimUniqueHappenings(activeHappenings, claimedIds)
    return {
      weekendDiscoveryItems: interleaveDiscoveryItems(nearYouWeekendEvents, weekendRail, 8),
      filteredCommunityItems: interleaveDiscoveryItems(events.slice(0, 6), filteredCommunityRail, 8),
      activeNowItems: interleaveDiscoveryItems([], activeRail, 8),
      nearbyHappeningItems: interleaveDiscoveryItems([], nearbyRail, 8),
    }
  }, [events, filteredCommunityHappenings, nearbyHappenings, nearYouWeekendHappenings, activeHappenings, nearYouWeekendEvents])
  const showDiscoveryHeader = showRecommendationRails || nearMe || !!communitySlug

  const keyExtractor = useCallback((e: EventWithOrganizer) => e.id, [])

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
          <TouchableOpacity
            onPress={() => setFreeOnly((v) => !v)}
            style={[styles.searchActionBtn, freeOnly && styles.searchActionBtnActive]}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons
              name={freeOnly ? 'cash' : 'cash-outline'}
              size={18}
              color={freeOnly ? Colors.green.text : Colors.gray[500]}
            />
          </TouchableOpacity>
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

      {/* City indicator — tappable to change */}
      {isDefaultFeed && city !== 'All' && (
        <View style={styles.cityBar}>
          <Ionicons name="location" size={13} color={Colors.brand[500]} />
          <Text style={styles.cityBarText}>Events in <Text style={styles.cityBarCity}>{city}</Text></Text>
          <TouchableOpacity onPress={() => setCity('All')} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
            <Text style={styles.cityBarChange}>Change</Text>
          </TouchableOpacity>
        </View>
      )}


      {communitySlug && (
        <View style={styles.activeCommunityBanner}>
          <View style={{ flex: 1 }}>
            <Text style={styles.activeCommunityLabel}>Community Filter</Text>
            <Text style={styles.activeCommunityName}>
              {joinedCommunities.find((community) => community.slug === communitySlug)?.name ?? communitySlug}
            </Text>
          </View>
          <TouchableOpacity onPress={() => setCommunitySlug(null)} style={styles.activeCommunityClear}>
            <Text style={styles.activeCommunityClearText}>Clear</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* List */}
      {loading ? (
        <View style={styles.list}>
          {[1, 2, 3].map((i) => <EventCardSkeleton key={i} />)}
        </View>
      ) : (
        <FlatList
          data={isDefaultFeed ? events.slice(0, 5) : events}
          keyExtractor={keyExtractor}
          ListHeaderComponent={
            (debouncedSearch && (orgResults.length > 0 || comResults.length > 0))
              ? (
                <View style={styles.searchResultsSection}>
                  <Text style={styles.searchResultsSectionLabel}>People &amp; Communities</Text>
                  {orgResults.map((org) => {
                    const name = org.organizer_profile?.business_name || org.display_name
                    const initials = name.slice(0, 2).toUpperCase()
                    return (
                      <TouchableOpacity
                        key={org.id}
                        style={styles.searchResultRow}
                        activeOpacity={0.75}
                        onPress={() => router.push(`/user/${org.id}` as any)}
                      >
                        <View style={styles.searchResultAvatar}>
                          {org.avatar_url
                            ? <Image source={{ uri: org.avatar_url }} style={styles.searchResultAvatarImg} />
                            : <Text style={styles.searchResultAvatarInitial}>{initials}</Text>}
                        </View>
                        <View style={styles.searchResultBody}>
                          <Text style={styles.searchResultName} numberOfLines={1}>{name}</Text>
                          {org.city ? <Text style={styles.searchResultMeta} numberOfLines={1}>{org.city}</Text> : null}
                        </View>
                        <View style={[styles.searchResultBadge, styles.searchResultBadgeOrganizer]}>
                          <Text style={styles.searchResultBadgeText}>Organizer</Text>
                        </View>
                      </TouchableOpacity>
                    )
                  })}
                  {comResults.map((com) => {
                    const name = locale === 'ar' && com.name_ar ? com.name_ar : com.name
                    const initials = name.slice(0, 2).toUpperCase()
                    return (
                      <TouchableOpacity
                        key={com.id}
                        style={styles.searchResultRow}
                        activeOpacity={0.75}
                        onPress={() => router.push(`/communities/${com.slug}` as any)}
                      >
                        <View style={[styles.searchResultAvatar, styles.searchResultAvatarCommunity]}>
                          <Text style={styles.searchResultAvatarInitial}>{initials}</Text>
                        </View>
                        <View style={styles.searchResultBody}>
                          <Text style={styles.searchResultName} numberOfLines={1}>{name}</Text>
                          <Text style={styles.searchResultMeta}>{com.level} · {com.member_count.toLocaleString()} members</Text>
                        </View>
                        <View style={[styles.searchResultBadge, styles.searchResultBadgeCommunity]}>
                          <Text style={styles.searchResultBadgeText}>Community</Text>
                        </View>
                      </TouchableOpacity>
                    )
                  })}
                </View>
              )
              : showDiscoveryHeader
              ? (
                <View>
                  {communitySlug && (
                    <MixedDiscoveryRail
                      title="Inside This Community"
                      subtitle="Community-tagged events and live happenings gathered in one place."
                      items={filteredCommunityItems}
                      savedIds={savedIds}
                      onSaveChange={handleSaveChange}
                      onToggleHappeningRsvp={toggleDiscoveryHappeningRsvp}
                      onToggleHappeningReact={toggleDiscoveryHappeningReact}
                      onOpenHappeningComments={setSelectedHappening}
                      accent="community"
                      forceShow
                      emptyTitle="No activity in this community yet"
                      emptyDescription="The feed is still filtered to this community. Check back soon for new events or spontaneous happenings."
                    />
                  )}

                  {nearMe && (
                    <MixedDiscoveryRail
                      title="Happenings Near You"
                      subtitle={`Within ${radiusKm} km of your location`}
                      items={nearbyHappeningItems}
                      savedIds={savedIds}
                      onSaveChange={handleSaveChange}
                      onToggleHappeningRsvp={toggleDiscoveryHappeningRsvp}
                      onToggleHappeningReact={toggleDiscoveryHappeningReact}
                      onOpenHappeningComments={setSelectedHappening}
                      accent="active"
                      forceShow
                      emptyTitle="No nearby happenings right now"
                      emptyDescription="We still filtered the events feed around you. Try widening the radius to discover more live community activity."
                    />
                  )}

                  {/* Discover communities nudge — shown when user has < 3 communities */}
                  {/* Featured Events — skeleton while loading, real rail once resolved */}
                  {showRecommendationRails && (
                    featuredLoading
                      ? <RailSkeleton variant="featured" />
                      : featuredEvents.length > 0 && (
                          <FeaturedCarousel
                            events={featuredEvents}
                            savedIds={savedIds}
                            onSaveChange={handleSaveChange}
                          />
                        )
                  )}

                  {/* Hot Offers — time-sensitive deals */}
                  {showRecommendationRails && (
                    <HotOffersRail events={hotOfferEvents} />
                  )}

                  {/* Saved Events */}
                  {showRecommendationRails && user && (
                    <SavedEventsRail
                      events={savedEventsList}
                      onSeeAll={() => router.push('/saved' as any)}
                    />
                  )}

                  {showRecommendationRails && user && joinedCommunities.length < 3 && suggestedCommunities.length > 0 && (
                    <View style={styles.discoverSection}>
                      <View style={styles.discoverHeader}>
                        <Text style={styles.discoverTitle}>🏘 Discover Your Communities</Text>
                        <Text style={styles.discoverSub}>Join micro & interest communities to personalise your feed</Text>
                      </View>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: Spacing.lg, gap: Spacing.sm }}>
                        {suggestedCommunities.map((c) => {
                          const name = locale === 'ar' && c.name_ar ? c.name_ar : c.name
                          const joining = joiningSlug === c.slug
                          return (
                            <View key={c.id} style={styles.discoverCard}>
                              <TouchableOpacity onPress={() => router.push(`/communities/${c.slug}` as any)} activeOpacity={0.85}>
                                <Text style={styles.discoverCardName} numberOfLines={1}>{name}</Text>
                                <Text style={styles.discoverCardMeta}>{c.level} · {c.member_count.toLocaleString()} members</Text>
                              </TouchableOpacity>
                              <TouchableOpacity
                                style={[styles.discoverJoinBtn, joining && { opacity: 0.6 }]}
                                onPress={() => handleJoinSuggested(c.slug)}
                                disabled={joining}
                              >
                                <Text style={styles.discoverJoinText}>{joining ? '...' : 'Join'}</Text>
                              </TouchableOpacity>
                            </View>
                          )
                        })}
                        <TouchableOpacity style={styles.discoverExploreCard} onPress={() => router.push('/communities' as any)}>
                          <Text style={styles.discoverExploreIcon}>→</Text>
                          <Text style={styles.discoverExploreTxt}>Explore all</Text>
                        </TouchableOpacity>
                      </ScrollView>
                    </View>
                  )}

                  {/* Active Now — communities with live happenings */}
                  {showRecommendationRails && (activeCommunities.length > 0 || activeNowItems.length > 0) && (
                    <>
                      {activeCommunities.length > 0 && (
                        <View style={styles.activeNowSection}>
                          <View style={styles.activeNowHeader}>
                            <View style={styles.activeNowDot} />
                            <Text style={styles.activeNowTitle}>Active Now</Text>
                            <Text style={styles.activeNowSub}>Communities with live happenings</Text>
                          </View>
                          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: Spacing.lg, gap: Spacing.md }}>
                            {activeCommunities.map((c) => {
                              const name = locale === 'ar' && c.name_ar ? c.name_ar : c.name
                              return (
                                <TouchableOpacity
                                  key={c.id}
                                  onPress={() => router.push(`/communities/${c.slug}` as any)}
                                  style={styles.activeNowCard}
                                  activeOpacity={0.85}
                                >
                                  <View style={styles.activeNowPulse}>
                                    <View style={[styles.activeNowAvatar, c.is_member && styles.activeNowAvatarMember]}>
                                      <Text style={styles.activeNowAvatarText}>{name.slice(0, 1).toUpperCase()}</Text>
                                    </View>
                                  </View>
                                  <Text style={styles.activeNowName} numberOfLines={1}>{name}</Text>
                                  <Text style={styles.activeNowCount}>{c.happening_count} happening{c.happening_count !== 1 ? 's' : ''}</Text>
                                </TouchableOpacity>
                              )
                            })}
                          </ScrollView>
                        </View>
                      )}

                      {activeNowItems.length > 0 && (
                        <MixedDiscoveryRail
                          title="Happening Now"
                          subtitle="Live community activity you can jump into right away."
                          items={activeNowItems}
                          savedIds={savedIds}
                          onSaveChange={handleSaveChange}
                          onToggleHappeningRsvp={toggleDiscoveryHappeningRsvp}
                          onToggleHappeningReact={toggleDiscoveryHappeningReact}
                          onOpenHappeningComments={setSelectedHappening}
                          accent="active"
                        />
                      )}
                    </>
                  )}

                  {showRecommendationRails && (
                    <MixedDiscoveryRail
                      title="Near You This Weekend"
                      subtitle={
                        weekendCoords
                          ? `Within ${weekendRadiusKm} km · ${getWeekendLabel()}`
                          : `Use your location · ${getWeekendLabel()}`
                      }
                      items={weekendDiscoveryItems}
                      savedIds={savedIds}
                      onSaveChange={handleSaveChange}
                      onToggleHappeningRsvp={toggleDiscoveryHappeningRsvp}
                      onToggleHappeningReact={toggleDiscoveryHappeningReact}
                      onOpenHappeningComments={setSelectedHappening}
                      accent="weekend"
                      radiusKm={weekendCoords ? weekendRadiusKm : undefined}
                      onRadiusChange={weekendCoords ? setWeekendRadiusKm : undefined}
                      emptyTitle={weekendCoords ? 'No weekend activity nearby yet' : 'Turn on location'}
                      emptyDescription={
                        weekendCoords
                          ? 'Try widening the radius to discover more events and happenings around you this weekend.'
                          : 'Allow location access to see events and happenings near you this weekend.'
                      }
                      emptyActionLabel={weekendCoords ? undefined : 'Enable location'}
                      onEmptyAction={weekendCoords ? undefined : requestWeekendLocation}
                      forceShow
                    />
                  )}

                  {/* Upcoming Events — heading + category chips */}
                  {showRecommendationRails && (
                    <View>
                      <View style={styles.upcomingHeader}>
                        <Text style={styles.upcomingTitle}>Upcoming Events</Text>
                        <TouchableOpacity onPress={() => router.push('/events' as any)}>
                          <Text style={styles.upcomingSeeAll}>See all →</Text>
                        </TouchableOpacity>
                      </View>
                      {categories.length > 0 && (
                        <ScrollView
                          horizontal
                          showsHorizontalScrollIndicator={false}
                          contentContainerStyle={styles.categoryChipsContent}
                          style={styles.categoryChipsScroll}
                        >
                          <TouchableOpacity
                            onPress={() => setCategoryId(null)}
                            style={[styles.chip, !categoryId && styles.chipActive]}
                          >
                            <Text style={[styles.chipText, !categoryId && styles.chipTextActive]}>
                              {t('events.all')}
                            </Text>
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
                      )}
                    </View>
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
              {debouncedSearch.length > 0 && (
                <View style={styles.eventSearchBadgeRow}>
                  <View style={[styles.searchResultBadge, styles.searchResultBadgeEvent]}>
                    <Text style={styles.searchResultBadgeText}>Event</Text>
                  </View>
                </View>
              )}
              <EventCard event={item} isSaved={savedIds.has(item.id)} onSaveChange={handleSaveChange} />
            </View>
          )}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.brand[500]} />}
          ListFooterComponent={
            isDefaultFeed && events.length > 0 ? (
              <View>
                <TouchableOpacity
                  style={styles.seeAllEventsBtn}
                  onPress={() => router.push('/events' as any)}
                  activeOpacity={0.82}
                >
                  <Text style={styles.seeAllEventsBtnText}>See All Events</Text>
                  <Ionicons name="arrow-forward" size={16} color={Colors.brand[600]} />
                </TouchableOpacity>
                {user && joinedCommunities.length > 0 && (
                  <YourCommunitiesSection
                    communities={joinedCommunities}
                    onSeeAll={() => router.push('/communities' as any)}
                  />
                )}
              </View>
            ) : null
          }
          ListEmptyComponent={
            nearMe
              ? <EmptyState icon="📍" title="No events nearby" description={`No events found within ${radiusKm} km of your location`} />
              : <EmptyState icon="📭" title={t('events.empty')} description={t('events.try_filters')} />
          }
        />
      )}

      <HappeningCommentsSheet
        visible={!!selectedHappening}
        happening={selectedHappening}
        currentUserId={user?.id ?? null}
        onClose={() => setSelectedHappening(null)}
      />
    </View>
  )
}

const WEEKEND_RADIUS_OPTIONS = [5, 10, 25, 50, 100]

// ── Constants ─────────────────────────────────────────────────────────────────

const CAROUSEL_DURATION = 4000
const SCREEN_WIDTH = Dimensions.get('window').width
const CARD_WIDTH = SCREEN_WIDTH - 2 * Spacing.lg

const FEATURED_CATEGORY_EMOJI: Record<string, string> = {
  sports: '⚽', art: '🎨', music: '🎵', tech: '💻', food: '🍽️',
  community: '🤝', education: '📚', health: '💪', business: '💼', entertainment: '🎭',
}

// ── Featured Carousel ─────────────────────────────────────────────────────────

function FeaturedCarousel({
  events,
  savedIds,
  onSaveChange,
}: {
  events: EventWithOrganizer[]
  savedIds: Set<string>
  onSaveChange: (id: string, saved: boolean) => void
}) {
  const scrollRef = useRef<ScrollView>(null)
  const [activeIdx, setActiveIdx] = useState(0)
  const progressAnim = useRef(new Animated.Value(0)).current
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (events.length <= 1) return
    progressAnim.setValue(0)
    const anim = Animated.timing(progressAnim, {
      toValue: 1,
      duration: CAROUSEL_DURATION,
      useNativeDriver: false,
    })
    anim.start()
    timerRef.current = setTimeout(() => {
      const next = (activeIdx + 1) % events.length
      scrollRef.current?.scrollTo({ x: next * CARD_WIDTH, animated: true })
      setActiveIdx(next)
    }, CAROUSEL_DURATION)
    return () => {
      anim.stop()
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [activeIdx, events.length])

  function onScroll(e: { nativeEvent: { contentOffset: { x: number } } }) {
    const idx = Math.round(e.nativeEvent.contentOffset.x / CARD_WIDTH)
    if (idx !== activeIdx && idx >= 0 && idx < events.length) setActiveIdx(idx)
  }

  if (events.length === 0) return null

  const progressWidth = progressAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] })

  return (
    <View style={styles.carouselWrapper}>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScroll}
        scrollEventThrottle={16}
      >
        {events.map((ev) => (
          <View key={ev.id} style={{ width: CARD_WIDTH }}>
            <FeaturedCard event={ev} isSaved={savedIds.has(ev.id)} onSaveChange={onSaveChange} flat />
          </View>
        ))}
      </ScrollView>
      {events.length > 1 && (
        <View style={styles.carouselDotRow}>
          {events.map((_, i) => (
            <View key={i} style={[styles.carouselDot, i === activeIdx && styles.carouselDotActive]} />
          ))}
        </View>
      )}
      {events.length > 1 && (
        <View style={styles.carouselProgressTrack}>
          <Animated.View style={[styles.carouselProgressFill, { width: progressWidth }]} />
        </View>
      )}
    </View>
  )
}

// ── Featured Card ─────────────────────────────────────────────────────────────

function FeaturedCard({
  event, isSaved, onSaveChange, flat = false,
}: {
  event: EventWithOrganizer
  isSaved: boolean
  onSaveChange: (id: string, saved: boolean) => void
  flat?: boolean
}) {
  const router = useRouter()
  const { locale } = useLocale()
  const { user } = useAuth()
  const [saved, setSaved] = useState(isSaved)
  useEffect(() => { setSaved(isSaved) }, [isSaved])

  const title = locale === 'ar' && event.title_ar ? event.title_ar : event.title
  const icon = FEATURED_CATEGORY_EMOJI[event.category?.name_en?.toLowerCase() ?? ''] ?? '📅'
  const spotsLeft = event.capacity ? event.capacity - event.bookings_count : null
  const spotsPercent = event.capacity ? Math.min((event.bookings_count / event.capacity) * 100, 100) : null
  const hasHotOffer = (event.ticket_types ?? []).some(
    (tt) => tt.is_hot_offer && !!tt.hot_offer_ends_at && new Date(tt.hot_offer_ends_at) > new Date(),
  )
  let dateLabel = ''
  try {
    dateLabel = new Date(event.start_at).toLocaleDateString(locale === 'ar' ? 'ar-SA' : 'en-US', {
      weekday: 'short', month: 'short', day: 'numeric',
    })
  } catch { /* noop */ }

  async function toggleSave() {
    if (!user) return
    const next = !saved
    setSaved(next)
    if (next) {
      const { error } = await apiPost(`/api/events/${event.id}/save`, {})
      if (error) { setSaved(false); return }
      onSaveChange(event.id, true)
    } else {
      const { error } = await apiDelete(`/api/events/${event.id}/save`)
      if (error) { setSaved(true); return }
      onSaveChange(event.id, false)
    }
  }

  const flatOverride = flat ? { borderRadius: 0, marginBottom: 0, shadowOpacity: 0, elevation: 0 } : undefined

  return (
    <TouchableOpacity
      style={[styles.featuredCard, flatOverride]}
      activeOpacity={0.88}
      onPress={() => router.push(`/events/${event.id}`)}
    >
      <View style={styles.featuredCover}>
        {event.cover_image_url
          ? <Image source={{ uri: event.cover_image_url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          : <View style={styles.featuredCoverPlaceholder}><Text style={styles.featuredCoverEmoji}>{icon}</Text></View>
        }
        <View style={styles.featuredCoverScrim} />
        <View style={styles.featuredBadge}>
          <Text style={styles.featuredBadgeText}>⭐ FEATURED</Text>
        </View>
        {user && (
          <TouchableOpacity style={styles.featuredHeart} onPress={toggleSave} hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}>
            <Text style={{ fontSize: 16 }}>{saved ? '❤️' : '🤍'}</Text>
          </TouchableOpacity>
        )}
      </View>
      <View style={styles.featuredBody}>
        <View style={styles.featuredTagsRow}>
          {event.is_free && <Badge label="Free" variant="green" />}
          {hasHotOffer && <Badge label="🔥 Hot Offer" variant="orange" />}
          {event.category && (
            <Badge
              label={locale === 'ar' && event.category.name_ar ? event.category.name_ar : event.category.name_en}
              variant="brand"
            />
          )}
        </View>
        <Text style={styles.featuredTitle} numberOfLines={2}>{title}</Text>
        <View style={styles.featuredMeta}>
          {dateLabel ? <Text style={styles.featuredMetaText}>📅 {dateLabel}</Text> : null}
          {(event.city || event.venue_name) ? (
            <Text style={styles.featuredMetaText} numberOfLines={1}>
              📍 {event.city}{event.venue_name ? ` · ${event.venue_name}` : ''}
            </Text>
          ) : null}
        </View>
        <View style={styles.featuredFooter}>
          <View style={{ flex: 1 }}>
            {spotsLeft !== null && spotsLeft >= 0 && (
              <Text style={styles.featuredSpotsText}>
                {event.bookings_count.toLocaleString()} going{spotsLeft > 0 ? ` · ${spotsLeft} spots left` : ' · Full'}
              </Text>
            )}
          </View>
          <View style={[styles.featuredPricePill, event.is_free && styles.featuredPricePillFree]}>
            <Text style={[styles.featuredPriceText, event.is_free && styles.featuredPriceTextFree]}>
              {event.is_free ? 'Free' : formatCurrency(event.price ?? 0, event.currency, locale)}
            </Text>
          </View>
        </View>
        {spotsPercent !== null && (
          <View style={styles.featuredProgressTrack}>
            <View style={[styles.featuredProgressFill, { width: `${spotsPercent}%` }]} />
          </View>
        )}
      </View>
    </TouchableOpacity>
  )
}

// ── Hot Offers rail ───────────────────────────────────────────────────────────

function HotOfferCard({ event }: { event: EventWithOrganizer }) {
  const router = useRouter()
  const { locale } = useLocale()
  const title = locale === 'ar' && event.title_ar ? event.title_ar : event.title
  const now = new Date()
  const hotTicket = (event.ticket_types ?? []).find(
    (tt) => tt.is_hot_offer && !!tt.hot_offer_ends_at && new Date(tt.hot_offer_ends_at) > now,
  )
  const discountPct = hotTicket?.hot_offer_price != null && hotTicket.price && hotTicket.price > 0
    ? Math.round((1 - hotTicket.hot_offer_price / hotTicket.price) * 100)
    : null
  const icon = FEATURED_CATEGORY_EMOJI[event.category?.name_en?.toLowerCase() ?? ''] ?? '📅'

  return (
    <TouchableOpacity
      style={styles.hotOfferCard}
      activeOpacity={0.85}
      onPress={() => router.push(`/events/${event.id}`)}
    >
      <View style={styles.hotOfferCover}>
        {event.cover_image_url
          ? <Image source={{ uri: event.cover_image_url }} style={[StyleSheet.absoluteFill, { opacity: 0.72 }]} resizeMode="cover" />
          : <View style={styles.hotOfferCoverPlaceholder}><Text style={{ fontSize: 32 }}>{icon}</Text></View>
        }
        {discountPct !== null && (
          <View style={styles.hotOfferBadge}>
            <Text style={styles.hotOfferBadgeText}>🔥 {discountPct}% OFF</Text>
          </View>
        )}
      </View>
      <View style={styles.hotOfferBody}>
        <Text style={styles.hotOfferTitle} numberOfLines={2}>{title}</Text>
        <View style={styles.hotOfferPriceRow}>
          {hotTicket?.hot_offer_price != null && (
            <Text style={styles.hotOfferPrice}>
              {formatCurrency(hotTicket.hot_offer_price, event.currency, locale)}
            </Text>
          )}
          {hotTicket?.price != null && hotTicket.price > 0 && (
            <Text style={styles.hotOfferOriginalPrice}>
              {formatCurrency(hotTicket.price, event.currency, locale)}
            </Text>
          )}
        </View>
      </View>
    </TouchableOpacity>
  )
}

function HotOffersRail({ events }: { events: EventWithOrganizer[] }) {
  if (events.length === 0) return null
  return (
    <View style={styles.hotRailSection}>
      <View style={styles.hotRailHeader}>
        <View style={styles.hotRailIconBox}>
          <Text style={{ fontSize: 18 }}>🔥</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.hotRailEyebrow}>Limited time</Text>
          <Text style={styles.hotRailTitle}>Hot Offers</Text>
        </View>
        <View style={styles.hotRailBadge}>
          <Text style={styles.hotRailBadgeText}>{events.length} deal{events.length !== 1 ? 's' : ''}</Text>
        </View>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hotRailScroller}>
        {events.map((ev) => <HotOfferCard key={ev.id} event={ev} />)}
      </ScrollView>
    </View>
  )
}

// ── Saved Events Rail ─────────────────────────────────────────────────────────

function SavedEventsRail({ events, onSeeAll }: { events: EventWithOrganizer[]; onSeeAll?: () => void }) {
  const router = useRouter()
  const { locale } = useLocale()
  if (events.length === 0) return null
  return (
    <View style={styles.savedRailSection}>
      <View style={styles.savedRailHeader}>
        <View style={styles.savedRailTitleRow}>
          <Text style={styles.savedRailTitle}>❤️ Saved</Text>
          <View style={styles.savedCountBadge}>
            <Text style={styles.savedCountText}>{events.length}</Text>
          </View>
        </View>
        {onSeeAll && (
          <TouchableOpacity onPress={onSeeAll} hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}>
            <Text style={styles.savedRailSeeAll}>See all →</Text>
          </TouchableOpacity>
        )}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.savedRailScroller}>
        {events.map((ev) => {
          const title = locale === 'ar' && ev.title_ar ? ev.title_ar : ev.title
          const icon = FEATURED_CATEGORY_EMOJI[ev.category?.name_en?.toLowerCase() ?? ''] ?? '📅'
          return (
            <TouchableOpacity
              key={ev.id}
              style={styles.savedCard}
              activeOpacity={0.82}
              onPress={() => router.push(`/events/${ev.id}`)}
            >
              <View style={styles.savedCardCover}>
                {ev.cover_image_url
                  ? <Image source={{ uri: ev.cover_image_url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                  : <View style={styles.savedCardPlaceholder}><Text style={{ fontSize: 28 }}>{icon}</Text></View>
                }
              </View>
              <View style={styles.savedCardBody}>
                <Text style={styles.savedCardTitle} numberOfLines={2}>{title}</Text>
                <Text style={styles.savedCardMeta} numberOfLines={1}>📍 {ev.city}</Text>
              </View>
            </TouchableOpacity>
          )
        })}
      </ScrollView>
    </View>
  )
}

// ── Your Communities Section ──────────────────────────────────────────────────

function YourCommunitiesSection({ communities, onSeeAll }: { communities: JoinedCommunity[]; onSeeAll: () => void }) {
  const router = useRouter()
  const { locale } = useLocale()
  return (
    <View style={styles.yourCommSection}>
      <View style={styles.yourCommHeader}>
        <Text style={styles.yourCommTitle}>Your Communities</Text>
        <TouchableOpacity onPress={onSeeAll} hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}>
          <Text style={styles.yourCommSeeAll}>See all →</Text>
        </TouchableOpacity>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.yourCommScroll}>
        {communities.map((c) => {
          const name = locale === 'ar' && c.name_ar ? c.name_ar : c.name
          return (
            <TouchableOpacity
              key={c.id}
              style={styles.yourCommCard}
              onPress={() => router.push(`/communities/${c.slug}` as any)}
              activeOpacity={0.8}
            >
              <View style={styles.yourCommAvatar}>
                <Text style={styles.yourCommAvatarText}>{name.slice(0, 1).toUpperCase()}</Text>
              </View>
              <Text style={styles.yourCommName} numberOfLines={2}>{name}</Text>
              <Text style={styles.yourCommLevel}>{c.level}</Text>
            </TouchableOpacity>
          )
        })}
        <TouchableOpacity style={styles.yourCommFindCard} onPress={onSeeAll} activeOpacity={0.8}>
          <View style={styles.yourCommFindIcon}>
            <Ionicons name="add" size={20} color={Colors.brand[500]} />
          </View>
          <Text style={styles.yourCommFindText}>Find{'\n'}communities</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  )
}

// ── Recommendation rail ───────────────────────────────────────────────────────

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
  emptyTitle,
  emptyDescription,
  emptyActionLabel,
  onEmptyAction,
  forceShow = false,
}: {
  title: string
  subtitle: string
  events: EventWithOrganizer[]
  savedIds: Set<string>
  onSaveChange: (id: string, saved: boolean) => void
  urgency?: boolean
  accent?: 'weekend' | 'community'
  radiusKm?: number
  onRadiusChange?: (km: number) => void
  emptyTitle?: string
  emptyDescription?: string
  emptyActionLabel?: string
  onEmptyAction?: () => void
  forceShow?: boolean
}) {
  if (!forceShow && events.length === 0) return null

  return (
    <View style={[styles.railSection, urgency && styles.railSectionUrgent, accent === 'weekend' && styles.railSectionWeekend, accent === 'community' && styles.railSectionCommunity]}>
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
        horizontal={events.length > 0}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[styles.railScroller, events.length === 0 && styles.railScrollerEmpty]}
      >
        {events.length > 0 ? (
          events.map((event) => (
            <EventCard
              key={event.id}
              event={event}
              isSaved={savedIds.has(event.id)}
              onSaveChange={onSaveChange}
              variant="rail"
            />
          ))
        ) : (
          <View style={styles.railEmptyCard}>
            <Text style={styles.railEmptyTitle}>{emptyTitle ?? 'Nothing here yet'}</Text>
            {emptyDescription ? <Text style={styles.railEmptyDescription}>{emptyDescription}</Text> : null}
            {emptyActionLabel && onEmptyAction ? (
              <TouchableOpacity style={styles.railEmptyButton} onPress={onEmptyAction}>
                <Text style={styles.railEmptyButtonText}>{emptyActionLabel}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        )}
      </ScrollView>
    </View>
  )
}

function MixedDiscoveryRail({
  title,
  subtitle,
  items,
  savedIds,
  onSaveChange,
  onToggleHappeningRsvp,
  onToggleHappeningReact,
  onOpenHappeningComments,
  accent,
  radiusKm,
  onRadiusChange,
  emptyTitle,
  emptyDescription,
  emptyActionLabel,
  onEmptyAction,
  forceShow = false,
}: {
  title: string
  subtitle: string
  items: DiscoveryRailItem[]
  savedIds: Set<string>
  onSaveChange: (id: string, saved: boolean) => void
  onToggleHappeningRsvp: (happening: HappeningDiscoveryItem) => void
  onToggleHappeningReact: (happening: HappeningDiscoveryItem) => void
  onOpenHappeningComments?: (happening: HappeningDiscoveryItem) => void
  accent?: 'weekend' | 'community' | 'active'
  radiusKm?: number
  onRadiusChange?: (km: number) => void
  emptyTitle?: string
  emptyDescription?: string
  emptyActionLabel?: string
  onEmptyAction?: () => void
  forceShow?: boolean
}) {
  if (!forceShow && items.length === 0) return null

  return (
    <View style={[styles.railSection, accent === 'weekend' && styles.railSectionWeekend, accent === 'community' && styles.railSectionCommunity, accent === 'active' && styles.railSectionActive]}>
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
        horizontal={items.length > 0}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[styles.railScroller, items.length === 0 && styles.railScrollerEmpty]}
      >
        {items.length > 0 ? (
          items.map((item) => (
            item.kind === 'event' ? (
              <EventCard
                key={item.id}
                event={item.event}
                isSaved={savedIds.has(item.event.id)}
                onSaveChange={onSaveChange}
                variant="rail"
              />
            ) : (
              <HappeningDiscoveryCard
                key={item.id}
                happening={item.happening}
                variant="rail"
                onToggleRsvp={onToggleHappeningRsvp}
                onToggleReact={onToggleHappeningReact}
                onOpenComments={onOpenHappeningComments}
              />
            )
          ))
        ) : (
          <View style={styles.railEmptyCard}>
            <Text style={styles.railEmptyTitle}>{emptyTitle ?? 'Nothing here yet'}</Text>
            {emptyDescription ? <Text style={styles.railEmptyDescription}>{emptyDescription}</Text> : null}
            {emptyActionLabel && onEmptyAction ? (
              <TouchableOpacity style={styles.railEmptyButton} onPress={onEmptyAction}>
                <Text style={styles.railEmptyButtonText}>{emptyActionLabel}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        )}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.gray[50] },
  searchRow: { backgroundColor: Colors.white, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.gray[100] },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: Colors.gray[100], borderRadius: 100, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 2, borderWidth: 1, borderColor: Colors.gray[200] },
  searchInput: { flex: 1, fontSize: FontSize.base, color: Colors.gray[900] },
  searchActionBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.gray[200],
  },
  searchActionBtnActive: {
    backgroundColor: Colors.green.light,
    borderColor: Colors.green.DEFAULT,
  },
  categoryChipsScroll: { marginBottom: Spacing.md },
  categoryChipsContent: { gap: Spacing.sm },
  chip: { flexShrink: 0, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm - 1, borderRadius: Radius.full, backgroundColor: Colors.gray[100], borderWidth: 1, borderColor: Colors.gray[200] },
  chipActive: { backgroundColor: Colors.brand[500], borderColor: Colors.brand[500] },
  chipText: { fontSize: FontSize.sm, color: Colors.gray[600], fontWeight: FontWeight.medium },
  chipTextActive: { color: Colors.white },
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
    borderWidth: 1,
    borderColor: Colors.gray[100],
  },
  railSectionUrgent: {
    backgroundColor: '#fffbf5',
    borderColor: '#fde8c8',
  },
  railSectionWeekend: {
    backgroundColor: '#f7fdf9',
    borderColor: '#c6f0d8',
  },
  railSectionActive: {
    backgroundColor: '#f5fdfb',
    borderColor: '#b2f0e8',
  },
  railHeader: {
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  railTitle: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: '#1a0d04',
    letterSpacing: -0.2,
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
  railScrollerEmpty: {
    paddingRight: Spacing.lg,
  },
  railEmptyCard: {
    width: '100%',
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.gray[200],
    padding: Spacing.lg,
  },
  railEmptyTitle: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.semibold,
    color: Colors.gray[900],
  },
  railEmptyDescription: {
    marginTop: Spacing.xs,
    fontSize: FontSize.sm,
    color: Colors.gray[500],
    lineHeight: 20,
  },
  railEmptyButton: {
    marginTop: Spacing.md,
    alignSelf: 'flex-start',
    backgroundColor: Colors.brand[500],
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  railEmptyButtonText: {
    color: Colors.white,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
  },

  radiusRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.brand[50], paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.brand[100], gap: Spacing.xs },
  radiusLabel: { fontSize: FontSize.xs, color: Colors.brand[600], fontWeight: FontWeight.medium, marginRight: Spacing.xs },
  radiusChip: { paddingHorizontal: Spacing.sm + 2, paddingVertical: 4, borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.brand[200], backgroundColor: Colors.white },
  radiusChipActive: { backgroundColor: Colors.brand[500], borderColor: Colors.brand[500] },
  radiusChipText: { fontSize: FontSize.xs, color: Colors.brand[600] },
  radiusChipTextActive: { color: Colors.white, fontWeight: FontWeight.semibold },

  // Active Now rail
  activeNowSection: { paddingBottom: Spacing.lg, borderBottomWidth: 1, borderBottomColor: Colors.gray[100], marginBottom: Spacing.sm },
  activeNowHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md },
  activeNowDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#22c55e' },
  activeNowTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.gray[900] },
  activeNowSub: { fontSize: FontSize.xs, color: Colors.gray[400], flex: 1 },
  activeNowCard: { alignItems: 'center', width: 72 },
  activeNowPulse: { marginBottom: Spacing.sm },
  activeNowAvatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: Colors.brand[100], alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: Colors.gray[200] },
  activeNowAvatarMember: { borderColor: '#22c55e', borderWidth: 2.5 },
  activeNowAvatarText: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.brand[700] },
  activeNowName: { fontSize: 11, fontWeight: FontWeight.semibold, color: Colors.gray[800], textAlign: 'center' },
  activeNowCount: { fontSize: 10, color: Colors.gray[400], textAlign: 'center', marginTop: 1 },
  activeCommunityBanner: {
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.sm,
    marginBottom: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.xl,
    backgroundColor: Colors.brand[50],
    borderWidth: 1,
    borderColor: Colors.brand[100],
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  activeCommunityLabel: { fontSize: FontSize.xs, color: Colors.brand[600], fontWeight: FontWeight.semibold, textTransform: 'uppercase' },
  activeCommunityName: { fontSize: FontSize.sm, color: Colors.gray[900], fontWeight: FontWeight.semibold, marginTop: 2 },
  activeCommunityClear: { paddingHorizontal: Spacing.sm, paddingVertical: Spacing.xs, borderRadius: Radius.full, backgroundColor: Colors.white },
  activeCommunityClearText: { fontSize: FontSize.xs, color: Colors.brand[700], fontWeight: FontWeight.semibold },

  // City indicator bar
  cityBar: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, paddingHorizontal: Spacing.lg, paddingVertical: 6, backgroundColor: Colors.brand[50], borderBottomWidth: 1, borderBottomColor: Colors.brand[100] },
  cityBarText: { flex: 1, fontSize: FontSize.xs, color: Colors.gray[600] },
  cityBarCity: { fontWeight: FontWeight.semibold, color: Colors.gray[900] },
  cityBarChange: { fontSize: FontSize.xs, color: Colors.brand[600], fontWeight: FontWeight.semibold },

  // Community events rail accent
  railSectionCommunity: { backgroundColor: '#eff6ff' },

  // Discover communities nudge
  discoverSection: { paddingBottom: Spacing.lg, borderBottomWidth: 1, borderBottomColor: Colors.gray[100], marginBottom: Spacing.sm },
  discoverHeader: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md },
  discoverTitle: { fontSize: FontSize.base, fontWeight: FontWeight.bold, color: '#1a0d04' },
  discoverSub: { fontSize: FontSize.xs, color: Colors.gray[400], marginTop: 2 },
  discoverCard: {
    width: 150,
    backgroundColor: 'rgba(245,158,11,0.04)',
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.20)',
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  discoverCardName: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.gray[900] },
  discoverCardMeta: { fontSize: 11, color: Colors.gray[400] },
  discoverJoinBtn: { alignSelf: 'flex-start', backgroundColor: Colors.brand[600], borderRadius: Radius.full, paddingHorizontal: Spacing.md, paddingVertical: 5 },
  discoverJoinText: { fontSize: FontSize.xs, color: Colors.white, fontWeight: FontWeight.semibold },
  discoverExploreCard: { width: 80, alignItems: 'center', justifyContent: 'center', gap: Spacing.xs },
  discoverExploreIcon: { fontSize: 22, color: Colors.brand[400] },
  discoverExploreTxt: { fontSize: FontSize.xs, color: Colors.brand[600], fontWeight: FontWeight.medium },

  // Search results (organizers + communities)
  searchResultsSection: { backgroundColor: Colors.white, paddingBottom: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.gray[100], marginBottom: Spacing.sm },
  searchResultsSectionLabel: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.gray[400], textTransform: 'uppercase', letterSpacing: 0.6, paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, paddingBottom: Spacing.sm },
  searchResultRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, gap: Spacing.sm },
  searchResultAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.brand[100], alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  searchResultAvatarCommunity: { backgroundColor: Colors.green.light },
  searchResultAvatarImg: { width: 40, height: 40, borderRadius: 20 },
  searchResultAvatarInitial: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.brand[700] },
  searchResultBody: { flex: 1 },
  searchResultName: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.gray[900] },
  searchResultMeta: { fontSize: FontSize.xs, color: Colors.gray[400], marginTop: 1 },
  searchResultBadge: { paddingHorizontal: Spacing.sm, paddingVertical: 3, borderRadius: Radius.full },
  searchResultBadgeOrganizer: { backgroundColor: Colors.blue.light },
  searchResultBadgeCommunity: { backgroundColor: Colors.green.light },
  searchResultBadgeEvent: { backgroundColor: '#fef3c7' },
  searchResultBadgeText: { fontSize: 11, fontWeight: FontWeight.semibold, color: Colors.gray[700] },
  eventSearchBadgeRow: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm },

  // ── Upcoming heading ────────────────────────────────────────────────────────
  upcomingHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: Spacing.lg, marginBottom: Spacing.sm,
  },
  upcomingTitle: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.gray[900], letterSpacing: -0.3 },
  upcomingSeeAll: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.brand[600] },

  // ── See All Events button ────────────────────────────────────────────────────
  seeAllEventsBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.xs,
    marginVertical: Spacing.md, marginHorizontal: Spacing.lg,
    paddingVertical: Spacing.md, borderRadius: Radius.lg,
    borderWidth: 1.5, borderColor: Colors.brand[300], backgroundColor: Colors.brand[50],
  },
  seeAllEventsBtnText: { fontSize: FontSize.base, fontWeight: FontWeight.semibold, color: Colors.brand[600] },

  // ── Featured Card ────────────────────────────────────────────────────────────
  featuredCard: {
    backgroundColor: Colors.white, borderRadius: Radius.xl, overflow: 'hidden',
    marginBottom: Spacing.lg, shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 10, elevation: 3,
  },
  featuredCover: { height: 200, backgroundColor: Colors.brand[100], justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  featuredCoverPlaceholder: { ...StyleSheet.absoluteFillObject, backgroundColor: Colors.brand[100], justifyContent: 'center', alignItems: 'center' },
  featuredCoverEmoji: { fontSize: 64 },
  featuredCoverScrim: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 60, backgroundColor: 'transparent' },
  featuredBadge: { position: 'absolute', top: 12, left: 12, backgroundColor: Colors.brand[500], borderRadius: Radius.sm, paddingHorizontal: Spacing.md, paddingVertical: 4 },
  featuredBadgeText: { color: Colors.white, fontSize: FontSize.xs, fontWeight: FontWeight.bold, letterSpacing: 0.5 },
  featuredHeart: { position: 'absolute', top: 12, right: 12, backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: Radius.md, padding: Spacing.sm, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.12, shadowRadius: 6, elevation: 3 },
  featuredBody: { padding: Spacing.lg },
  featuredTagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs, marginBottom: Spacing.sm },
  featuredTitle: { fontSize: FontSize['2xl'], fontWeight: FontWeight.bold, color: Colors.gray[900], letterSpacing: -0.3, lineHeight: 30, marginBottom: Spacing.sm },
  featuredMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md, marginBottom: Spacing.md },
  featuredMetaText: { fontSize: FontSize.sm, color: Colors.gray[500] },
  featuredFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.sm },
  featuredSpotsText: { fontSize: FontSize.xs, color: Colors.gray[400] },
  featuredPricePill: { backgroundColor: Colors.brand[50], borderRadius: Radius.sm, paddingHorizontal: Spacing.md, paddingVertical: 4, borderWidth: 1, borderColor: Colors.brand[200] },
  featuredPricePillFree: { backgroundColor: Colors.green.light, borderColor: Colors.green.DEFAULT },
  featuredPriceText: { fontSize: FontSize.base, fontWeight: FontWeight.bold, color: Colors.brand[700] },
  featuredPriceTextFree: { color: Colors.green.text },
  featuredProgressTrack: { height: 4, backgroundColor: Colors.gray[100], borderRadius: 2, overflow: 'hidden' },
  featuredProgressFill: { height: '100%' as const, backgroundColor: Colors.brand[500], borderRadius: 2 },

  // ── Carousel ────────────────────────────────────────────────────────────────
  carouselWrapper: {
    marginBottom: Spacing.lg, borderRadius: Radius.xl, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 10, elevation: 3,
  },
  carouselDotRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 5, paddingVertical: Spacing.sm, backgroundColor: Colors.white },
  carouselDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.gray[300] },
  carouselDotActive: { width: 18, borderRadius: 3, backgroundColor: Colors.brand[500] },
  carouselProgressTrack: { height: 3, backgroundColor: Colors.gray[100] },
  carouselProgressFill: { height: 3, backgroundColor: Colors.brand[500] },

  // ── Hot Offers rail ──────────────────────────────────────────────────────────
  hotRailSection: {
    marginBottom: Spacing.lg, marginTop: Spacing.xs,
    paddingTop: Spacing.md, paddingBottom: Spacing.lg,
    backgroundColor: '#fff7ed', borderRadius: Radius.xl,
    borderWidth: 1, borderColor: '#fed7aa',
  },
  hotRailHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.lg, marginBottom: Spacing.sm },
  hotRailIconBox: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#ffedd5', justifyContent: 'center', alignItems: 'center' },
  hotRailEyebrow: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, color: '#f97316', textTransform: 'uppercase' as const, letterSpacing: 0.8 },
  hotRailTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: '#c2410c', letterSpacing: -0.3 },
  hotRailBadge: { backgroundColor: '#ffedd5', borderRadius: Radius.full, borderWidth: 1, borderColor: '#fed7aa', paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs },
  hotRailBadgeText: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, color: '#f97316' },
  hotRailScroller: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xs, gap: Spacing.sm },
  hotOfferCard: { width: 192, backgroundColor: Colors.white, borderRadius: Radius.lg, overflow: 'hidden', shadowColor: '#f97316', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.12, shadowRadius: 6, elevation: 4 },
  hotOfferCover: { height: 120, backgroundColor: '#2a1108', justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  hotOfferCoverPlaceholder: { ...StyleSheet.absoluteFillObject, backgroundColor: '#2a1108', justifyContent: 'center', alignItems: 'center' },
  hotOfferBadge: { position: 'absolute', top: 8, left: 8, backgroundColor: '#f97316', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  hotOfferBadgeText: { fontSize: 11, fontWeight: FontWeight.bold, color: '#fff' },
  hotOfferBody: { padding: 10 },
  hotOfferTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.gray[900], lineHeight: 18, marginBottom: 6 },
  hotOfferPriceRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  hotOfferPrice: { fontSize: FontSize.base, fontWeight: FontWeight.bold, color: '#f97316' },
  hotOfferOriginalPrice: { fontSize: FontSize.xs, color: Colors.gray[400], textDecorationLine: 'line-through' as const },

  // ── Saved Events Rail ────────────────────────────────────────────────────────
  savedRailSection: {
    marginBottom: Spacing.lg, marginTop: Spacing.xs,
    paddingTop: Spacing.md, paddingBottom: Spacing.lg,
    backgroundColor: Colors.white, borderRadius: Radius.xl,
    borderWidth: 1, borderColor: '#fde8c8',
  },
  savedRailHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.lg, marginBottom: Spacing.sm },
  savedRailTitleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  savedRailTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.gray[900], letterSpacing: -0.2 },
  savedCountBadge: { backgroundColor: '#fee2e2', borderRadius: Radius.full, paddingHorizontal: Spacing.sm, paddingVertical: 2, borderWidth: 1, borderColor: '#fecaca' },
  savedCountText: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: '#ef4444' },
  savedRailSeeAll: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.brand[600] },
  savedRailScroller: { paddingHorizontal: Spacing.lg, gap: Spacing.sm },
  savedCard: { width: 160, backgroundColor: Colors.white, borderRadius: Radius.lg, overflow: 'hidden', borderWidth: 1, borderColor: Colors.gray[100], shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  savedCardCover: { height: 100, backgroundColor: Colors.gray[100], overflow: 'hidden' },
  savedCardPlaceholder: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.brand[50] },
  savedCardBody: { padding: 8 },
  savedCardTitle: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, color: Colors.gray[900], lineHeight: 16, marginBottom: 4 },
  savedCardMeta: { fontSize: 10, color: Colors.gray[400] },

  // ── Your Communities ─────────────────────────────────────────────────────────
  yourCommSection: { marginTop: Spacing.lg, marginBottom: Spacing.lg },
  yourCommHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.md },
  yourCommTitle: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.gray[900], letterSpacing: -0.3 },
  yourCommSeeAll: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.brand[600] },
  yourCommScroll: { gap: Spacing.sm, paddingBottom: Spacing.xs },
  yourCommCard: { width: 120, backgroundColor: Colors.white, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: Colors.gray[100], shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  yourCommAvatar: { width: 40, height: 40, borderRadius: 12, backgroundColor: Colors.brand[100], justifyContent: 'center', alignItems: 'center', marginBottom: Spacing.sm, borderWidth: 1, borderColor: Colors.brand[200] },
  yourCommAvatarText: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.brand[700] },
  yourCommName: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.gray[900], lineHeight: 17, marginBottom: 3 },
  yourCommLevel: { fontSize: FontSize.xs, color: Colors.gray[400], textTransform: 'capitalize' as const },
  yourCommFindCard: { width: 120, backgroundColor: Colors.white, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: Colors.gray[200], borderStyle: 'dashed' as const, alignItems: 'center', justifyContent: 'center', gap: Spacing.sm },
  yourCommFindIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: Colors.brand[50], justifyContent: 'center', alignItems: 'center' },
  yourCommFindText: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, color: Colors.gray[500], textAlign: 'center' as const },
})
