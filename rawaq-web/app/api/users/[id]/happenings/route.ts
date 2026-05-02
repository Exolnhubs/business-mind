import { NextRequest } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { handleApiError, ok } from '@/lib/errors'

// GET /api/users/:id/happenings?limit=10&before=<ISO>
// Public — no auth required
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { searchParams } = new URL(req.url)
    const limit  = Math.min(Number(searchParams.get('limit') ?? '10'), 20)
    const before = searchParams.get('before')

    const admin = createSupabaseAdminClient()

    // happenings are ephemeral — cleanup cron deletes them 1h after expiry.
    // Show whatever is still in the DB (active + recently expired), newest first.
    let query = admin
      .from('happenings')
      .select('id, body, created_at, expires_at, community_id, communities(name, slug), reaction_count, rsvp_count')
      .eq('author_id', id)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (before) {
      query = query.lt('created_at', before)
    }

    const { data, error } = await query
    if (error) throw error

    return ok(data ?? [])
  } catch (err) {
    return handleApiError(err)
  }
}
