import { NextRequest } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/auth'
import { handleApiError, ok } from '@/lib/errors'

// GET /api/admin/support?status=open&page=1
export async function GET(req: NextRequest) {
  try {
    await requireAdmin()
    const admin  = createSupabaseAdminClient()
    const status = req.nextUrl.searchParams.get('status') ?? 'open'
    const page   = Number(req.nextUrl.searchParams.get('page') ?? 1)
    const limit  = 25
    const from   = (page - 1) * limit

    const { data, count } = await (admin as any)
      .from('support_tickets')
      .select(
        `id, ticket_number, category, subject, description, status,
         admin_notes, created_at, updated_at,
         user:profiles!user_id(id, display_name, email:id)`,
        { count: 'exact' }
      )
      .eq('status', status)
      .order('created_at', { ascending: false })
      .range(from, from + limit - 1)

    return ok({ data: data ?? [], total: count ?? 0, page, limit })
  } catch (err) {
    return handleApiError(err)
  }
}
