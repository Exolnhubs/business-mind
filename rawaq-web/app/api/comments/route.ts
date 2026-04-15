import { NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireAuth, optionalAuth } from '@/lib/auth'
import { handleApiError, ok, created, NotFoundException, ForbiddenException } from '@/lib/errors'
import { CreateCommentSchema, ListCommentsSchema } from '@/lib/validations/comments'
import { sendNotifications } from '@/lib/notifications'

// GET /api/comments?event_id=|happening_id=&page=&per_page=&parent_id=
export async function GET(req: NextRequest) {
  try {
    const params = ListCommentsSchema.parse(
      Object.fromEntries(req.nextUrl.searchParams)
    )

    const supabase = await createSupabaseServerClient()
    const from = (params.page - 1) * params.per_page

    let query = supabase
      .from('comments')
      .select(
        `id, content, media_url, created_at, updated_at, parent_id, mentions, is_flagged,
         author:profiles!user_id(id, display_name, avatar_url, plan_id)`,
        { count: 'exact' }
      )
      .eq('is_deleted', false)
      .order('created_at', { ascending: true })
      .range(from, from + params.per_page - 1)

    if (params.event_id) {
      query = query.eq('event_id', params.event_id)
    } else {
      query = query.eq('happening_id', params.happening_id!)
    }

    // Top-level vs replies
    if (params.parent_id) {
      query = query.eq('parent_id', params.parent_id)
    } else {
      query = query.is('parent_id', null)
    }

    const { data, count, error } = await query
    if (error) throw error

    return ok({
      data,
      total: count ?? 0,
      page: params.page,
      per_page: params.per_page,
      has_more: (count ?? 0) > from + params.per_page,
    })
  } catch (err) {
    return handleApiError(err)
  }
}

