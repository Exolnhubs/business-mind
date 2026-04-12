/**
 * Onboarding wizard shown once to new signups.
 *
 * Triggered by AuthGate when profile.gender is null.
 *
 * USER path (6 steps):
 *   welcome → gender → photo/bio → interests → communities → done
 *
 * ORGANIZER path (5 steps):
 *   welcome → gender → org-details → org-contact → done
 *
 * Animations:
 *   - Slide + fade transition between every step (expo-out cubic)
 *   - Animated linear progress bar
 *   - Staggered bullet reveal on welcome step
 *   - Gentle pulse on done step icon
 *   - Back button with reverse slide direction
 */

import { useState, useEffect, useRef } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, Image, Alert,
  Platform, KeyboardAvoidingView, SafeAreaView,
  Animated, Dimensions, Easing,
} from 'react-native'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import * as ImagePicker from 'expo-image-picker'
import * as Location from 'expo-location'
import { supabase } from '@/lib/supabase'
import { uploadViaApi } from '@/lib/upload'
import { apiGet, apiPost } from '@/lib/api'
import { useAuth } from '@/contexts/auth-context'
import { useLocale } from '@/contexts/locale-context'
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadow } from '@/theme'
import type { CommunityLevel, CommunityType } from '@/types/database'

// ── Types ──────────────────────────────────────────────────────────────────

type CommunitySuggestion = {
  id: string
  name: string
  name_ar: string | null
  slug: string
  level: CommunityLevel
  city: string | null
  country: string
  member_count: number
  description: string | null
  description_ar: string | null
  is_member: boolean
}

type CommunitiesListResponse = {
  data: CommunitySuggestion[]
  has_more?: boolean
}

type CommunityLocation = {
  city: string | null
  countryCode: string | null
  countryName: string | null
  lat: number | null
  lng: number | null
}

type StepId =
  | 'welcome'
  | 'gender'
  | 'photo-bio'
  | 'interests'
  | 'communities'
  | 'org-details'
  | 'org-contact'
  | 'done'

// ── Constants ──────────────────────────────────────────────────────────────

const CATEGORIES = [
  { id: 'sports',        en: 'Sports',         ar: 'رياضة',       icon: '⚽' },
  { id: 'arts',          en: 'Arts & Culture', ar: 'فنون وثقافة', icon: '🎨' },
  { id: 'music',         en: 'Music',          ar: 'موسيقى',      icon: '🎵' },
  { id: 'food',          en: 'Food & Drink',   ar: 'طعام وشراب',  icon: '🍽️' },
  { id: 'tech',          en: 'Technology',     ar: 'تقنية',       icon: '💻' },
  { id: 'business',      en: 'Business',       ar: 'أعمال',       icon: '💼' },
  { id: 'health',        en: 'Health',         ar: 'صحة ولياقة',  icon: '🏃' },
  { id: 'education',     en: 'Education',      ar: 'تعليم',       icon: '📚' },
  { id: 'entertainment', en: 'Entertainment',  ar: 'ترفيه',       icon: '🎭' },
  { id: 'community',     en: 'Community',      ar: 'مجتمع',       icon: '🤝' },
]

const USER_STEPS:      StepId[] = ['welcome', 'gender', 'photo-bio', 'interests', 'communities', 'done']
const ORGANIZER_STEPS: StepId[] = ['welcome', 'gender', 'org-details', 'org-contact', 'done']
const OPTIONAL_STEPS  = new Set<StepId>(['photo-bio', 'interests', 'communities', 'org-details', 'org-contact'])

const SCREEN_W = Dimensions.get('window').width

// Hero icon config for every step — replaces emoji heroes
const STEP_ICON: Record<StepId, { icon: keyof typeof Ionicons.glyphMap; color: string; bg: string }> = {
  welcome:       { icon: 'sparkles-outline',        color: Colors.brand[600], bg: Colors.brand[100] },
  gender:        { icon: 'people-outline',           color: '#7c3aed',          bg: '#ede9fe'          },
  'photo-bio':   { icon: 'camera-outline',           color: '#0369a1',          bg: '#e0f2fe'          },
  interests:     { icon: 'compass-outline',          color: Colors.brand[600], bg: Colors.brand[100] },
  communities:   { icon: 'globe-outline',            color: '#15803d',          bg: '#dcfce7'          },
  'org-details': { icon: 'storefront-outline',       color: '#92400e',          bg: '#fef3c7'          },
  'org-contact': { icon: 'call-outline',             color: '#0369a1',          bg: '#e0f2fe'          },
  done:          { icon: 'checkmark-circle-outline', color: '#15803d',          bg: '#dcfce7'          },
}

const INTEREST_TO_COMMUNITY_TYPES: Record<string, CommunityType[]> = {
  tech: ['tech'],
  coding: ['tech'],
  programming: ['tech'],
  startup: ['entrepreneur'],
  startups: ['entrepreneur'],
  founder: ['entrepreneur'],
  founders: ['entrepreneur'],
  business: ['entrepreneur'],
  entrepreneur: ['entrepreneur'],
  entrepreneurs: ['entrepreneur'],
  sports: ['sports'],
  sport: ['sports'],
  football: ['sports'],
  soccer: ['sports'],
  gym: ['sports'],
  fitness: ['sports'],
  padel: ['sports'],
  gaming: ['gaming'],
  gamer: ['gaming'],
  esports: ['gaming'],
  books: ['book_club'],
  book: ['book_club'],
  reading: ['book_club'],
  literature: ['book_club'],
  art: ['arts'],
  arts: ['arts'],
  music: ['arts'],
  design: ['arts'],
}

function dedupeCommunities(items: CommunitySuggestion[]) {
  const seen = new Set<string>()
  return items.filter((community) => {
    if (seen.has(community.slug)) return false
    seen.add(community.slug)
    return true
  })
}

function extractRecommendedCommunityTypes(selectedInterests: string[]) {
  const types = new Set<CommunityType>()
  for (const interest of selectedInterests) {
    const normalized = interest.trim().toLowerCase()
    for (const communityType of INTEREST_TO_COMMUNITY_TYPES[normalized] ?? []) {
      types.add(communityType)
    }
  }
  return Array.from(types)
}

// ── Component ──────────────────────────────────────────────────────────────

