import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

// Service-role client: bypasses RLS — use ONLY in trusted server code.
// Module-level singleton so the underlying HTTP connection is reused across
// requests within the same warm function instance, avoiding repeated TLS
// handshakes to Supabase on every API call.
let _adminClient: ReturnType<typeof createClient<Database>> | null = null

export function createSupabaseAdminClient() {
  if (_adminClient) return _adminClient

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    throw new Error('Missing Supabase admin credentials')
  }

  _adminClient = createClient<Database>(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
  return _adminClient
}
