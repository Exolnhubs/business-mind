import { useEffect, useState } from 'react'
import { AppState, Platform } from 'react-native'
import { Stack, useRouter, useSegments } from 'expo-router'
import * as Linking from 'expo-linking'
import { StatusBar } from 'expo-status-bar'
import * as SplashScreen from 'expo-splash-screen'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { AuthProvider, useAuth } from '@/contexts/auth-context'
import { LocaleProvider } from '@/contexts/locale-context'
import { NotificationProvider } from '@/contexts/notification-context'
import { AnimatedSplash } from '@/components/ui/AnimatedSplash'
import { supabase } from '@/lib/supabase'

SplashScreen.preventAutoHideAsync()

// Create Android notification channel with HIGH importance so FCM delivers
// notifications immediately without batching them.
if (Platform.OS === 'android') {
  const Notifications = require('expo-notifications') as typeof import('expo-notifications')
  Notifications.setNotificationChannelAsync('default', {
    name: 'Default',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#7C3AED',
  })
}

// Notification type → deep-link route
function routeForNotifType(type: string, role?: string): string {
  switch (type) {
    case 'booking_confirmed':
    case 'booking_cancelled':
    case 'waitlist_promoted':
    case 'event_reminder':
      return '/(tabs)/bookings'
    case 'new_follower':
    case 'new_review':
    case 'organizer_approved':
    case 'organizer_rejected':
    case 'organizer_suspended':
      return '/(tabs)/profile'
    case 'tip_received':
    case 'new_attendee':
    case 'event_sold_out':
      return role === 'organizer' ? '/organizer/dashboard' : '/(tabs)/profile'
    default:
      return '/(tabs)/notifications'
  }
}

function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, profile, loading } = useAuth()
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

    if (user && !inAuthGroup && !inOnboarding) {
      // Wait for profile to load before deciding on onboarding
      if (profile === null) return
      if (!profile.gender) {
        router.replace('/onboarding')
        return
      }
    }

    if (user && inAuthGroup) {
      if (profile === null) return
      if (!profile.gender) {
        router.replace('/onboarding')
      } else {
        router.replace('/(tabs)/home')
      }
    }
  }, [user, profile, loading, segments])

  useEffect(() => {
    if (!loading) SplashScreen.hideAsync()
  }, [loading])

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

    // expo-notifications is unavailable on Android Expo Go (SDK 53+)
    const IS_EXPO_GO = require('expo-constants').default.executionEnvironment === 'storeClient'
    const IS_ANDROID_EXPO_GO = IS_EXPO_GO && Platform.OS === 'android'
    if (IS_ANDROID_EXPO_GO) return

    const Notifications = require('expo-notifications') as typeof import('expo-notifications')
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as Record<string, unknown>
      const type = data?.type as string ?? ''
      const route = routeForNotifType(type, profile?.role)
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

  return (
    <SafeAreaProvider>
      <LocaleProvider>
        <AuthProvider>
          <NotificationProvider>
            <AuthGate>
              <StatusBar style={splashDone ? 'dark' : 'light'} />
              <Stack screenOptions={{ headerShown: false }}>
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
              {!splashDone && <AnimatedSplash onFinish={() => setSplashDone(true)} />}
            </AuthGate>
          </NotificationProvider>
        </AuthProvider>
      </LocaleProvider>
    </SafeAreaProvider>
  )
}
