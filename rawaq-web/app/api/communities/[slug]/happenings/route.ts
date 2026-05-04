import { NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { optionalAuth, requireAuth } from '@/lib/auth'
import { handleApiError, ok, NotFoundException, ForbiddenException } from '@/lib/errors'
import { sendNotifications } from '@/lib/notifications'
import { z } from 'zod'
import { limiters, checkRateLimit } from '@/lib/rate-limit'

const CreateSchema = z.object({
  type:             z.enum(['open_invite', 'info', 'question', 'alert']).default('open_invite'),
  body:             z.string().min(1).max(280),
  lat:              z.number().optional(),
  lng:              z.number().optional(),
  location_label:   z.string().trim().min(1).max(200).optional(),
  expires_in_hours: z.number().int().min(1).max(24).default(6),
  capacity:         z.number().int().min(1).max(50).default(10),
  requires_approval: z.boolean().default(false),
})

const HAPPENING_SELECT = `
  id, author_id, type, body, lat, lng, location_label, expires_at, rsvp_count, capacity, requires_approval, reaction_count, is_pinned, created_at,
  author:profiles!author_id(id, display_name, avatar_url, plan_id)
`

// GET /api/communities/:slug/happenings — active happenings for a community
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params
    const supabase = await createSupabaseServerClient()
    const admin    = createSupabaseAdminClient()
    const ctx      = await optionalAuth()

    const { data: community, error: cErr } = await supabase
      .from('communities')
      .select('id, type')
      .eq('slug', slug)
      .single()

    if (cErr || !community) throw new NotFoundException('Community not found')

    let membershipStatus: 'active' | 'timed_out' | 'removed' | 'banned' | null = null
    if (ctx?.userId) {
      const { data: membership } = await admin
        .from('community_memberships')
        .select('id, status')
        .eq('community_id', community.id)
        .eq('user_id', ctx.userId)
        .maybeSingle()
      membershipStatus = (membership?.status as 'active' | 'timed_out' | 'removed' | 'banned' | undefined) ?? null
    }

    const isMember = membershipStatus !== null && membershipStatus !== 'removed' && membershipStatus !== 'banned'
    const canRead  = community.type === 'country' || isMember || ctx?.role === 'admin'
    if (!canRead) throw new ForbiddenException('You must join this community to view happenings')

    const limit  = Math.min(Number(req.nextUrl.searchParams.get('per_page') ?? '20'), 50)
    const cursor = req.nextUrl.searchParams.get('cursor')

    let query = admin
      .from('happenings')
      .select(HAPPENING_SELECT)
      .eq('community_id', community.id)
      .gt('expires_at', new Date().toISOString())
      .order('is_pinned', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(limit + 1)

    if (cursor) query = query.lt('created_at', cursor)

    const { data: happenings, error } = await query
    if (error) throw error

    // Annotate user_has_rsvp, user_rsvp_status, user_has_reacted, pending_count
    const rsvpStatusMap = new Map<string, 'pending' | 'approved' | 'rejected'>()
    let reactionSet     = new Set<string>()
    const pendingCounts = new Map<string, number>()

    if (ctx?.userId && happenings?.length) {
      const ids = happenings.map((h: { id: string }) => h.id)
      const [{ data: rsvps }, { data: reactions }] = await Promise.all([
        admin.from('happening_rsvps').select('happening_id, status').eq('user_id', ctx.userId).in('happening_id', ids),
        admin.from('happening_reactions').select('happening_id').eq('user_id', ctx.userId).in('happening_id', ids),
      ])

      for (const r of (rsvps ?? []) as Array<{ happening_id: string; status: string }>) {
        rsvpStatusMap.set(r.happening_id, r.status as 'pending' | 'approved' | 'rejected')
      }
      reactionSet = new Set((reactions ?? []).map((r: { happening_id: string }) => r.happening_id))

      // Pending counts for happenings the user authored
      const authoredIds = (happenings as Array<{ id: string; author_id: string }>)
        .filter((h) => h.author_id === ctx.userId)
        .map((h) => h.id)

      if (authoredIds.length > 0) {
        const { data: pending } = await admin
          .from('happening_rsvps')
          .select('happening_id')
          .in('happening_id', authoredIds)
          .eq('status', 'pending')
        for (const p of (pending ?? []) as Array<{ happening_id: string }>) {
          pendingCounts.set(p.happening_id, (pendingCounts.get(p.happening_id) ?? 0) + 1)
        }
      }
    }

    const slice     = (happenings ?? []).slice(0, limit)
    const hasMore   = (happenings?.length ?? 0) > limit
    const nextCursor = hasMore ? slice[slice.length - 1]?.created_at ?? null : null

    return ok({
      happenings: slice.map((h: { id: string }) => ({
        ...h,
        user_has_rsvp:    rsvpStatusMap.get(h.id) === 'approved',
        user_rsvp_status: rsvpStatusMap.get(h.id) ?? null,
        user_has_reacted: reactionSet.has(h.id),
        pending_count:    pendingCounts.get(h.id) ?? 0,
      })),
      next_cursor: nextCursor,
    })
  } catch (err) {
    return handleApiError(err)
  }
}

