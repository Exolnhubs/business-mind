import 'react-native-url-polyfill/auto'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    // autoRefreshToken is set to false here and controlled manually via
    // AppState in app/_layout.tsx. This prevents the background refresh
    // timer from running when the app is inactive and avoids the unhandled
    // AuthApiError when a stored refresh token has been revoked.
    autoRefreshToken: false,
    persistSession: true,
    detectSessionInUrl: false,
  },
})
