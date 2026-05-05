import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { User, Session } from '@supabase/supabase-js'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase } from '@/lib/supabase'
import { apiInvalidateAll, apiPost } from '@/lib/api'
import type { Profile } from '@/types/database'

const REFERRAL_STORAGE_KEY = 'rawaq_referral_code'

interface AuthContextValue {
  user: User | null
  profile: Profile | null
  session: Session | null
  loading: boolean
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser]       = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  async function fetchProfile(userId: string) {
    try {
      const { data } = await supabase.from('profiles').select('*').eq('id', userId).single()
      setProfile(data)
    } catch {
      setProfile(null)
    }
  }

  async function refreshProfile() {
    if (user) await fetchProfile(user.id)
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session }, error }) => {
      if (error) {
        // Invalid or expired refresh token — clear the broken session and
        // let the AuthGate redirect to login.
        apiInvalidateAll()
        await supabase.auth.signOut().catch(() => {})
        setLoading(false)
        return
      }
      setSession(session)
      setUser(session?.user ?? null)
      if (session?.user) fetchProfile(session.user.id)
      setLoading(false)
    }).catch(async () => {
      apiInvalidateAll()
      await supabase.auth.signOut().catch(() => {})
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'TOKEN_REFRESHED' && !session) {
        apiInvalidateAll()
        supabase.auth.signOut()
        return
      }
      if (event !== 'TOKEN_REFRESHED') {
        apiInvalidateAll()
      }
      setSession(session)
      setUser(session?.user ?? null)
      if (session?.user) fetchProfile(session.user.id)
      else setProfile(null)
      setLoading(false)

      // On first sign-in, check if a referral code was saved from a deep link
      if (event === 'SIGNED_IN' && session?.user) {
        AsyncStorage.getItem(REFERRAL_STORAGE_KEY).then((code) => {
          if (!code) return
          AsyncStorage.removeItem(REFERRAL_STORAGE_KEY)
          apiPost('/api/referral/claim', { code }).catch(() => {})
        }).catch(() => {})
      }
    })

    return () => subscription.unsubscribe()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <AuthContext.Provider value={{
      user, profile, session, loading,
      signOut: async () => {
        apiInvalidateAll()
        await supabase.auth.signOut()
      },
      refreshProfile,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be inside AuthProvider')
  return ctx
}
