import { useEffect, useState } from 'react'
import { AppState } from 'react-native'
import { Stack, useRouter, useSegments } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import * as SplashScreen from 'expo-splash-screen'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { AuthProvider, useAuth } from '@/contexts/auth-context'
import { LocaleProvider } from '@/contexts/locale-context'
import { AnimatedSplash } from '@/components/ui/AnimatedSplash'
import { supabase } from '@/lib/supabase'

SplashScreen.preventAutoHideAsync()

function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const segments = useSegments()
  const router = useRouter()

  useEffect(() => {
    if (loading) return

    const inAuthGroup = segments[0] === '(auth)'

    if (!user && !inAuthGroup) {
      router.replace('/(auth)/login')
    } else if (user && inAuthGroup) {
      router.replace('/(tabs)/home')
    }
  }, [user, loading, segments])

  useEffect(() => {
    if (!loading) SplashScreen.hideAsync()
  }, [loading])

  return <>{children}</>
}

// Manage Supabase token refresh in sync with app foreground/background state.
// With autoRefreshToken: false in supabase.ts, refreshes only run when the
// app is active — preventing the unhandled AuthApiError on invalid tokens.
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
          <AuthGate>
            <StatusBar style={splashDone ? 'dark' : 'light'} />
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="(auth)" />
              <Stack.Screen name="(tabs)" />
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
        </AuthProvider>
      </LocaleProvider>
    </SafeAreaProvider>
  )
}
