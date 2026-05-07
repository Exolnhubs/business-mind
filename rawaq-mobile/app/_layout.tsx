import { useCallback, useEffect, useState } from 'react'
import { AppState, Platform, I18nManager } from 'react-native'

// Prevent the device OS language from forcing RTL on the entire layout.
// The app manages its own direction via LocaleProvider.
I18nManager.allowRTL(false)
import { Stack, usePathname, useRouter, useSegments } from 'expo-router'
import * as Linking from 'expo-linking'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { StatusBar } from 'expo-status-bar'
import * as SplashScreen from 'expo-splash-screen'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { AuthProvider, useAuth } from '@/contexts/auth-context'
import { apiGet } from '@/lib/api'
import { LocaleProvider } from '@/contexts/locale-context'
import { NotificationProvider } from '@/contexts/notification-context'
import { NavigationLoaderProvider, useNavigationLoader } from '@/contexts/navigation-loader-context'
import { AnimatedSplash } from '@/components/ui/AnimatedSplash'
import { EasUpdateGate } from '@/components/system/EasUpdateGate'
import { ErrorToastHost } from '@/components/feedback/ErrorToast'
import { supabase } from '@/lib/supabase'

SplashScreen.preventAutoHideAsync()

// expo-notifications push support was removed from Android Expo Go in SDK 53.
// Requiring the module at all on that platform triggers a fatal side-effect in
// DevicePushTokenAutoRegistration.fx.js, so we must gate every require() on this flag.
const IS_EXPO_GO = (require('expo-constants') as typeof import('expo-constants')).default.executionEnvironment === 'storeClient'

// Create Android notification channel with HIGH importance so FCM delivers
// notifications immediately without batching them.
// Not needed (and not safe) inside Expo Go — skip it there.
if (Platform.OS === 'android' && !IS_EXPO_GO) {
  const Notifications = require('expo-notifications') as typeof import('expo-notifications')
  Notifications.setNotificationChannelAsync('default', {
    name: 'Default',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#7C3AED',
  })
}

// Notification type + payload → deep-link route (push tap handler)
function routeForNotifType(type: string, data: Record<string, unknown>, role?: string): string {
  const eventId       = typeof data.event_id       === 'string' ? data.event_id       : null
  const actorId       = typeof data.actor_id       === 'string' ? data.actor_id       : null
  const communitySlug = typeof data.community_slug === 'string' ? data.community_slug : null
  const bookingId     = typeof data.booking_id     === 'string' ? data.booking_id     : null

  switch (type) {
    case 'booking_confirmed':
      return bookingId ? `/bookings/${bookingId}/ticket` : '/(tabs)/bookings'
    case 'booking_cancelled':
    case 'waitlist_promoted':
    case 'event_cancelled':
      return '/(tabs)/bookings'
    case 'event_reminder':
    case 'comment_reply':
    case 'mention':
    case 'new_comment':
    case 'event_updated':
    case 'new_event_published':
    case 'community_new_event':
      return eventId ? `/events/${eventId}` : '/(tabs)/home'
    case 'community_happening':
      return communitySlug ? `/communities/${communitySlug}` : '/(tabs)/home'
    case 'organizer_approved':
      return '/organizer/dashboard'
    case 'organizer_rejected':
    case 'organizer_suspended':
    case 'new_review':
      return '/(tabs)/profile'
    case 'tip_received':
      return '/organizer/earnings'
    case 'new_attendee':
    case 'event_sold_out':
      return role === 'organizer' ? '/organizer/dashboard' : '/(tabs)/home'
    case 'new_follower':
    case 'follow_request':
    case 'follow_accepted':
    case 'say_hi':
      return actorId ? `/user/${actorId}` : '/(tabs)/notifications'
    case 'referral_signup_reward':
    case 'referral_conversion_reward':
      return '/referral'
    default:
      return '/(tabs)/notifications'
  }
}

// Capture ?ref= from rawaq://invite deep links before the user logs in.
// Stored in AsyncStorage; auth-context claims it on SIGNED_IN.
function captureReferralFromUrl(url: string) {
  try {
    if (!url.includes('invite')) return
    const parsed = new URL(url)
    const ref = parsed.searchParams.get('ref')
    if (ref) AsyncStorage.setItem('rawaq_referral_code', ref.toUpperCase().trim()).catch(() => {})
  } catch { /* invalid URL — ignore */ }
}

