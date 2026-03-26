import { NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth'
import { handleApiError, ok } from '@/lib/errors'

// GET /api/admin/organizers — list pending / all organizer applications
export async function GET(req: NextRequest) {
  try {
    await requireAdmin()
    const supabase = await createSupabaseServerClient()

    const status = req.nextUrl.searchParams.get('status') ?? 'pending'
    const page = Number(req.nextUrl.searchParams.get('page') ?? 1)
    const perPage = Number(req.nextUrl.searchParams.get('per_page') ?? 20)
    const from = (page - 1) * perPage

    const { data, count, error } = await supabase
      .from('organizer_profiles')
      .select(
        `*, user:profiles!user_id(id, display_name, avatar_url, city, created_at)`,
        { count: 'exact' }
      )
      .eq('status', status as import('@/types/database').OrganizerStatus)
      .order('created_at', { ascending: true })
      .range(from, from + perPage - 1)

    if (error) throw error

    return ok({ data, total: count ?? 0, page, per_page: perPage })
  } catch (err) {
    return handleApiError(err)
  }
}
