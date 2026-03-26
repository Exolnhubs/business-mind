import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

// @supabase/ssr 0.5.2 has a type-parameter mismatch with supabase-js 2.100.x.
// The runtime behaviour is correct; we cast to the properly-typed client so
// that all query results are inferred from Database instead of resolving to never.
type TypedClient = ReturnType<typeof createClient<Database>>

// Use in Server Components, Route Handlers, Server Actions
export async function createSupabaseServerClient() {
  const cookieStore = await cookies()

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options as Parameters<typeof cookieStore.set>[2])
            )
          } catch {
            // Called from Server Component — cookie mutation ignored
          }
        },
      },
    }
  ) as unknown as TypedClient
}
