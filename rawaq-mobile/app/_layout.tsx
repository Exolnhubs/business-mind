import { useEffect, useState } from 'react'
import { AppState, Platform } from 'react-native'
import { Stack, useRouter, useSegments } from 'expo-router'
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

    const inAuthGroup = segments[0] === '(auth)' || segments[0] === 'auth'

    if (!user && !inAuthGroup) {
      router.replace('/(auth)/login')
    } else if (user && inAuthGroup) {
      router.replace('/(tabs)/home')
    }
  }, [user, loading, segments])

  useEffect(() => {
    if (!loading) SplashScreen.hideAsync()
  }, [loading])

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
