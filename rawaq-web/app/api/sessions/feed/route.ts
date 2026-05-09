import { NextRequest } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireAuth } from '@/lib/auth'
import { handleApiError, ok } from '@/lib/errors'
import { applyResolvedEventWindow, compareEventsByResolvedStartAt } from '@/lib/events/recurrence'

const SESSION_SELECT = `
  id, title, title_ar, cover_image_url, start_at, end_at,
  event_frequency, recurrence_until, venue_name, city, country,
  is_free, price, currency, capacity, bookings_count, organizer_type,
  organizer_id, category_id, is_published, is_cancelled,
  organizer:profiles!organizer_id(
    id, display_name, avatar_url,
    organizer_profile:organizer_profiles!user_id(business_name, business_name_ar, logo_url, verified, organizer_type)
  ),
  category:event_categories(id, name_en, name_ar, icon),
  ticket_types(id, price, is_free, is_active, is_hot_offer, hot_offer_price, hot_offer_ends_at)
`.trim()

// GET /api/sessions/feed
// Returns upcoming individual-host sessions from the viewer's active communities.
// Optional ?community=<slug> to scope to a single community (public, no auth required).
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl
    const communitySlug = searchParams.get('community')
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '50', 10), 100)
    const cursor = searchParams.get('cursor') // ISO timestamp — for pagination

    const admin = createSupabaseAdminClient()
    const now = new Date().toISOString()

    // ── Community-scoped query (public, no auth) ──────────────
    if (communitySlug) {
      const { data: community } = await admin
        .from('communities')
        .select('id')
        .eq('slug', communitySlug)
        .maybeSingle()

      if (!community) return ok({ data: [] })

      const { data: ecRows } = await admin
        .from('event_communities')
        .select('event_id')
        .eq('community_id', community.id)

      const eventIds = (ecRows ?? []).map((r) => r.event_id)
      if (!eventIds.length) return ok({ data: [] })

      const q = admin
        .from('events')
        .select(SESSION_SELECT)
        .in('id', eventIds)
        .eq('organizer_type', 'individual')
        .eq('is_published', true)
        .eq('is_cancelled', false)
        .or(`start_at.gte.${now},and(event_frequency.neq.one_time,recurrence_until.gte.${now})`)
        .order('start_at', { ascending: true })
        .limit(limit)

      const { data, error } = await q
      if (error) throw error

      const sessions = ((data ?? []) as unknown[])
        .map((s) => applyResolvedEventWindow(s as Parameters<typeof applyResolvedEventWindow>[0]))
        .filter((s) => new Date((s as { start_at: string }).start_at).getTime() >= new Date(now).getTime())

      return ok({ data: sessions })
    }

    // ── Feed query: all member communities (requires auth) ────
    const ctx = await requireAuth()

    const { data: memberships } = await admin
      .from('community_memberships')
      .select('community_id')
      .eq('user_id', ctx.userId)
      .eq('status', 'active')

    const communityIds = (memberships ?? []).map((m) => m.community_id)
    if (!communityIds.length) return ok({ data: [] })

    const { data: ecRows } = await admin
      .from('event_communities')
      .select('event_id')
      .in('community_id', communityIds)

    const eventIds = [...new Set((ecRows ?? []).map((r) => r.event_id))]
    if (!eventIds.length) return ok({ data: [] })

    const { data, error } = await admin
      .from('events')
      .select(SESSION_SELECT)
      .in('id', eventIds)
      .eq('organizer_type', 'individual')
      .eq('is_published', true)
      .eq('is_cancelled', false)
      .or(`start_at.gte.${cursor ?? now},and(event_frequency.neq.one_time,recurrence_until.gte.${now})`)
      .order('start_at', { ascending: true })
      .limit(limit)

    if (error) throw error

    const sessions = ((data ?? []) as unknown[])
      .map((s) => applyResolvedEventWindow(s as Parameters<typeof applyResolvedEventWindow>[0]))
      .filter((s) => new Date((s as { start_at: string }).start_at).getTime() >= new Date(cursor ?? now).getTime())
      .sort((a, b) => compareEventsByResolvedStartAt(
        a as Parameters<typeof compareEventsByResolvedStartAt>[0],
        b as Parameters<typeof compareEventsByResolvedStartAt>[1],
      ))

    // next_cursor: start_at of the last item for pagination
    const lastSession = sessions[sessions.length - 1] as { start_at?: string } | undefined
    const next_cursor = sessions.length === limit ? (lastSession?.start_at ?? null) : null

    return ok({ data: sessions, next_cursor })
  } catch (err) {
    return handleApiError(err)
  }
}
