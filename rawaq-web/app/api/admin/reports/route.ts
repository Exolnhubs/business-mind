import { NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth'
import { handleApiError, ok } from '@/lib/errors'

// GET /api/admin/reports?status=pending&page=1
export async function GET(req: NextRequest) {
  try {
    await requireAdmin()
    const supabase = await createSupabaseServerClient()

    const status = req.nextUrl.searchParams.get('status') ?? 'pending'
    const page   = Number(req.nextUrl.searchParams.get('page') ?? 1)
    const per    = 20
    const from   = (page - 1) * per

    let query = supabase
      .from('event_reports')
      .select(
        `id, reason, details, status, resolution_note, created_at, resolved_at,
         event:events!event_id(id, title, is_published, is_cancelled),
         reporter:profiles!reporter_id(id, display_name),
         resolver:profiles!resolved_by(id, display_name)`,
        { count: 'exact' }
      )
      .order('created_at', { ascending: false })
      .range(from, from + per - 1)

    if (status !== 'all') query = query.eq('status', status)

    const { data, count, error } = await query
    if (error) throw error

    return ok({ data, total: count ?? 0, page, per_page: per })
  } catch (err) {
    return handleApiError(err)
  }
}