export default function OnboardingScreen() {
  const { user, profile, refreshProfile } = useAuth()
  const { isRTL } = useLocale()
  const router    = useRouter()

  const isOrganizer = profile?.role === 'organizer'
  const steps       = isOrganizer ? ORGANIZER_STEPS : USER_STEPS

  const [stepIndex, setStepIndex] = useState(0)
  const [saving, setSaving]       = useState(false)
  const directionRef = useRef<'forward' | 'back'>('forward')

  // User fields
  const [gender, setGender]       = useState<'male' | 'female' | null>(null)
  const [bio, setBio]             = useState('')
  const [avatarUri, setAvatarUri] = useState<string | null>(null)
  const [interests, setInterests] = useState<string[]>([])
  const [communitySuggestions, setCommunitySuggestions] = useState<CommunitySuggestion[]>([])
  const [selectedCommunities, setSelectedCommunities]   = useState<string[]>([])
  const [lockedCommunities, setLockedCommunities]       = useState<string[]>([])
  const [interestCommunitySlugs, setInterestCommunitySlugs] = useState<string[]>([])
  const [communityLoading, setCommunityLoading]         = useState(false)
  const [communityLocationError, setCommunityLocationError] = useState<string | null>(null)
  const [communityLocation, setCommunityLocation] = useState<CommunityLocation>({
    city: profile?.city ?? null,
    countryCode: null,
    countryName: null,
    lat: profile?.lat ?? profile?.signup_lat ?? null,
    lng: profile?.lng ?? profile?.signup_lng ?? null,
  })

  // Organizer fields
  const [orgDesc, setOrgDesc]       = useState('')
  const [orgDescAr, setOrgDescAr]   = useState('')
  const [orgLogoUri, setOrgLogoUri] = useState<string | null>(null)
  const [orgWebsite, setOrgWebsite] = useState('')
  const [orgPhone, setOrgPhone]     = useState('')

  const currentStep = steps[stepIndex]
  const isLastStep  = stepIndex === steps.length - 1
  const isOptional  = OPTIONAL_STEPS.has(currentStep)
  const canProceed  = currentStep !== 'gender' || gender !== null
  const firstName   = profile?.display_name?.split(' ')[0] ?? 'there'

  useEffect(() => {
    setCommunityLocation((prev) => ({
      city: prev.city ?? profile?.city ?? null,
      countryCode: prev.countryCode,
      countryName: prev.countryName,
      lat: prev.lat ?? profile?.lat ?? profile?.signup_lat ?? null,
      lng: prev.lng ?? profile?.lng ?? profile?.signup_lng ?? null,
    }))
  }, [profile?.city, profile?.lat, profile?.lng, profile?.signup_lat, profile?.signup_lng])

  // ── Animation values ────────────────────────────────────────────────────

  const slideX       = useRef(new Animated.Value(SCREEN_W)).current
  const fadeIn       = useRef(new Animated.Value(0)).current
  const progressAnim = useRef(new Animated.Value(0)).current
  const doneIconAnim = useRef(new Animated.Value(1)).current

  // 3 bullet items for welcome step stagger (both paths have 3 bullets)
  const bulletAnims = useRef(
    Array.from({ length: 3 }, () => ({
      opacity:    new Animated.Value(0),
      translateY: new Animated.Value(18),
    }))
  ).current

  // Step transition — fires whenever stepIndex changes
  useEffect(() => {
    const forward = directionRef.current === 'forward'
    slideX.setValue(forward ? SCREEN_W : -SCREEN_W)
    fadeIn.setValue(0)

    // Slide + fade in (expo-out easing — confident, decisive)
    Animated.parallel([
      Animated.timing(slideX, {
        toValue: 0, duration: 340, useNativeDriver: true,
        easing: Easing.out(Easing.cubic),
      }),
      Animated.timing(fadeIn, {
        toValue: 1, duration: 270, useNativeDriver: true,
      }),
    ]).start()

    // Animate progress bar (no native driver — width cannot use it)
    Animated.timing(progressAnim, {
      toValue: steps.length > 1 ? stepIndex / (steps.length - 1) : 1,
      duration: 520, useNativeDriver: false,
      easing: Easing.out(Easing.cubic),
    }).start()

    // Staggered bullet entrance on welcome step
    if (currentStep === 'welcome') {
      bulletAnims.forEach(a => { a.opacity.setValue(0); a.translateY.setValue(18) })
      setTimeout(() => {
        Animated.stagger(
          110,
          bulletAnims.map(a =>
            Animated.parallel([
              Animated.timing(a.opacity,    { toValue: 1, duration: 360, useNativeDriver: true }),
              Animated.timing(a.translateY, { toValue: 0, duration: 360, useNativeDriver: true, easing: Easing.out(Easing.cubic) }),
            ])
          )
        ).start()
      }, 260)
    }
  }, [stepIndex])

  // Gentle pulse on done step (loading indicator pattern — signals completion, not decoration)
  useEffect(() => {
    if (currentStep !== 'done') { doneIconAnim.setValue(1); return }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(doneIconAnim, { toValue: 1.09, duration: 950, useNativeDriver: true, easing: Easing.inOut(Easing.sin) }),
        Animated.timing(doneIconAnim, { toValue: 1,    duration: 950, useNativeDriver: true, easing: Easing.inOut(Easing.sin) }),
      ])
    )
    loop.start()
    return () => loop.stop()
  }, [currentStep])

  async function resolveCommunityLocation(promptIfMissing = false) {
    const fallbackCity = communityLocation.city ?? profile?.city ?? null
    let lat = communityLocation.lat ?? profile?.lat ?? profile?.signup_lat ?? null
    let lng = communityLocation.lng ?? profile?.lng ?? profile?.signup_lng ?? null

    if ((lat === null || lng === null) && promptIfMissing) {
      const { status } = await Location.requestForegroundPermissionsAsync()
      if (status !== 'granted') {
        setCommunityLocationError('Allow location access to auto-select your city and country communities.')
        return {
          city: fallbackCity,
          countryCode: null,
          countryName: null,
          lat: null,
          lng: null,
        } satisfies CommunityLocation
      }

      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
      lat = position.coords.latitude
      lng = position.coords.longitude
    }

    if (lat === null || lng === null) {
      const nextLocation = {
        city: fallbackCity,
        countryCode: null,
        countryName: null,
        lat,
        lng,
      } satisfies CommunityLocation
      setCommunityLocation(nextLocation)
      if (!fallbackCity) {
        setCommunityLocationError('Share your location to auto-join your city and country communities.')
      }
      return nextLocation
    }

    const [geo] = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng })
    const nextLocation = {
      city: fallbackCity ?? geo?.city ?? geo?.subregion ?? geo?.region ?? null,
      countryCode: geo?.isoCountryCode?.toUpperCase() ?? null,
      countryName: geo?.country ?? null,
      lat,
      lng,
    } satisfies CommunityLocation

    setCommunityLocation(nextLocation)
    setCommunityLocationError(nextLocation.countryCode ? null : 'Share your location to auto-select your country community.')
    return nextLocation
  }

  async function fetchCommunitiesForOnboarding(location: CommunityLocation) {
    const required: CommunitySuggestion[] = []
    const interestTypes = extractRecommendedCommunityTypes(interests)

    if (location.countryCode) {
      const { data } = await apiGet<CommunitiesListResponse>('/api/communities?level=country&per_page=30&page=1')
      const countryCommunities = (data?.data ?? [])
        .filter((community) => community.level === 'country' && community.country.toUpperCase() === location.countryCode)
        .sort((a, b) => b.member_count - a.member_count)
      if (countryCommunities[0]) required.push(countryCommunities[0])
    }

    if (location.city) {
      const params = new URLSearchParams({
        level: 'city',
        city: location.city,
        per_page: '10',
        page: '1',
      })
      const { data } = await apiGet<CommunitiesListResponse>(`/api/communities?${params}`)
      const cityCommunities = (data?.data ?? [])
        .filter((community) =>
          community.level === 'city' &&
          (community.city ?? '').toLowerCase() === location.city?.toLowerCase() &&
          (!location.countryCode || community.country.toUpperCase() === location.countryCode),
        )
        .sort((a, b) => b.member_count - a.member_count)
      if (cityCommunities[0]) required.push(cityCommunities[0])
    }

    let interestBased: CommunitySuggestion[] = []
    if (interestTypes.length > 0) {
      const responses = await Promise.all(
        interestTypes.map((type) => {
          const params = new URLSearchParams({
            level: 'interest',
            type,
            per_page: '6',
            page: '1',
          })
          return apiGet<CommunitiesListResponse>(`/api/communities?${params}`)
        })
      )

      interestBased = responses
        .flatMap(({ data }) => data?.data ?? [])
        .filter((community) => !community.is_member && community.level === 'interest')
        .sort((a, b) => {
          const aMatchesCity = location.city && a.city && a.city.toLowerCase() === location.city.toLowerCase() ? 1 : 0
          const bMatchesCity = location.city && b.city && b.city.toLowerCase() === location.city.toLowerCase() ? 1 : 0
          if (aMatchesCity !== bMatchesCity) return bMatchesCity - aMatchesCity
          return b.member_count - a.member_count
        })
    }

    const { data: trendingData } = await apiGet<CommunitiesListResponse>('/api/communities/trending?per_page=12&page=1')
    let trending = (trendingData?.data ?? []).filter((community) => !community.is_member)

    if (trending.length === 0) {
      const { data: fallbackData } = await apiGet<CommunitiesListResponse>('/api/communities?per_page=18&page=1')
      trending = (fallbackData?.data ?? []).filter(
        (community) =>
          !community.is_member &&
          (community.level === 'micro' || community.level === 'interest' || community.level === 'district'),
      )
    }

    const dedupedRequired = dedupeCommunities(required)
    const dedupedInterestBased = dedupeCommunities(interestBased)
      .filter((community) => !dedupedRequired.some((requiredCommunity) => requiredCommunity.slug === community.slug))
      .slice(0, 8)
    const dedupedTrending = dedupeCommunities(trending)
      .filter((community) =>
        !dedupedRequired.some((requiredCommunity) => requiredCommunity.slug === community.slug) &&
        !dedupedInterestBased.some((interestCommunity) => interestCommunity.slug === community.slug),
      )

    return {
      required: dedupedRequired,
      interestBased: dedupedInterestBased,
      suggested: [...dedupedRequired, ...dedupedInterestBased, ...dedupedTrending].slice(0, 14),
    }
  }

  async function loadCommunityStep(promptForLocation = false) {
    setCommunityLoading(true)
    try {
      const location = await resolveCommunityLocation(promptForLocation)
      const { required, interestBased, suggested } = await fetchCommunitiesForOnboarding(location)
      const locked = required.map((community) => community.slug)
      setLockedCommunities(locked)
      setInterestCommunitySlugs(interestBased.map((community) => community.slug))
      setCommunitySuggestions(suggested)
      setSelectedCommunities((prev) => Array.from(new Set([...prev, ...locked])))
    } catch {
      setCommunityLocationError('Could not load communities right now. You can still finish onboarding and join later.')
      setLockedCommunities([])
      setInterestCommunitySlugs([])
      setCommunitySuggestions([])
    } finally {
      setCommunityLoading(false)
    }
  }

  useEffect(() => {
    if (currentStep !== 'communities') return
    void loadCommunityStep(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep])

  // ── Image picker ────────────────────────────────────────────────────────

  async function pickImage(target: 'avatar' | 'logo') {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow access to your photo library.')
      return
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true, aspect: [1, 1], quality: 0.85,
    })
    if (!result.canceled && result.assets[0]) {
      if (target === 'avatar') setAvatarUri(result.assets[0].uri)
      else                     setOrgLogoUri(result.assets[0].uri)
    }
  }

  // ── Save & complete ─────────────────────────────────────────────────────

  async function handleComplete() {
    if (!user) return
    setSaving(true)
    try {
      let avatarUrl = profile?.avatar_url ?? null
      if (avatarUri) avatarUrl = await uploadViaApi(avatarUri, 'avatar')
      let logoUrl: string | null = null
      if (orgLogoUri) logoUrl = await uploadViaApi(orgLogoUri, 'avatar')

      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          gender:     gender ?? undefined,
          bio:        bio.trim() || null,
          avatar_url: avatarUrl,
          city:       communityLocation.city ?? profile?.city ?? null,
          lat:        communityLocation.lat ?? profile?.lat ?? null,
          lng:        communityLocation.lng ?? profile?.lng ?? null,
          signup_lat: profile?.signup_lat ?? communityLocation.lat ?? null,
          signup_lng: profile?.signup_lng ?? communityLocation.lng ?? null,
          preferences: {
            ...(profile?.preferences as Record<string, unknown> ?? {}),
            onboarding_completed: true,
            interests,
            show_smart_picks_trigger: true,
          },
        } as any)
        .eq('id', user.id)

      if (profileError) throw profileError

      if (isOrganizer) {
        const { error: organizerError } = await supabase
          .from('organizer_profiles')
          .update({
            description:    orgDesc.trim()    || null,
            description_ar: orgDescAr.trim()  || null,
            logo_url:       logoUrl           ?? undefined,
            website:        orgWebsite.trim() || null,
            phone:          orgPhone.trim()   || null,
          } as any)
          .eq('user_id', user.id)

        if (organizerError) throw organizerError
      }

      if (selectedCommunities.length > 0) {
        await Promise.allSettled(
          selectedCommunities.map((slug) => apiPost(`/api/communities/${slug}/join`, {}))
        )
      }

      await refreshProfile()
      router.replace('/(tabs)/home')
    } catch {
      Alert.alert('Error', 'Could not save your profile. Please try again.')
      setSaving(false)
    }
  }

  // ── Navigation with animation ───────────────────────────────────────────

  function animateOut(onDone: () => void, forward = true) {
    Animated.parallel([
      Animated.timing(slideX, {
        toValue: forward ? -SCREEN_W * 0.18 : SCREEN_W * 0.18,
        duration: 210, useNativeDriver: true,
        easing: Easing.in(Easing.cubic),
      }),
      Animated.timing(fadeIn, {
        toValue: 0, duration: 190, useNativeDriver: true,
      }),
    ]).start(onDone)
  }

  function advance() {
    if (!canProceed) return
    directionRef.current = 'forward'
    if (isLastStep) { handleComplete(); return }
    animateOut(() => setStepIndex(i => i + 1))
  }

  function skip() {
    directionRef.current = 'forward'
    if (isLastStep) { handleComplete(); return }
    animateOut(() => setStepIndex(i => i + 1))
  }

  function goBack() {
    if (stepIndex === 0) return
    directionRef.current = 'back'
    animateOut(() => setStepIndex(i => i - 1), false)
  }

  // ── Step icon helper ────────────────────────────────────────────────────

  function StepHeroIcon({ step, animated = false }: { step: StepId; animated?: boolean }) {
    const cfg = STEP_ICON[step]
    if (animated) {
      return (
        <Animated.View style={[s.heroIconWrap, { backgroundColor: cfg.bg, transform: [{ scale: doneIconAnim }] }]}>
          <Ionicons name={cfg.icon} size={44} color={cfg.color} />
        </Animated.View>
      )
    }
    return (
      <View style={[s.heroIconWrap, { backgroundColor: cfg.bg }]}>
        <Ionicons name={cfg.icon} size={44} color={cfg.color} />
      </View>
    )
  }

  // ── Step renderers ──────────────────────────────────────────────────────

  function StepWelcome() {
    const bullets = isOrganizer
      ? ['Create & manage events', 'Sell tickets with ease', 'Track attendance & revenue']
      : ['Discover events near you', 'Book tickets in seconds', 'Connect with your community']

    return (
      <View style={s.stepContent}>
        <StepHeroIcon step={isOrganizer ? 'org-details' : 'welcome'} />
        <Text style={s.stepTitle}>
          {isOrganizer ? 'Set up your organizer profile' : `Welcome, ${firstName}!`}
        </Text>
        <Text style={s.stepSub}>
          {isOrganizer
            ? 'A few quick steps so you can start creating unforgettable events.'
            : 'Just a few quick steps to personalise your Rawaq experience.'}
        </Text>
        <View style={s.bulletList}>
          {bullets.map((b, i) => (
            <Animated.View
              key={i}
              style={[
                s.bulletRow,
                {
                  opacity:   bulletAnims[i].opacity,
                  transform: [{ translateY: bulletAnims[i].translateY }],
                },
              ]}
            >
              <View style={s.bulletIconWrap}>
                <Ionicons name="checkmark" size={13} color={Colors.brand[600]} />
              </View>
              <Text style={s.bulletText}>{b}</Text>
            </Animated.View>
          ))}
        </View>
      </View>
    )
  }

  function StepGender() {
    return (
      <View style={s.stepContent}>
        <StepHeroIcon step="gender" />
        <Text style={s.stepTitle}>Select your gender</Text>
        <Text style={s.stepSub}>
          This helps us show you relevant events and respects gender-restricted venues.
        </Text>
        <View style={s.genderRow}>
          {(['male', 'female'] as const).map((g) => (
            <TouchableOpacity
              key={g}
              style={[s.genderCard, gender === g && s.genderCardActive]}
              onPress={() => setGender(g)}
              activeOpacity={0.8}
            >
              <View style={[s.genderIconCircle, gender === g && s.genderIconCircleActive]}>
                <Ionicons
                  name={g === 'male' ? 'male-outline' : 'female-outline'}
                  size={34}
                  color={gender === g ? Colors.brand[600] : Colors.gray[400]}
                />
              </View>
              <Text style={[s.genderLabel, gender === g && s.genderLabelActive]}>
                {g === 'male' ? 'Male' : 'Female'}
              </Text>
              {gender === g && (
                <View style={s.genderTick}>
                  <Ionicons name="checkmark" size={11} color={Colors.white} />
                </View>
              )}
            </TouchableOpacity>
          ))}
        </View>
        <View style={s.notice}>
          <Ionicons name="warning-outline" size={15} color="#92400e" />
          <Text style={s.noticeText}>This cannot be changed after you save it.</Text>
        </View>
      </View>
    )
  }

  function StepPhotoBio() {
    return (
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={s.stepContent}>
          <StepHeroIcon step="photo-bio" />
          <Text style={s.stepTitle}>Add a photo & bio</Text>
          <Text style={s.stepSub}>Help others recognise you. You can always update this later.</Text>

          <TouchableOpacity style={s.avatarWrap} onPress={() => pickImage('avatar')} activeOpacity={0.8}>
            {avatarUri
              ? <Image source={{ uri: avatarUri }} style={s.avatarImg} />
              : (
                <View style={s.avatarEmpty}>
                  <Ionicons name="camera-outline" size={28} color={Colors.gray[400]} />
                  <Text style={s.pickText}>Tap to pick a photo</Text>
                </View>
              )
            }
          </TouchableOpacity>

          <View style={s.fieldWrap}>
            <Text style={s.label}>
              Bio <Text style={s.optionalTag}>(optional)</Text>
            </Text>
            <TextInput
              style={[s.textArea, isRTL && s.rtlText]}
              value={bio}
              onChangeText={t => { if (t.length <= 500) setBio(t) }}
              placeholder="Tell people a bit about yourself…"
              placeholderTextColor={Colors.gray[400]}
              multiline numberOfLines={4}
              textAlignVertical="top"
              textAlign={isRTL ? 'right' : 'left'}
            />
            <Text style={s.charCount}>{bio.length}/500</Text>
          </View>
        </View>
      </ScrollView>
    )
  }

  function StepInterests() {
    return (
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={s.stepContent}>
          <StepHeroIcon step="interests" />
          <Text style={s.stepTitle}>What are you into?</Text>
          <Text style={s.stepSub}>
            Pick your interests so we can recommend events you'll love.
          </Text>
          <View style={s.chipGrid}>
            {CATEGORIES.map((cat) => {
              const on = interests.includes(cat.id)
              return (
                <TouchableOpacity
                  key={cat.id}
                  style={[s.chip, on && s.chipOn]}
                  onPress={() =>
                    setInterests(prev =>
                      on ? prev.filter(id => id !== cat.id) : [...prev, cat.id]
                    )
                  }
                  activeOpacity={0.8}
                >
                  <Text style={s.chipIcon}>{cat.icon}</Text>
                  <Text style={[s.chipLabel, on && s.chipLabelOn]}>
                    {isRTL ? cat.ar : cat.en}
                  </Text>
                  {on && <Ionicons name="checkmark-circle" size={14} color={Colors.brand[500]} />}
                </TouchableOpacity>
              )
            })}
          </View>
        </View>
      </ScrollView>
    )
  }

  function StepCommunities() {
    const levelIcon: Record<CommunityLevel, keyof typeof Ionicons.glyphMap> = {
      micro:    'home-outline',
      interest: 'heart-outline',
      district: 'business-outline',
      city:     'location-outline',
      country:  'earth-outline',
    }
    const requiredCommunities = communitySuggestions.filter((community) => lockedCommunities.includes(community.slug))
    const interestCommunities = communitySuggestions.filter(
      (community) => interestCommunitySlugs.includes(community.slug) && !lockedCommunities.includes(community.slug)
    )
    const suggestedCommunities = communitySuggestions.filter(
      (community) => !lockedCommunities.includes(community.slug) && !interestCommunitySlugs.includes(community.slug)
    )
    const locationLabel = [communityLocation.city, communityLocation.countryName].filter(Boolean).join(', ')
    return (
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={s.stepContent}>
          <StepHeroIcon step="communities" />
          <Text style={s.stepTitle}>Choose communities to join</Text>
          <Text style={s.stepSub}>
            We&apos;ve pre-selected your city and country communities when we can. Add any trending groups you&apos;d like on top.
          </Text>
          {!!locationLabel && (
            <View style={s.commLocationPill}>
              <Ionicons name="navigate-outline" size={14} color={Colors.brand[700]} />
              <Text style={s.commLocationText}>Near {locationLabel}</Text>
            </View>
          )}
          {(communityLocationError || (!communityLocation.countryCode && !communityLoading)) && (
            <View style={s.locationPrompt}>
              <View style={s.locationPromptTextWrap}>
                <Text style={s.locationPromptTitle}>Use your location</Text>
                <Text style={s.locationPromptText}>
                  {communityLocationError ?? 'We need your location to auto-select your city and country communities.'}
                </Text>
              </View>
              <TouchableOpacity
                style={s.locationPromptBtn}
                onPress={() => void loadCommunityStep(true)}
                activeOpacity={0.82}
              >
                <Text style={s.locationPromptBtnText}>Use location</Text>
              </TouchableOpacity>
            </View>
          )}
          {communityLoading ? (
            <ActivityIndicator color={Colors.brand[500]} style={{ marginTop: Spacing['2xl'] }} />
          ) : communitySuggestions.length === 0 ? (
            <View style={s.commEmptyState}>
              <Text style={s.commEmptyTitle}>No communities to suggest yet</Text>
              <Text style={s.commEmptyText}>You can finish onboarding now and join communities any time from the Communities tab.</Text>
            </View>
          ) : (
            <>
            {requiredCommunities.length > 0 && (
              <View style={s.commSection}>
                <Text style={s.commSectionTitle}>Required for your area</Text>
                <Text style={s.commSectionSub}>These stay selected so your local feed starts in the right place.</Text>
                <View style={s.commGrid}>
                  {requiredCommunities.map((c) => {
                    const name = isRTL && c.name_ar ? c.name_ar : c.name
                    return (
                      <View key={c.id} style={[s.commCard, s.commCardOn, s.commCardLocked]}>
                        <Ionicons
                          name={levelIcon[c.level]}
                          size={20}
                          color={Colors.brand[600]}
                        />
                        <Text style={[s.commName, s.commNameOn]} numberOfLines={2}>{name}</Text>
                        <Text style={s.commMeta}>{c.member_count.toLocaleString()} members</Text>
                        <View style={s.commRequiredBadge}>
                          <Ionicons name="lock-closed" size={10} color="#92400e" />
                          <Text style={s.commRequiredBadgeText}>Required</Text>
                        </View>
                        <View style={s.commTick}>
                          <Ionicons name="checkmark" size={10} color={Colors.white} />
                        </View>
                      </View>
                    )
                  })}
                </View>
              </View>
            )}
            {interestCommunities.length > 0 && (
              <View style={s.commSection}>
                <Text style={s.commSectionTitle}>Based on your interests</Text>
                <Text style={s.commSectionSub}>These match what you told us you&apos;re into, so your communities feel relevant right away.</Text>
                <View style={s.commGrid}>
                  {interestCommunities.map((c) => {
                    const on   = selectedCommunities.includes(c.slug)
                    const name = isRTL && c.name_ar ? c.name_ar : c.name
                    return (
                      <TouchableOpacity
                        key={c.id}
                        style={[s.commCard, on && s.commCardOn]}
                        onPress={() =>
                          setSelectedCommunities((prev) =>
                            on ? prev.filter((slug) => slug !== c.slug) : [...prev, c.slug]
                          )
                        }
                        activeOpacity={0.8}
                      >
                        <Ionicons
                          name={levelIcon[c.level]}
                          size={20}
                          color={on ? Colors.brand[600] : Colors.gray[400]}
                        />
                        <Text style={[s.commName, on && s.commNameOn]} numberOfLines={2}>{name}</Text>
                        <Text style={s.commMeta}>{c.member_count.toLocaleString()} members</Text>
                        {on && (
                          <View style={s.commTick}>
                            <Ionicons name="checkmark" size={10} color={Colors.white} />
                          </View>
                        )}
                      </TouchableOpacity>
                    )
                  })}
                </View>
              </View>
            )}
            {suggestedCommunities.length > 0 && (
              <View style={s.commSection}>
                <Text style={s.commSectionTitle}>Trending communities</Text>
                <Text style={s.commSectionSub}>Pick a few groups so your feed feels personal from day one.</Text>
                <View style={s.commGrid}>
              {suggestedCommunities.map((c) => {
                const on   = selectedCommunities.includes(c.slug)
                const name = isRTL && c.name_ar ? c.name_ar : c.name
                return (
                  <TouchableOpacity
                    key={c.id}
                    style={[s.commCard, on && s.commCardOn]}
                    onPress={() =>
                      setSelectedCommunities((prev) =>
                        on ? prev.filter((slug) => slug !== c.slug) : [...prev, c.slug]
                      )
                    }
                    activeOpacity={0.8}
                  >
                    <Ionicons
                      name={levelIcon[c.level]}
                      size={20}
                      color={on ? Colors.brand[600] : Colors.gray[400]}
                    />
                    <Text style={[s.commName, on && s.commNameOn]} numberOfLines={2}>{name}</Text>
                    <Text style={s.commMeta}>{c.member_count.toLocaleString()} members</Text>
                    {on && (
                      <View style={s.commTick}>
                        <Ionicons name="checkmark" size={10} color={Colors.white} />
                      </View>
                    )}
                  </TouchableOpacity>
                )
              })}
            </View>
              </View>
            )}
            </>
          )}
          {selectedCommunities.length > 0 && (
            <Text style={s.commSelectedLabel}>{selectedCommunities.length} selected</Text>
          )}
        </View>
      </ScrollView>
    )
  }

  function StepOrgDetails() {
    return (
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={s.stepContent}>
          <StepHeroIcon step="org-details" />
          <Text style={s.stepTitle}>Tell your story</Text>
          <Text style={s.stepSub}>Describe your brand so attendees know what to expect.</Text>

          <TouchableOpacity style={s.logoWrap} onPress={() => pickImage('logo')} activeOpacity={0.8}>
            {orgLogoUri
              ? <Image source={{ uri: orgLogoUri }} style={s.logoImg} />
              : (
                <View style={s.logoEmpty}>
                  <Ionicons name="image-outline" size={24} color={Colors.gray[400]} />
                  <Text style={s.pickText}>Upload logo (optional)</Text>
                </View>
              )
            }
          </TouchableOpacity>

          <View style={s.fieldWrap}>
            <Text style={s.label}>
              Description <Text style={s.optionalTag}>(English)</Text>
            </Text>
            <TextInput
              style={s.textArea}
              value={orgDesc}
              onChangeText={t => { if (t.length <= 500) setOrgDesc(t) }}
              placeholder="We create unforgettable experiences…"
              placeholderTextColor={Colors.gray[400]}
              multiline numberOfLines={3} textAlignVertical="top"
            />
            <Text style={s.charCount}>{orgDesc.length}/500</Text>
          </View>

          <View style={s.fieldWrap}>
            <Text style={[s.label, s.rtlText]}>
              الوصف <Text style={s.optionalTag}>(عربي)</Text>
            </Text>
            <TextInput
              style={[s.textArea, s.rtlText]}
              value={orgDescAr}
              onChangeText={t => { if (t.length <= 500) setOrgDescAr(t) }}
              placeholder="نصنع تجارب لا تُنسى…"
              placeholderTextColor={Colors.gray[400]}
              multiline numberOfLines={3} textAlignVertical="top" textAlign="right"
            />
            <Text style={[s.charCount, s.rtlText]}>{orgDescAr.length}/500</Text>
          </View>
        </View>
      </ScrollView>
    )
  }

  function StepOrgContact() {
    const fields = [
      { label: 'Website', placeholder: 'https://myevents.com', value: orgWebsite, set: setOrgWebsite, kb: 'url'       },
      { label: 'Phone',   placeholder: '+966 5x xxx xxxx',     value: orgPhone,   set: setOrgPhone,   kb: 'phone-pad' },
    ] as const
    return (
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={s.stepContent}>
          <StepHeroIcon step="org-contact" />
          <Text style={s.stepTitle}>Contact details</Text>
          <Text style={s.stepSub}>Help attendees find and reach you online.</Text>
          {fields.map(({ label, placeholder, value, set, kb }) => (
            <View key={label} style={s.fieldWrap}>
              <Text style={s.label}>
                {label} <Text style={s.optionalTag}>(optional)</Text>
              </Text>
              <TextInput
                style={[s.input, isRTL && s.rtlText]}
                value={value}
                onChangeText={set as (v: string) => void}
                placeholder={placeholder}
                placeholderTextColor={Colors.gray[400]}
                keyboardType={kb as any}
                autoCapitalize="none"
                textAlign={isRTL ? 'right' : 'left'}
              />
            </View>
          ))}
        </View>
      </ScrollView>
    )
  }

  function StepDone() {
    return (
      <View style={[s.stepContent, s.doneContent]}>
        {/* Animated icon — gentle pulse signals "live" state */}
        <StepHeroIcon step="done" animated />
        <Text style={[s.stepTitle, { textAlign: 'center' }]}>
          {isOrganizer ? "You're almost live!" : "You're all set!"}
        </Text>
        <Text style={[s.stepSub, { textAlign: 'center' }]}>
          {isOrganizer
            ? 'Your profile is submitted for review. Explore the app while we verify your account.'
            : 'Your profile is ready. Start discovering events near you!'}
        </Text>
        {isOrganizer && (
          <View style={s.pendingBadge}>
            <Ionicons name="time-outline" size={15} color={Colors.brand[700]} />
            <Text style={s.pendingText}>Pending admin review</Text>
          </View>
        )}
      </View>
    )
  }

  // ── Layout ──────────────────────────────────────────────────────────────

  const ctaLabel = isLastStep
    ? (isOrganizer ? "Let's go!" : 'Start exploring')
    : 'Continue'

  return (
    <SafeAreaView style={s.root}>
      {/* Decorative background circles — depth without distraction */}
      <View style={s.decor1} pointerEvents="none" />
      <View style={s.decor2} pointerEvents="none" />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* ── Header: back chevron + progress bar + step counter ─── */}
        <View style={s.header}>
          <TouchableOpacity
            onPress={goBack}
            style={[s.backBtn, stepIndex === 0 && s.backBtnHidden]}
            disabled={stepIndex === 0}
            activeOpacity={0.7}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="chevron-back" size={22} color={Colors.gray[600]} />
          </TouchableOpacity>

          <View style={s.progressTrack}>
            <Animated.View
              style={[
                s.progressFill,
                {
                  width: progressAnim.interpolate({
                    inputRange:  [0, 1],
                    outputRange: ['0%', '100%'],
                  }),
                },
              ]}
            />
          </View>

          <Text style={s.stepCounter}>{stepIndex + 1}/{steps.length}</Text>
        </View>

        {/* ── Animated step body ──────────────────────────────────── */}
        <Animated.View
          style={[
            { flex: 1 },
            { opacity: fadeIn, transform: [{ translateX: slideX }] },
          ]}
        >
          {currentStep === 'welcome'      && StepWelcome()}
          {currentStep === 'gender'       && StepGender()}
          {currentStep === 'photo-bio'    && StepPhotoBio()}
          {currentStep === 'interests'    && StepInterests()}
          {currentStep === 'communities'  && StepCommunities()}
          {currentStep === 'org-details'  && StepOrgDetails()}
          {currentStep === 'org-contact'  && StepOrgContact()}
          {currentStep === 'done'         && StepDone()}
        </Animated.View>

        {/* ── Footer ─────────────────────────────────────────────── */}
        <View style={s.footer}>
          {isOptional && !isLastStep && (
            <TouchableOpacity onPress={skip} style={s.skipBtn} activeOpacity={0.7}>
              <Text style={s.skipLabel}>Skip for now</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[s.cta, (!canProceed || saving) && s.ctaOff]}
            onPress={advance}
            disabled={!canProceed || saving}
            activeOpacity={0.88}
          >
            {saving
              ? <ActivityIndicator color={Colors.white} />
              : (
                <View style={s.ctaInner}>
                  <Text style={s.ctaLabel}>{ctaLabel}</Text>
                  {!isLastStep && <Ionicons name="arrow-forward" size={18} color={Colors.white} />}
                </View>
              )
            }
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

// ── Styles ──────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.brand[50],
  },

  // Decorative bg elements — two overlapping circles, warm amber
  decor1: {
    position: 'absolute',
    top: -110,
    right: -90,
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: Colors.brand[100],
    opacity: 0.55,
  },
  decor2: {
    position: 'absolute',
    bottom: 20,
    left: -130,
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: Colors.brand[100],
    opacity: 0.3,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.md,
    gap: Spacing.md,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: Colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadow.card,
  },
  backBtnHidden: { opacity: 0 },

  // Progress bar
  progressTrack: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.brand[100],
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
    backgroundColor: Colors.brand[500],
  },
  stepCounter: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    color: Colors.gray[400],
    minWidth: 28,
    textAlign: 'right',
  },

  // Step shell
  stepContent: {
    flex: 1,
    paddingHorizontal: Spacing['2xl'],
    paddingTop: Spacing['2xl'],
  },

  // Hero icon (replaces emoji)
  heroIconWrap: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.xl,
    ...Shadow.card,
  },

  // Typography
  stepTitle: {
    fontSize: FontSize['3xl'],
    fontWeight: FontWeight.bold,
    color: Colors.gray[900],
    lineHeight: 36,
    marginBottom: Spacing.sm,
  },
  stepSub: {
    fontSize: FontSize.base,
    color: Colors.gray[500],
    lineHeight: 24,
    marginBottom: Spacing['2xl'],
  },

  // Welcome bullets (each animates in staggered)
  bulletList: { gap: Spacing.lg },
  bulletRow:  { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  bulletIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: Colors.brand[100],
    alignItems: 'center',
    justifyContent: 'center',
  },
  bulletText: {
    fontSize: FontSize.base,
    color: Colors.gray[700],
    fontWeight: FontWeight.medium,
    flex: 1,
  },

  // Gender step
  genderRow: { flexDirection: 'row', gap: Spacing.md, marginBottom: Spacing.xl },
  genderCard: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing['2xl'],
    borderRadius: Radius.xl,
    borderWidth: 2,
    borderColor: Colors.gray[200],
    backgroundColor: Colors.white,
    gap: Spacing.md,
    position: 'relative',
  },
  genderCardActive: {
    borderColor: Colors.brand[400],
    backgroundColor: Colors.brand[50],
  },
  genderIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.gray[100],
    alignItems: 'center',
    justifyContent: 'center',
  },
  genderIconCircleActive: { backgroundColor: Colors.brand[100] },
  genderLabel:       { fontSize: FontSize.base, fontWeight: FontWeight.semibold, color: Colors.gray[600] },
  genderLabelActive: { color: Colors.brand[700] },
  genderTick: {
    position: 'absolute',
    top: 10, right: 10,
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: Colors.brand[500],
    alignItems: 'center', justifyContent: 'center',
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: '#fffbeb',
    borderWidth: 1,
    borderColor: '#fde68a',
    borderRadius: Radius.lg,
    padding: Spacing.md,
  },
  noticeText: { fontSize: FontSize.sm, color: '#92400e', lineHeight: 18, flex: 1 },

  // Avatar / logo pickers
  avatarWrap: { alignSelf: 'center', marginBottom: Spacing['2xl'] },
  avatarImg: {
    width: 100, height: 100, borderRadius: 50,
    borderWidth: 3, borderColor: Colors.brand[300],
  },
  avatarEmpty: {
    width: 100, height: 100, borderRadius: 50,
    backgroundColor: Colors.white,
    borderWidth: 2, borderColor: Colors.gray[200], borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center', gap: 6,
  },
  logoWrap: { alignSelf: 'center', marginBottom: Spacing['2xl'] },
  logoImg: {
    width: 80, height: 80, borderRadius: Radius.lg,
    borderWidth: 2, borderColor: Colors.brand[300],
  },
  logoEmpty: {
    width: 80, height: 80, borderRadius: Radius.lg,
    backgroundColor: Colors.white,
    borderWidth: 2, borderColor: Colors.gray[200], borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center', gap: 6,
  },
  pickText: { fontSize: FontSize.xs, color: Colors.gray[400], textAlign: 'center' },

  // Form
  fieldWrap: { marginBottom: Spacing.lg },
  label: { fontSize: FontSize.sm, fontWeight: FontWeight.medium, color: Colors.gray[700], marginBottom: 6 },
  optionalTag: { fontWeight: FontWeight.normal, color: Colors.gray[400] },
  input: {
    backgroundColor: Colors.white,
    borderWidth: 1, borderColor: Colors.gray[200],
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
    fontSize: FontSize.base, color: Colors.gray[900],
  },
  textArea: {
    backgroundColor: Colors.white,
    borderWidth: 1, borderColor: Colors.gray[200],
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
    fontSize: FontSize.base, color: Colors.gray[900],
    minHeight: 100,
  },
  rtlText: { textAlign: 'right' },
  charCount: { fontSize: FontSize.xs, color: Colors.gray[400], textAlign: 'right', marginTop: 4 },

  // Interests chips
  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, paddingBottom: Spacing['3xl'] },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.xs,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 2,
    borderRadius: Radius.full,
    borderWidth: 1.5, borderColor: Colors.gray[200],
    backgroundColor: Colors.white,
  },
  chipOn:      { borderColor: Colors.brand[400], backgroundColor: Colors.brand[50] },
  chipIcon:    { fontSize: 15 },
  chipLabel:   { fontSize: FontSize.sm, color: Colors.gray[600], fontWeight: FontWeight.medium },
  chipLabelOn: { color: Colors.brand[700] },

  // Communities grid
  commSection: { marginBottom: Spacing.lg },
  commSectionTitle: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.bold,
    color: Colors.gray[800],
    marginBottom: 4,
  },
  commSectionSub: {
    fontSize: FontSize.sm,
    color: Colors.gray[500],
    lineHeight: 20,
    marginBottom: Spacing.md,
  },
  commLocationPill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: Spacing.md,
    backgroundColor: Colors.brand[100],
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.full,
  },
  commLocationText: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.brand[700] },
  locationPrompt: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: Spacing.md,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.brand[200],
    borderRadius: Radius.xl,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
  },
  locationPromptTextWrap: { flex: 1, gap: 2 },
  locationPromptTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.gray[800] },
  locationPromptText: { fontSize: FontSize.sm, color: Colors.gray[500], lineHeight: 18 },
  locationPromptBtn: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.brand[600],
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm + 1,
  },
  locationPromptBtnText: { color: Colors.white, fontSize: FontSize.sm, fontWeight: FontWeight.semibold },
  commGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, paddingBottom: Spacing['3xl'] },
  commCard: {
    width: '47%',
    borderWidth: 1.5, borderColor: Colors.gray[200],
    borderRadius: Radius.xl,
    backgroundColor: Colors.white,
    padding: Spacing.md,
    gap: 4,
    position: 'relative',
  },
  commCardOn:      { borderColor: Colors.brand[400], backgroundColor: Colors.brand[50] },
  commCardLocked:  { borderColor: Colors.brand[300] },
  commName:        { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.gray[800] },
  commNameOn:      { color: Colors.brand[800] },
  commMeta:        { fontSize: 11, color: Colors.gray[400] },
  commRequiredBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Radius.full,
    backgroundColor: '#fef3c7',
  },
  commRequiredBadgeText: { fontSize: 10, fontWeight: FontWeight.semibold, color: '#92400e' },
  commTick: {
    position: 'absolute', top: 8, right: 8,
    width: 18, height: 18, borderRadius: 9,
    backgroundColor: Colors.brand[500],
    alignItems: 'center', justifyContent: 'center',
  },
  commEmptyState: {
    backgroundColor: Colors.white,
    borderRadius: Radius.xl,
    padding: Spacing.xl,
    marginBottom: Spacing.xl,
    ...Shadow.card,
  },
  commEmptyTitle: { fontSize: FontSize.base, fontWeight: FontWeight.bold, color: Colors.gray[800], marginBottom: 6 },
  commEmptyText: { fontSize: FontSize.sm, color: Colors.gray[500], lineHeight: 20 },
  commSelectedLabel: {
    fontSize: FontSize.sm, color: Colors.brand[600],
    fontWeight: FontWeight.semibold, textAlign: 'center', marginBottom: Spacing.lg,
  },

  // Done screen
  doneContent: { alignItems: 'center', justifyContent: 'center', gap: Spacing.md },
  pendingBadge: {
    marginTop: Spacing.md,
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md,
    borderRadius: Radius.full,
    backgroundColor: Colors.brand[100],
  },
  pendingText: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.brand[700] },

  // Footer
  footer: {
    paddingHorizontal: Spacing['2xl'],
    paddingBottom: Platform.OS === 'ios' ? Spacing['2xl'] : Spacing.xl,
    paddingTop: Spacing.lg,
    gap: Spacing.sm,
  },
  skipBtn:  { alignItems: 'center', paddingVertical: Spacing.xs },
  skipLabel: { fontSize: FontSize.sm, color: Colors.gray[400] },
  cta: {
    backgroundColor: Colors.brand[600],
    borderRadius: Radius.full,
    paddingVertical: Spacing.lg,
    alignItems: 'center',
    ...Shadow.card,
  },
  ctaOff:   { opacity: 0.45 },
  ctaInner: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  ctaLabel: { color: Colors.white, fontSize: FontSize.lg, fontWeight: FontWeight.bold },
})
