import { useEffect } from 'react'
import { View } from 'react-native'
import { useRouter, useLocalSearchParams } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { TicketFlipLoader } from '@/components/ui/TicketFlipLoader'

export default function AuthCallbackScreen() {
  const router = useRouter()
  const params = useLocalSearchParams<{
    code?: string
    access_token?: string
    refresh_token?: string
    error?: string
    error_description?: string
  }>()

  useEffect(() => {
    async function handleCallback() {
      const code         = params.code         ? String(params.code)          : null
      const accessToken  = params.access_token  ? String(params.access_token)  : null
      const refreshToken = params.refresh_token ? String(params.refresh_token) : null

      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code)
        if (error) router.replace('/(auth)/login')
        // On success: onAuthStateChange fires → AuthGate navigates to home
        return
      } else if (accessToken && refreshToken) {
        const { error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
        if (error) router.replace('/(auth)/login')
        return
      }

      // No credentials at all
      router.replace('/(auth)/login')
    }
    handleCallback()
  }, [])

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' }}>
      <TicketFlipLoader size="md" label="Signing you in…" />
    </View>
  )
}
