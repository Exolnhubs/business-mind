import { NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { optionalAuth } from '@/lib/auth'
import { handleApiError, ok, NotFoundException } from '@/lib/errors'

// GET /api/communities/:slug — community detail
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params
    const supabase = await createSupabaseServerClient()
    const ctx      = await optionalAuth()

    const { data: community, error } = await supabase
      .from('communities')
      .select('*')
      .eq('slug', slug)
      .single()

    if (error || !community) throw new NotFoundException('Community not found')

    // Event count
    const { count: eventCount } = await supabase
      .from('event_communities')
      .select('event_id', { count: 'exact', head: true })
      .eq('community_id', community.id)

    // Ancestors (parent communities via hierarchy)
    const { data: hierarchyRows } = await supabase
      .from('community_hierarchy')
      .select('parent_id')
      .eq('child_id', community.id)
      .order('depth')

    let ancestors: unknown[] = []
    if (hierarchyRows?.length) {
      const parentIds = hierarchyRows.map((r) => r.parent_id)
      const { data: parents } = await supabase
        .from('communities')
        .select('id, name, name_ar, slug, level')
        .in('id', parentIds)
      ancestors = parents ?? []
    }

    // Membership status
    let is_member = false
    if (ctx?.userId) {
      const { data: mem } = await supabase
        .from('community_memberships')
        .select('id')
        .eq('community_id', community.id)
        .eq('user_id', ctx.userId)
        .maybeSingle()
      is_member = !!mem
    }

    // 5 recent upcoming events
    const { data: ecRows } = await supabase
      .from('event_communities')
      .select('event_id')
      .eq('community_id', community.id)
      .limit(20)

    let recent_events: unknown[] = []
    if (ecRows?.length) {
      const eIds = ecRows.map((r) => r.event_id)
      const { data: events } = await supabase
        .from('events')
        .select('id, title, title_ar, cover_image_url, start_at, city, is_free, price, currency, bookings_count')
        .in('id', eIds)
        .eq('is_published', true)
        .eq('is_cancelled', false)
        .gte('start_at', new Date().toISOString())
        .order('start_at', { ascending: true })
        .limit(5)
      recent_events = events ?? []
    }

    return ok({
      ...community,
      is_member,
      event_count: eventCount ?? 0,
      ancestors,
      recent_events,
    })
  } catch (err) {
    return handleApiError(err)
  }
}
