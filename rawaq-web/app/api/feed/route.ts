import { NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/auth'
import { handleApiError, ok } from '@/lib/errors'

const PAGE_SIZE = 12

// GET /api/feed — upcoming events from organizers the user follows
export async function GET(req: NextRequest) {
  try {
    const ctx = await requireAuth()
    const supabase = await createSupabaseServerClient()

    const page = Math.max(1, Number(req.nextUrl.searchParams.get('page') ?? 1))
    const from = (page - 1) * PAGE_SIZE
    const to   = from + PAGE_SIZE - 1

    // Get organizer IDs the user follows
    const { data: follows } = await supabase
      .from('organizer_follows')
      .select('organizer_id')
      .eq('follower_id', ctx.userId)

    const orgIds = (follows ?? []).map((f) => f.organizer_id)

    if (orgIds.length === 0) {
      return ok({ data: [], total: 0, page, per_page: PAGE_SIZE, following_count: 0 })
    }

    const { data, count, error } = await supabase
      .from('events')
      .select(`
        *,
        organizer:profiles!organizer_id(
          id, display_name, avatar_url,
          organizer_profile:organizer_profiles!user_id(business_name, business_name_ar, logo_url, verified)
        ),
        category:event_categories(id, name_en, name_ar, icon)
      `, { count: 'exact' })
      .in('organizer_id', orgIds)
      .eq('is_published', true)
      .eq('is_cancelled', false)
      .gte('start_at', new Date().toISOString())
      .order('start_at', { ascending: true })
      .range(from, to)

    if (error) throw error

    return ok({
      data:             data ?? [],
      total:            count ?? 0,
      page,
      per_page:         PAGE_SIZE,
      following_count:  orgIds.length,
    })
  } catch (err) {
    return handleApiError(err)
  }
}
