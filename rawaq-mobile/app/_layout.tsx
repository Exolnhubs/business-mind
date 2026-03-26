import { useEffect } from 'react'
import { Stack, useRouter, useSegments } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import * as SplashScreen from 'expo-splash-screen'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { AuthProvider, useAuth } from '@/contexts/auth-context'
import { LocaleProvider } from '@/contexts/locale-context'

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

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <LocaleProvider>
        <AuthProvider>
          <AuthGate>
            <StatusBar style="dark" />
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
          </AuthGate>
        </AuthProvider>
      </LocaleProvider>
    </SafeAreaProvider>
  )
}
