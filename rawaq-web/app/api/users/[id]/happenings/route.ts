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
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

    let query = (admin as any)
      .from('happenings')
      .select('id, body, created_at, expires_at, community_id, communities(name, slug), reactions:happening_reactions(count), rsvps:happening_rsvps(count)')
      .eq('author_id', id)
      .or(`expires_at.gt.${new Date().toISOString()},created_at.gt.${thirtyDaysAgo}`)
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