function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, profile, profileError, profileLoading, loading } = useAuth()
  const segments = useSegments()
  const router = useRouter()

  useEffect(() => {
    if (loading) return

    const inAuthGroup  = segments[0] === '(auth)' || segments[0] === 'auth'
    const inOnboarding = segments[0] === 'onboarding'

    if (!user && !inAuthGroup) {
      router.replace('/(auth)/login')
      return
    }

    if (user && profileLoading) return

    if (user && !profile && profileError) {
      console.warn('[auth-gate] profile unavailable; staying on current route', profileError)
      return
    }

    if (user && !inAuthGroup && !inOnboarding) {
      if (profile && !profile.gender) {
        router.replace('/onboarding')
        return
      }
    }

    if (user && inAuthGroup) {
      if (!profile) return
      if (!profile.gender) {
        router.replace('/onboarding')
      } else {
        router.replace('/(tabs)/home')
      }
    }
  }, [user, profile, profileError, profileLoading, loading, segments])

  useEffect(() => {
    if (!loading) SplashScreen.hideAsync()
  }, [loading])

  // Handle rawaq://invite?ref=CODE deep link — store code for post-login claim
  useEffect(() => {
    async function handleInitialUrl() {
      const initial = await Linking.getInitialURL()
      if (initial) captureReferralFromUrl(initial)
    }
    handleInitialUrl()

    const sub = Linking.addEventListener('url', ({ url }) => captureReferralFromUrl(url))
    return () => sub.remove()
  }, [])

  // Handle rawaq://payment-result deep link when app was backgrounded
  // (covers the edge case where openAuthSessionAsync didn't intercept it)
  useEffect(() => {
    if (!user) return
    const sub = Linking.addEventListener('url', ({ url }) => {
      if (!url.startsWith('rawaq://payment-result')) return
      const parsed    = new URL(url)
      const bookingId = parsed.searchParams.get('booking_id')
      const transactionId = parsed.searchParams.get('transaction_id')
      const entity = parsed.searchParams.get('entity')
      const status    = parsed.searchParams.get('status')
      if (bookingId && status === 'success') {
        router.push(`/bookings/${bookingId}/ticket` as any)
      } else if (transactionId && entity === 'subscription') {
        router.push('/plans' as any)
      } else if (transactionId && entity === 'donation') {
        router.push('/(tabs)/home' as any)
      } else if (bookingId) {
        router.push('/(tabs)/bookings' as any)
      }
    })
    return () => sub.remove()
  }, [user])

  // Push notification tap → navigate to the relevant screen
  useEffect(() => {
    if (!user) return

    if (IS_EXPO_GO && Platform.OS === 'android') return

    const Notifications = require('expo-notifications') as typeof import('expo-notifications')
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as Record<string, unknown>
      const type = data?.type as string ?? ''
      const route = routeForNotifType(type, data, profile?.role)
      router.push(route as any)
    })
    return () => subscription.remove()
  }, [user, profile?.role])

  return <>{children}</>
}

// Manage Supabase token refresh in sync with app foreground/background state.
AppState.addEventListener('change', (state) => {
  if (state === 'active') {
    supabase.auth.startAutoRefresh()
  } else {
    supabase.auth.stopAutoRefresh()
  }
})

export default function RootLayout() {
  const [splashDone, setSplashDone] = useState(false)
  const handleSplashDone = useCallback(() => setSplashDone(true), [])

  // Prefetch the primary data for every tab so the cache is warm before the
  // user taps away from home. All calls are silent (no error toasts) and
  // use a 5-minute TTL that matches the server-side cache.
  useEffect(() => {
    const TTL = 300_000
    const opts = { ttlMs: TTL, silent: true }
    void apiGet('/api/events/featured', opts)
    void apiGet('/api/events', opts)
    void apiGet('/api/happenings/discover?limit=20', opts)
    void apiGet('/api/happenings/active?limit=10', opts)
    void apiGet('/api/communities?per_page=15', opts)
    void apiGet('/api/organizer/request', opts)
  }, [])

  return (
    <SafeAreaProvider>
      <LocaleProvider>
        <AuthProvider>
          <NotificationProvider>
            <NavigationLoaderProvider>
              <EasUpdateGate />
              <AuthGate>
                <AppNavigator
                  splashDone={splashDone}
                  onSplashDone={handleSplashDone}
                />
              </AuthGate>
            </NavigationLoaderProvider>
          </NotificationProvider>
        </AuthProvider>
        <ErrorToastHost />
      </LocaleProvider>
    </SafeAreaProvider>
  )
}

function AppNavigator({
  splashDone,
  onSplashDone,
}: {
  splashDone: boolean
  onSplashDone: () => void
}) {
  const pathname = usePathname()
  const { beginNavigation, endNavigation, resetNavigation } = useNavigationLoader()

  useEffect(() => {
    resetNavigation()
  }, [pathname, resetNavigation])

  return (
    <>
      <StatusBar style={splashDone ? 'dark' : 'light'} />
      <Stack
        screenOptions={{ headerShown: false }}
        screenListeners={splashDone ? {
          transitionStart: () => beginNavigation(),
          transitionEnd: () => endNavigation(),
        } : {}}
      >
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="auth/callback" options={{ headerShown: false }} />
        <Stack.Screen
          name="events/[id]"
          options={{
            headerShown: true,
            headerTitle: '',
            headerBackTitle: 'Back',
            headerTransparent: true,
          }}
        />
        <Stack.Screen
          name="discover"
          options={{ headerShown: false, presentation: 'card' }}
        />
      </Stack>
      {!splashDone && <AnimatedSplash onFinish={onSplashDone} />}
    </>
  )
}
