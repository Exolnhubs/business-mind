import { requireAuth } from '@/lib/auth'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { handleApiError, ok } from '@/lib/errors'

// GET /api/support/my-reports
// Returns all event reports filed by the authenticated user,
// including event title for AI-side name matching.
export async function GET() {
  try {
    const ctx   = await requireAuth()
    const admin = createSupabaseAdminClient()

    const { data } = await admin
      .from('event_reports')
      .select(`
        id,
        reason,
        status,
        public_response,
        created_at,
        events ( id, title )
      `)
      .eq('reporter_id', ctx.userId)
      .order('created_at', { ascending: false })

    return ok(data ?? [])
  } catch (err) {
    return handleApiError(err)
  }
}
