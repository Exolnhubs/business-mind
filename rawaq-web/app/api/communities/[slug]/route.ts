import { NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { optionalAuth } from '@/lib/auth'
import { handleApiError, ok, NotFoundException } from '@/lib/errors'
import type { Community, CommunityHierarchy } from '@/types/database'

// GET /api/communities/:slug — community detail
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params
    const supabase = await createSupabaseServerClient()
    const admin    = createSupabaseAdminClient()
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

    let ancestors: Pick<Community, 'id' | 'name' | 'name_ar' | 'slug' | 'level'>[] = []
    if (hierarchyRows?.length) {
      const parentIds = (hierarchyRows as Pick<CommunityHierarchy, 'parent_id'>[]).map((r) => r.parent_id)
      const { data: parents } = await supabase
        .from('communities')
        .select('id, name, name_ar, slug, level')
        .in('id', parentIds)
      ancestors = parents ?? []
    }

    // Membership status
    let is_member = false
    let member_role: 'member' | 'community_admin' | 'owner' | null = null
    let member_status: 'active' | 'timed_out' | 'removed' | 'banned' | null = null
    if (ctx?.userId) {
      const { data: mem } = await admin
        .from('community_memberships')
        .select('id, role, status')
        .eq('community_id', community.id)
        .eq('user_id', ctx.userId)
        .maybeSingle()
      is_member = !!mem && mem.status !== 'removed' && mem.status !== 'banned'
      member_role = (mem?.role as 'member' | 'community_admin' | 'owner' | undefined) ?? null
      member_status = (mem?.status as 'active' | 'timed_out' | 'removed' | 'banned' | undefined) ?? null
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
        .select('id, title, title_ar, cover_image_url, start_at, city, is_free, price, currency, bookings_count, created_at')
        .in('id', eIds)
        .eq('is_published', true)
        .eq('is_cancelled', false)
        .gte('start_at', new Date().toISOString())
        .order('start_at', { ascending: true })
        .limit(5)
      recent_events = events ?? []
    }

    const { data: membershipRows } = await admin
      .from('community_memberships')
      .select('user_id, joined_at')
      .eq('community_id', community.id)
      .eq('status', 'active')
      .order('joined_at', { ascending: false })
      .limit(8)

    const memberIds = (membershipRows ?? []).map((row) => row.user_id)
    let recent_members: Array<{ id: string; display_name: string; avatar_url: string | null; joined_at: string }> = []
    if (memberIds.length > 0) {
      const { data: profiles } = await admin
        .from('profiles')
        .select('id, display_name, avatar_url')
        .in('id', memberIds)

      const profileById = new Map((profiles ?? []).map((profile) => [profile.id, profile]))
      recent_members = (membershipRows ?? [])
        .map((row) => {
          const profile = profileById.get(row.user_id)
          if (!profile) return null
          return {
            id: profile.id,
            display_name: profile.display_name,
            avatar_url: profile.avatar_url,
            joined_at: row.joined_at,
          }
        })
        .filter(Boolean) as Array<{ id: string; display_name: string; avatar_url: string | null; joined_at: string }>
    }

    const activity: Array<{ id: string; type: 'member_joined' | 'event_published'; title: string; subtitle: string; created_at: string; href: string | null }> = []

    for (const member of recent_members.slice(0, 4)) {
      activity.push({
        id: `member-${member.id}-${member.joined_at}`,
        type: 'member_joined',
        title: member.display_name,
        subtitle: 'Joined this community',
        created_at: member.joined_at,
        href: null,
      })
    }

    for (const event of (recent_events as Array<{ id: string; title: string; created_at?: string; start_at: string }>).slice(0, 4)) {
      activity.push({
        id: `event-${event.id}`,
        type: 'event_published',
        title: event.title,
        subtitle: 'Event published in this community',
        created_at: event.created_at ?? event.start_at,
        href: `/events/${event.id}`,
      })
    }

    activity.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

    return ok({
      ...community,
      is_member,
      member_role,
      member_status,
      event_count: eventCount ?? 0,
      ancestors,
      recent_events,
      recent_members,
      activity: activity.slice(0, 6),
    })
  } catch (err) {
    return handleApiError(err)
  }
}
