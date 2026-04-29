import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

let _cacheClient: ReturnType<typeof createClient<Database>> | null = null

export function createSupabaseCacheClient() {
  if (_cacheClient) return _cacheClient

  _cacheClient = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  return _cacheClient
}
