import { NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth'
import { handleApiError, ok } from '@/lib/errors'

// GET /api/admin/audit-logs?action=ban_user&page=1
export async function GET(req: NextRequest) {
  try {
    await requireAdmin()
    const supabase = await createSupabaseServerClient()

    const action = req.nextUrl.searchParams.get('action')
    const page   = Number(req.nextUrl.searchParams.get('page') ?? 1)
    const per    = 30
    const from   = (page - 1) * per

    let query = supabase
      .from('audit_logs')
      .select(
        `id, action, target_type, target_id, meta, created_at,
         admin:profiles!admin_id(id, display_name, avatar_url)`,
        { count: 'exact' }
      )
      .order('created_at', { ascending: false })
      .range(from, from + per - 1)

    if (action) query = query.eq('action', action)

    const { data, count, error } = await query
    if (error) throw error

    return ok({ data, total: count ?? 0, page, per_page: per })
  } catch (err) {
    return handleApiError(err)
  }
}
