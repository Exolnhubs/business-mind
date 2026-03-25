import { NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { requireAuth, optionalAuth } from '@/lib/auth'
import { handleApiError, ok, created, NotFoundException, ForbiddenException } from '@/lib/errors'
import { CreateCommentSchema, ListCommentsSchema } from '@/lib/validations/comments'
import { sendNotifications } from '@/lib/notifications'

// GET /api/comments?event_id=&page=&per_page=&parent_id=
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
        `id, content, created_at, updated_at, parent_id, mentions, is_flagged,
         author:profiles!user_id(id, display_name, avatar_url)`,
        { count: 'exact' }
      )
      .eq('event_id', params.event_id)
      .eq('is_deleted', false)
      .order('created_at', { ascending: true })
      .range(from, from + params.per_page - 1)

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

    const supabase = await createSupabaseServerClient()

    // Verify event exists and is active
    const { data: event, error: eventErr } = await supabase
      .from('events')
      .select('id, title, organizer_id, is_published, is_cancelled')
      .eq('id', input.event_id)
      .single()

    if (eventErr || !event) throw new NotFoundException('Event')
    if (!event.is_published || event.is_cancelled) {
      throw new ForbiddenException('Cannot comment on an inactive event')
    }

    // Verify parent comment if replying
    let parentAuthorId: string | null = null
    if (input.parent_id) {
      const { data: parent } = await supabase
        .from('comments')
        .select('id, user_id, event_id, is_deleted')
        .eq('id', input.parent_id)
        .single()

      if (!parent || parent.event_id !== input.event_id) {
        throw new NotFoundException('Parent comment')
      }
      if (parent.is_deleted) {
        throw new ForbiddenException('Cannot reply to a deleted comment')
      }
      parentAuthorId = parent.user_id
    }

    const { data: comment, error } = await supabase
      .from('comments')
      .insert({
        user_id: ctx.userId,
        event_id: input.event_id,
        content: input.content,
        parent_id: input.parent_id ?? null,
        mentions: input.mentions,
      })
      .select(`id, content, created_at, parent_id, mentions,
               author:profiles!user_id(id, display_name, avatar_url)`)
      .single()

    if (error) throw error

    // Trigger notifications (async)
    const notifPromises: { userId: string; type: 'comment_reply' | 'mention' | 'new_comment'; payload: Record<string, unknown> }[] = []

    // Notify event organizer of new top-level comment (not if organizer is the commenter)
    if (!input.parent_id && event.organizer_id !== ctx.userId) {
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
