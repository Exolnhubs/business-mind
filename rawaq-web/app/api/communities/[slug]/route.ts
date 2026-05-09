import { NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { optionalAuth, requireAuth } from '@/lib/auth'
import { handleApiError, ok, NotFoundException, ForbiddenException } from '@/lib/errors'
import { requireCommunityOwner } from '@/lib/community-governance'
import type { Community, CommunityHierarchy } from '@/types/database'
import { z } from 'zod'
import { applyResolvedEventWindow, compareEventsByResolvedStartAt } from '@/lib/events/recurrence'

const UpdateCommunitySchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  name_ar: z.string().trim().max(100).nullable().optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  description_ar: z.string().trim().max(2000).nullable().optional(),
  city: z.string().trim().max(80).nullable().optional(),
  cover_url: z.string().trim().url().nullable().optional(),
  is_private: z.boolean().optional(),
  is_verified: z.boolean().optional(),
  approval_status: z.enum(['approved', 'pending', 'dismissed']).optional(),
})

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
    let viewerCity: string | null = null

    if (ctx?.userId) {
      const { data: viewerProfile } = await admin
        .from('profiles')
        .select('city')
        .eq('id', ctx.userId)
        .maybeSingle()
      viewerCity = viewerProfile?.city ?? null
    }

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
    let is_following = false
    let is_host = false
    let viewer_host_request_status: 'pending' | 'approved' | 'rejected' | null = null
    let viewer_is_individual_organizer = false
    let member_role: 'member' | 'community_admin' | 'owner' | null = null
    let member_status: 'active' | 'timed_out' | 'removed' | 'banned' | null = null
    if (ctx?.userId) {
      const [{ data: mem }, { data: follow }, { data: hostGrant }] = await Promise.all([
        admin
          .from('community_memberships')
          .select('id, role, status')
          .eq('community_id', community.id)
          .eq('user_id', ctx.userId)
          .maybeSingle(),
        admin
          .from('community_follows')
          .select('community_id')
          .eq('community_id', community.id)
          .eq('user_id', ctx.userId)
          .maybeSingle(),
        admin
          .from('community_hosts')
          .select('user_id')
          .eq('community_id', community.id)
          .eq('user_id', ctx.userId)
          .maybeSingle(),
      ])
      const [{ data: orgProfile }, hostReqResult] = await Promise.all([
        admin
          .from('organizer_profiles')
          .select('organizer_type, status, plan:plan_definitions(community_limit)')
          .eq('user_id', ctx.userId)
          .maybeSingle<{ organizer_type: string; status: string; plan: { community_limit: number | null } | null }>(),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (admin as any)
          .from('community_host_requests')
          .select('status')
          .eq('community_id', community.id)
          .eq('user_id', ctx.userId)
          .maybeSingle()
          .then(
            (res: { data: { status: string } | null }) => res.data,
            () => null,
          ) as Promise<{ status: string } | null>,
      ])
      is_member = !!mem && mem.status !== 'removed' && mem.status !== 'banned'
      is_following = !!follow
      is_host = !!hostGrant
      viewer_host_request_status = (hostReqResult?.status as 'pending' | 'approved' | 'rejected' | null) ?? null
      viewer_is_individual_organizer = orgProfile?.organizer_type === 'individual'
        && orgProfile?.status === 'approved'
      member_role = (mem?.role as 'member' | 'community_admin' | 'owner' | undefined) ?? null
      member_status = (mem?.status as 'active' | 'timed_out' | 'removed' | 'banned' | undefined) ?? null
    }

    // Quota counts for individual hosts — allows UI to preemptively disable "Request to host"
    let viewer_host_quota_reached = false
    let viewer_host_community_count = 0
    let viewer_host_community_limit: number | null = null

    if (viewer_is_individual_organizer && ctx?.userId) {
      const planLimit = (orgProfile as { plan: { community_limit: number | null } | null } | null)?.plan?.community_limit ?? 1
      const [{ count: activeHostCount }, { count: pendingReqCount }] = await Promise.all([
        admin
          .from('community_hosts')
          .select('community_id', { count: 'exact', head: true })
          .eq('user_id', ctx.userId),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (admin as any)
          .from('community_host_requests')
          .select('community_id', { count: 'exact', head: true })
          .eq('user_id', ctx.userId)
          .eq('status', 'pending'),
      ])
      const total = (activeHostCount ?? 0) + (pendingReqCount ?? 0)
      viewer_host_community_count = total
      viewer_host_community_limit = planLimit
      viewer_host_quota_reached = planLimit !== null && total >= planLimit
    }

    const canViewPendingCommunity = ctx?.role === 'admin'
      || community.owner_user_id === ctx?.userId
      || !!member_role
      || is_member

    if (community.approval_status && community.approval_status !== 'approved' && !canViewPendingCommunity) {
      throw new NotFoundException('Community not found')
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
        .select('id, title, title_ar, cover_image_url, start_at, end_at, event_frequency, recurrence_until, city, is_free, price, currency, bookings_count, created_at')
        .in('id', eIds)
        .eq('is_published', true)
        .eq('is_cancelled', false)
      recent_events = (events ?? [])
        .map((event) => applyResolvedEventWindow(event))
        .filter((event) => new Date(event.start_at).getTime() >= Date.now())
        .sort((left, right) => compareEventsByResolvedStartAt(left, right))
        .slice(0, 5)
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

    let city_members_preview: Array<{ id: string; display_name: string; avatar_url: string | null }> = []
    if (viewerCity) {
      const { data: cityProfiles } = await admin
        .from('profiles')
        .select('id, display_name, avatar_url')
        .ilike('city', viewerCity)
        .limit(25)

      const cityProfileIds = (cityProfiles ?? []).map((profile) => profile.id)
      if (cityProfileIds.length > 0) {
        const { data: cityMemberships } = await admin
          .from('community_memberships')
          .select('user_id')
          .eq('community_id', community.id)
          .eq('status', 'active')
          .in('user_id', cityProfileIds)

        const cityMemberIdSet = new Set((cityMemberships ?? []).map((row) => row.user_id))
        city_members_preview = (cityProfiles ?? [])
          .filter((profile) => cityMemberIdSet.has(profile.id))
          .filter((profile) => profile.id !== ctx?.userId)
          .slice(0, 3)
          .map((profile) => ({
            id: profile.id,
            display_name: profile.display_name,
            avatar_url: profile.avatar_url,
          }))
      }
    }

    const { data: timedOutMembershipRows } = await admin
      .from('community_memberships')
      .select('user_id, joined_at, timeout_until')
      .eq('community_id', community.id)
      .eq('status', 'timed_out')
      .order('timeout_until', { ascending: true })
      .limit(50)

    const timedOutMemberIds = (timedOutMembershipRows ?? []).map((row) => row.user_id)
    let timed_out_members: Array<{ id: string; display_name: string; avatar_url: string | null; joined_at: string; timeout_until: string | null }> = []
    if (timedOutMemberIds.length > 0) {
      const { data: timedOutProfiles } = await admin
        .from('profiles')
        .select('id, display_name, avatar_url')
        .in('id', timedOutMemberIds)

      const profileById = new Map((timedOutProfiles ?? []).map((profile) => [profile.id, profile]))
      timed_out_members = (timedOutMembershipRows ?? [])
        .map((row) => {
          const profile = profileById.get(row.user_id)
          if (!profile) return null
          return {
            id: profile.id,
            display_name: profile.display_name,
            avatar_url: profile.avatar_url,
            joined_at: row.joined_at,
            timeout_until: row.timeout_until,
          }
        })
        .filter(Boolean) as Array<{ id: string; display_name: string; avatar_url: string | null; joined_at: string; timeout_until: string | null }>
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
      is_following,
      is_host,
      viewer_host_request_status,
      viewer_is_individual_organizer,
      viewer_host_quota_reached,
      viewer_host_community_count,
      viewer_host_community_limit,
      member_role,
      member_status,
      event_count: eventCount ?? 0,
      ancestors,
      recent_events,
      recent_members,
      city_members_preview,
      viewer_city: viewerCity,
      timed_out_members,
      activity: activity.slice(0, 6),
    })
  } catch (err) {
    return handleApiError(err)
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params
    const input = UpdateCommunitySchema.parse(await req.json())
    const ctx = await requireAuth()
    const admin = createSupabaseAdminClient()
    const { data: targetCommunity, error: targetCommunityError } = await admin
      .from('communities')
      .select('*')
      .eq('slug', slug)
      .maybeSingle()

    if (targetCommunityError) throw targetCommunityError
    if (!targetCommunity) throw new NotFoundException('Community not found')

    const isPlatformAdmin = ctx.role === 'admin'

    if (!isPlatformAdmin) {
      await requireCommunityOwner(slug, ctx.userId, ctx.role)
      if (input.is_verified !== undefined) {
        throw new ForbiddenException('Only platform admins can change verification status')
      }
      if (input.approval_status !== undefined) {
        throw new ForbiddenException('Only platform admins can change approval status')
      }
    }

    const updatePayload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    }

    if (input.name !== undefined) updatePayload.name = input.name
    if (input.name_ar !== undefined) updatePayload.name_ar = input.name_ar?.trim() ? input.name_ar.trim() : null
    if (input.description !== undefined) updatePayload.description = input.description?.trim() ? input.description.trim() : null
    if (input.description_ar !== undefined) updatePayload.description_ar = input.description_ar?.trim() ? input.description_ar.trim() : null
    if (input.city !== undefined) updatePayload.city = input.city?.trim() ? input.city.trim() : null
    if (input.cover_url !== undefined) updatePayload.cover_url = input.cover_url?.trim() ? input.cover_url.trim() : null
    if (input.is_private !== undefined) updatePayload.is_private = input.is_private
    if (isPlatformAdmin && input.is_verified !== undefined) updatePayload.is_verified = input.is_verified
    if (isPlatformAdmin && input.approval_status !== undefined) updatePayload.approval_status = input.approval_status

    if (Object.keys(updatePayload).length === 1) return ok(targetCommunity)

    const { data, error } = await admin
      .from('communities')
      .update(updatePayload)
      .eq('id', targetCommunity.id)
      .select('*')
      .single()

    if (error || !data) throw error ?? new NotFoundException('Community not found')
    return ok(data)
  } catch (err) {
    return handleApiError(err)
  }
}
