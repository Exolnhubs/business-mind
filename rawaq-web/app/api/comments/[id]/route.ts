import { NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/auth'
import { handleApiError, ok, NotFoundException, ForbiddenException } from '@/lib/errors'
import { ReportCommentSchema } from '@/lib/validations/comments'

// DELETE /api/comments/:id — soft delete
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const ctx = await requireAuth()
    const supabase = await createSupabaseServerClient()

    const { data: comment } = await supabase
      .from('comments')
      .select('id, user_id, event_id, happening_id')
      .eq('id', id)
      .single()

    if (!comment) throw new NotFoundException('Comment')

    // Owner, event organizer, or admin can delete
    if (ctx.role !== 'admin' && comment.user_id !== ctx.userId) {
      if (comment.event_id) {
        const { data: event } = await supabase
          .from('events')
          .select('organizer_id')
          .eq('id', comment.event_id)
          .single()

        if (event?.organizer_id !== ctx.userId) {
          throw new ForbiddenException()
        }
      } else if (comment.happening_id) {
        const { data: happening } = await supabase
          .from('happenings' as any)
          .select('author_id')
          .eq('id', comment.happening_id)
          .single()

        if ((happening as { author_id?: string } | null)?.author_id !== ctx.userId) {
          throw new ForbiddenException()
        }
      } else {
        throw new ForbiddenException()
      }
    }

    const { error } = await supabase
      .from('comments')
      .update({ is_deleted: true, deleted_at: new Date().toISOString() })
      .eq('id', id)

    if (error) throw error

    return ok({ deleted: true })
  } catch (err) {
    return handleApiError(err)
  }
}

// POST /api/comments/:id/report
// Implemented as a sub-route below
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const ctx = await requireAuth()
    const body = await req.json()
    const input = ReportCommentSchema.parse(body)

    const supabase = await createSupabaseServerClient()

    const { data: comment } = await supabase
      .from('comments')
      .select('id')
      .eq('id', id)
      .eq('is_deleted', false)
      .single()

    if (!comment) throw new NotFoundException('Comment')

    // Flag the comment
    await supabase.from('comments').update({ is_flagged: true }).eq('id', id)

    const { data, error } = await supabase
      .from('comment_reports')
      .insert({
        comment_id: id,
        reporter_id: ctx.userId,
        reason: input.reason,
        details: input.details,
      } as any)
      .select()
      .single()

    if (error) throw error

    return ok(data)
  } catch (err) {
    return handleApiError(err)
  }
}
