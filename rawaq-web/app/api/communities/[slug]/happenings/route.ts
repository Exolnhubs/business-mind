import { NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { optionalAuth, requireAuth } from '@/lib/auth'
import { handleApiError, ok, NotFoundException, ForbiddenException } from '@/lib/errors'
import { sendNotifications } from '@/lib/notifications'
import { z } from 'zod'

const CreateSchema = z.object({
  type: z.enum(['open_invite', 'info', 'question', 'alert']).default('open_invite'),
  body: z.string().min(1).max(280),
  lat:  z.number().optional(),
  lng:  z.number().optional(),
  expires_in_hours: z.number().int().min(1).max(24).default(6),
})

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

    let isMember = false
    if (ctx?.userId) {
      const { data: membership } = await admin
        .from('community_memberships')
        .select('id')
        .eq('community_id', community.id)
        .eq('user_id', ctx.userId)
        .maybeSingle()
      isMember = !!membership
    }

    const canRead = community.type === 'country' || isMember || ctx?.role === 'admin'
    if (!canRead) throw new ForbiddenException('You must join this community to view happenings')

    const limit   = Math.min(Number(req.nextUrl.searchParams.get('per_page') ?? '20'), 50)
    const cursor  = req.nextUrl.searchParams.get('cursor') // ISO timestamp

    let query = (admin as any)
      .from('happenings')
      .select(`
        id, type, body, lat, lng, expires_at, rsvp_count, reaction_count, is_pinned, created_at,
        author:profiles!author_id(id, display_name, avatar_url)
      `)
      .eq('community_id', community.id)
      .gt('expires_at', new Date().toISOString())
      .order('is_pinned', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(limit + 1)

    if (cursor) query = query.lt('created_at', cursor)

    const { data: happenings, error } = await query
    if (error) throw error

    // If authenticated, annotate user_has_rsvp + user_has_reacted
    let rsvpSet     = new Set<string>()
    let reactionSet = new Set<string>()

    if (ctx?.userId && happenings?.length) {
      const ids = happenings.map((h: { id: string }) => h.id)
      const [{ data: rsvps }, { data: reactions }] = await Promise.all([
        admin.from('happening_rsvps').select('happening_id').eq('user_id', ctx.userId).in('happening_id', ids) as any,
        admin.from('happening_reactions').select('happening_id').eq('user_id', ctx.userId).in('happening_id', ids) as any,
      ])
      rsvpSet     = new Set((rsvps ?? []).map((r: { happening_id: string }) => r.happening_id))
      reactionSet = new Set((reactions ?? []).map((r: { happening_id: string }) => r.happening_id))
    }

    const slice    = (happenings ?? []).slice(0, limit)
    const hasMore  = (happenings?.length ?? 0) > limit
    const nextCursor = hasMore ? slice[slice.length - 1]?.created_at ?? null : null

    return ok({
      happenings: slice.map((h: { id: string }) => ({
        ...h,
        user_has_rsvp:    rsvpSet.has(h.id),
        user_has_reacted: reactionSet.has(h.id),
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

    // Must be a community member
    const { data: membership } = await admin
      .from('community_memberships')
      .select('id')
      .eq('community_id', community.id)
      .eq('user_id', ctx.userId)
      .maybeSingle()

    if (!membership) throw new ForbiddenException('You must be a member to post happenings')

    const expiresAt = new Date(Date.now() + parsed.expires_in_hours * 60 * 60 * 1000).toISOString()

    const { data: happening, error: insertErr } = await (admin as any)
      .from('happenings')
      .insert({
        community_id: community.id,
        author_id:    ctx.userId,
        type:         parsed.type,
        body:         parsed.body,
        lat:          parsed.lat ?? null,
        lng:          parsed.lng ?? null,
        expires_at:   expiresAt,
      })
      .select(`
        id, type, body, lat, lng, expires_at, rsvp_count, reaction_count, is_pinned, created_at,
        author:profiles!author_id(id, display_name, avatar_url)
      `)
      .single()

    if (insertErr) throw insertErr

    // Notify community members (fire-and-forget, open_invite type only)
    if (parsed.type === 'open_invite') {
      notifyCommunityMembers({
        communityId:   community.id,
        communityName: community.name,
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
  happeningId,
  body,
  authorId,
}: {
  communityId:   string
  communityName: string
  happeningId:   string
  body:          string
  authorId:      string
}) {
  const admin = createSupabaseAdminClient()
  const { data: memberships } = await (admin as any)
    .from('community_memberships')
    .select('user_id')
    .eq('community_id', communityId)

  if (!memberships?.length) return

  const notifications = (memberships as { user_id: string }[])
    .filter((m) => m.user_id !== authorId) // don't notify the poster
    .map((m) => ({
      userId:  m.user_id,
      type:    'community_happening' as const,
      payload: {
        happening_id:   happeningId,
        community_name: communityName,
        body:           body.slice(0, 80),
      },
    }))

  await sendNotifications(notifications)
}