// POST /api/comments
export async function POST(req: NextRequest) {
  try {
    const ctx = await requireAuth()
    const body = await req.json()
    const input = CreateCommentSchema.parse(body)

    // Use admin client so mobile Bearer-token requests aren't blocked by RLS
    // (auth is already enforced by requireAuth above)
    const supabase = createSupabaseAdminClient()

    let event: { id: string; title: string; organizer_id: string; is_published: boolean; is_cancelled: boolean } | null = null
    let happening: { id: string; body: string; author_id: string; community_id: string; expires_at: string } | null = null

    if (input.event_id) {
      const { data: eventRow, error: eventErr } = await supabase
        .from('events')
        .select('id, title, organizer_id, is_published, is_cancelled')
        .eq('id', input.event_id)
        .single()

      if (eventErr || !eventRow) throw new NotFoundException('Event')
      if (!eventRow.is_published || eventRow.is_cancelled) {
        throw new ForbiddenException('Cannot comment on an inactive event')
      }
      event = eventRow
    } else {
      const { data: rawHappeningRow, error: happeningErr } = await supabase
        .from('happenings' as any)
        .select('id, body, author_id, community_id, expires_at')
        .eq('id', input.happening_id!)
        .single()

      const happeningRow = rawHappeningRow as {
        id: string
        body: string
        author_id: string
        community_id: string
        expires_at: string
      } | null

      if (happeningErr || !happeningRow) throw new NotFoundException('Happening')
      if (new Date(happeningRow.expires_at).getTime() <= Date.now()) {
        throw new ForbiddenException('Cannot comment on an expired happening')
      }

      const [{ data: community }, { data: membership }] = await Promise.all([
        supabase
          .from('communities')
          .select('id, type')
          .eq('id', happeningRow.community_id)
          .single(),
        supabase
          .from('community_memberships')
          .select('status')
          .eq('community_id', happeningRow.community_id)
          .eq('user_id', ctx.userId)
          .maybeSingle(),
      ])

      const isReadableCommunity =
        community?.type === 'country' ||
        membership?.status === 'active' ||
        ctx.role === 'admin'

      if (!isReadableCommunity) {
        throw new ForbiddenException('Join this community to comment on its happenings')
      }

      happening = happeningRow
    }

    // Verify parent comment if replying
    let parentAuthorId: string | null = null
    if (input.parent_id) {
      const { data: parent } = await supabase
        .from('comments')
        .select('id, user_id, event_id, happening_id, is_deleted')
        .eq('id', input.parent_id)
        .single()

      const sameTarget =
        (input.event_id && parent?.event_id === input.event_id) ||
        (input.happening_id && parent?.happening_id === input.happening_id)

      if (!parent || !sameTarget) {
        throw new NotFoundException('Parent comment')
      }
      if (parent.is_deleted) {
        throw new ForbiddenException('Cannot reply to a deleted comment')
      }
      parentAuthorId = parent.user_id
    }

    if (!input.content?.trim() && !input.media_url) {
      throw new ForbiddenException('Comment must have text or an attachment')
    }

    const { data: comment, error } = await supabase
      .from('comments')
      .insert({
        user_id:   ctx.userId,
        event_id:  input.event_id ?? null,
        happening_id: input.happening_id ?? null,
        content:   input.content ?? '',
        parent_id: input.parent_id ?? null,
        mentions:  input.mentions,
        media_url: input.media_url ?? null,
      } as any)
      .select(`id, content, media_url, created_at, updated_at, parent_id, mentions, event_id, happening_id,
               author:profiles!user_id(id, display_name, avatar_url, plan_id)`)
      .single()

    if (error) throw error

    // Trigger notifications (async)
    const notifPromises: { userId: string; type: 'comment_reply' | 'mention' | 'new_comment'; payload: Record<string, unknown> }[] = []

    // Notify event organizer of new top-level comment (not if organizer is the commenter)
    if (event && !input.parent_id && event.organizer_id !== ctx.userId) {
      const { data: actor } = await supabase
        .from('profiles').select('display_name').eq('id', ctx.userId).single()
      notifPromises.push({
        userId:  event.organizer_id,
        type:    'new_comment',
        payload: {
          event_id:    input.event_id,
          comment_id:  comment.id,
          actor_id:    ctx.userId,
          actor_name:  actor?.display_name ?? 'Someone',
          event_title: (event as Record<string, unknown>).title ?? '',
        },
      })
    }

    if (happening && !input.parent_id && happening.author_id !== ctx.userId) {
      const { data: actor } = await supabase
        .from('profiles')
        .select('display_name')
        .eq('id', ctx.userId)
        .single()

      notifPromises.push({
        userId: happening.author_id,
        type: 'new_comment',
        payload: {
          happening_id: happening.id,
          comment_id: comment.id,
          actor_id: ctx.userId,
          actor_name: actor?.display_name ?? 'Someone',
          event_title: 'a happening',
        },
      })
    }

    // Notify parent author of reply (unless they're the commenter)
    if (parentAuthorId && parentAuthorId !== ctx.userId) {
      const { data: actor } = await supabase
        .from('profiles')
        .select('display_name')
        .eq('id', ctx.userId)
        .single()

      notifPromises.push({
        userId: parentAuthorId,
        type: 'comment_reply' as const,
        payload: {
          event_id: input.event_id,
          happening_id: input.happening_id,
          comment_id: comment.id,
          actor_id: ctx.userId,
          actor_name: actor?.display_name ?? 'Someone',
        },
      })
    }

    // Notify mentioned users
    for (const mentionedId of input.mentions) {
      if (mentionedId === ctx.userId) continue
      const { data: actor } = await supabase
        .from('profiles')
        .select('display_name')
        .eq('id', ctx.userId)
        .single()

      notifPromises.push({
        userId: mentionedId,
        type: 'mention' as const,
        payload: {
          event_id: input.event_id,
          happening_id: input.happening_id,
          comment_id: comment.id,
          actor_id: ctx.userId,
          actor_name: actor?.display_name ?? 'Someone',
        },
      })
    }

    if (notifPromises.length) {
      sendNotifications(notifPromises).catch(() => {})
    }

    return created(comment)
  } catch (err) {
    return handleApiError(err)
  }
}
