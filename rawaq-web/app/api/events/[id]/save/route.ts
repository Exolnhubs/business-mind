import { NextRequest } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireAuth } from '@/lib/auth'
import { handleApiError, ok, ForbiddenException } from '@/lib/errors'
import { getSaveLimit, getUserPlanAccess } from '@/lib/plans'

// POST /api/events/:id/save — save an event
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const ctx = await requireAuth()
    const admin = createSupabaseAdminClient()

    const { data: existing } = await admin
      .from('saved_events')
      .select('event_id')
      .eq('user_id', ctx.userId)
      .eq('event_id', id)
      .maybeSingle()

    if (!existing) {
      const plan = await getUserPlanAccess(ctx.userId)
      const saveLimit = getSaveLimit(plan)

      if (saveLimit !== null) {
        const { count } = await admin
          .from('saved_events')
          .select('event_id', { count: 'exact', head: true })
          .eq('user_id', ctx.userId)

        if ((count ?? 0) >= saveLimit) {
          throw new ForbiddenException(
            `Your ${plan.name} plan allows up to ${saveLimit} saved events. Upgrade your membership to save more.`
          )
        }
      }
    }

    const { error } = await admin
      .from('saved_events')
      .upsert({ user_id: ctx.userId, event_id: id } as any, { onConflict: 'user_id,event_id' })

    if (error) throw error
    return ok({ saved: true })
  } catch (err) {
    return handleApiError(err)
  }
}

// DELETE /api/events/:id/save — unsave an event
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const ctx = await requireAuth()
    const admin = createSupabaseAdminClient()

    const { error } = await admin
      .from('saved_events')
      .delete()
      .eq('user_id', ctx.userId)
      .eq('event_id', id)

    if (error) throw error
    return ok({ saved: false })
  } catch (err) {
    return handleApiError(err)
  }
}
