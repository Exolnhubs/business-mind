import { NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { requireAuth, requireEventOwnership } from '@/lib/auth'
import { handleApiError, ok } from '@/lib/errors'

// GET /api/events/:id/attendees — organizer or admin only
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const ctx = await requireAuth()
    await requireEventOwnership(id, ctx)

    const page = Number(req.nextUrl.searchParams.get('page') ?? 1)
    const perPage = Number(req.nextUrl.searchParams.get('per_page') ?? 50)
    const from = (page - 1) * perPage

    const supabase = await createSupabaseServerClient()

    const { data, count, error } = await supabase
      .from('bookings')
      .select(
        `id, status, created_at,
         user:profiles!user_id(id, display_name, avatar_url, city)`,
        { count: 'exact' }
      )
      .eq('event_id', id)
      .order('created_at', { ascending: true })
      .range(from, from + perPage - 1)

    if (error) throw error

    return ok({ data, total: count ?? 0, page, per_page: perPage })
  } catch (err) {
    return handleApiError(err)
  }
}
