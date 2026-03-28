import { useEffect } from 'react'
import { View, ActivityIndicator } from 'react-native'
import { useRouter, useLocalSearchParams } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { Colors } from '@/theme'

export default function AuthCallbackScreen() {
  const router = useRouter()
  const params = useLocalSearchParams<{ code?: string; error?: string; error_description?: string }>()

  useEffect(() => {
    async function handleCallback() {
      const code = params.code ? String(params.code) : null
      if (code) {
        await supabase.auth.exchangeCodeForSession(code)
      }
      // Whether it succeeded or failed, go to home — AuthGate will
      // redirect back to login if there's no valid session
      router.replace('/(tabs)/home')
    }
    handleCallback()
  }, [])

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' }}>
      <ActivityIndicator size="large" color={Colors.brand[500]} />
    </View>
  )
}
