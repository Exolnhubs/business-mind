import { createBrowserClient } from '@supabase/ssr'
import type { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

// @supabase/ssr 0.5.2 has a type-parameter mismatch with supabase-js 2.100.x.
// Cast to the properly-typed client so query results are inferred from Database.
type TypedClient = ReturnType<typeof createClient<Database>>

// Singleton for client components
let client: TypedClient | null = null

export function createSupabaseBrowserClient() {
  if (client) return client

  client = createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  ) as unknown as TypedClient

  return client
}