// POST /api/communities/:slug/happenings — create a happening
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params
    const ctx      = await requireAuth()
    await checkRateLimit(limiters.happenings, ctx.userId)
    const supabase = await createSupabaseServerClient()
    const admin    = createSupabaseAdminClient()

    const body   = await req.json()
    const parsed = CreateSchema.parse(body)

    const { data: community, error: cErr } = await supabase
      .from('communities')
      .select('id, name')
      .eq('slug', slug)
      .single()

    if (cErr || !community) throw new NotFoundException('Community not found')

    const { data: membership } = await admin
      .from('community_memberships')
      .select('id, status')
      .eq('community_id', community.id)
      .eq('user_id', ctx.userId)
      .maybeSingle()

    if (!membership) throw new ForbiddenException('You must be a member to post happenings')
    if (membership.status !== 'active' && ctx.role !== 'admin') {
      throw new ForbiddenException('Your community membership cannot post happenings right now')
    }

    const expiresAt = new Date(Date.now() + parsed.expires_in_hours * 60 * 60 * 1000).toISOString()

    const { data: happening, error: insertErr } = await admin
      .from('happenings')
      .insert({
        community_id:     community.id,
        author_id:        ctx.userId,
        type:             parsed.type,
        body:             parsed.body,
        lat:              parsed.lat ?? null,
        lng:              parsed.lng ?? null,
        location_label:   parsed.location_label ?? null,
        expires_at:       expiresAt,
        capacity:         parsed.capacity,
        requires_approval: parsed.requires_approval,
      })
      .select(HAPPENING_SELECT)
      .single()

    if (insertErr) throw insertErr

    if (parsed.type === 'open_invite') {
      notifyCommunityMembers({
        communityId:   community.id,
        communityName: community.name,
        communitySlug: slug,
        happeningId:   (happening as { id: string }).id,
        body:          parsed.body,
        authorId:      ctx.userId,
      }).catch(() => {})
    }

    return ok(happening)
  } catch (err) {
    return handleApiError(err)
  }
}

async function notifyCommunityMembers({
  communityId,
  communityName,
  communitySlug,
  happeningId,
  body,
  authorId,
}: {
  communityId:   string
  communityName: string
  communitySlug: string
  happeningId:   string
  body:          string
  authorId:      string
}) {
  const admin = createSupabaseAdminClient()
  const { data: memberships } = await admin
    .from('community_memberships')
    .select('user_id')
    .eq('community_id', communityId)
    .eq('status', 'active')

  if (!memberships?.length) return

  const notifications = (memberships as { user_id: string }[])
    .filter((m) => m.user_id !== authorId)
    .map((m) => ({
      userId:  m.user_id,
      type:    'community_happening' as const,
      payload: {
        happening_id:   happeningId,
        community_name: communityName,
        community_slug: communitySlug,
        body:           body.slice(0, 80),
      },
    }))

  await sendNotifications(notifications)
}
