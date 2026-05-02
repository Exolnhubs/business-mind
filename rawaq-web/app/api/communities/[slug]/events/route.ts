import { NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { handleApiError, ok, NotFoundException } from '@/lib/errors'
import { z } from 'zod'
import { applyResolvedEventWindow, compareEventsByResolvedStartAt } from '@/lib/events/recurrence'

const Schema = z.object({
  cursor:   z.string().datetime().optional(),
  per_page: z.coerce.number().int().min(1).max(50).default(20),
  status:   z.enum(['upcoming', 'past']).default('upcoming'),
})

// GET /api/communities/:slug/events — paginated events in a community
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params
    const p = Schema.parse(Object.fromEntries(req.nextUrl.searchParams))

    const supabase = await createSupabaseServerClient()

    const { data: community, error: cErr } = await supabase
      .from('communities')
      .select('id')
      .eq('slug', slug)
      .single()

    if (cErr || !community) throw new NotFoundException('Community not found')

    // Get event IDs for this community
    const { data: ecRows } = await supabase
      .from('event_communities')
      .select('event_id')
      .eq('community_id', community.id)

    if (!ecRows?.length) {
      return ok({ events: [], next_cursor: null })
    }

    const eventIds = ecRows.map((r) => r.event_id)
    const query = supabase
      .from('events')
      .select(
        `id, title, title_ar, cover_image_url, start_at, end_at, event_frequency, recurrence_until, city,
         is_free, price, currency, bookings_count, capacity, visibility_type,
         organizer:profiles!organizer_id(id, display_name, avatar_url,
           organizer_profile:organizer_profiles!user_id(business_name, logo_url, verified)),
         category:event_categories(id, name_en, name_ar, icon),
         ticket_types(id, price, is_free, is_active, is_hot_offer, hot_offer_price, hot_offer_ends_at)`,
        { count: 'exact' }
      )
      .in('id', eventIds)
      .eq('is_published', true)
      .eq('is_cancelled', false)
      .limit(200)

    const { data: events, error } = await query
    if (error) throw error

    const cursorMs = new Date(p.cursor ?? new Date().toISOString()).getTime()
    const resolved = (events ?? [])
      .map((event) => applyResolvedEventWindow(event))
      .filter((event) => {
        const startMs = new Date(event.start_at).getTime()
        return p.status === 'upcoming' ? startMs >= cursorMs : startMs < cursorMs
      })
      .sort((left, right) => compareEventsByResolvedStartAt(left, right))

    const ordered = p.status === 'upcoming' ? resolved : [...resolved].reverse()
    const hasMore = ordered.length > p.per_page
    const slice   = ordered.slice(0, p.per_page)
    const next_cursor = hasMore ? slice[slice.length - 1]?.start_at ?? null : null

    return ok({ events: slice, next_cursor })
  } catch (err) {
    return handleApiError(err)
  }
}
