import { NextRequest } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireAuth } from '@/lib/auth'
import { ForbiddenException, handleApiError, ok, NotFoundException } from '@/lib/errors'
import { limiters, checkRateLimit } from '@/lib/rate-limit'

// POST /api/happenings/:id/rsvp — join a happening
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const ctx    = await requireAuth()
    await checkRateLimit(limiters.rsvp, ctx.userId)
    const admin  = createSupabaseAdminClient()

    const { data: happening } = await admin
      .from('happenings')
      .select('id, community_id, expires_at, rsvp_count')
      .eq('id', id)
      .maybeSingle()

    if (!happening) throw new NotFoundException('Happening not found')
    if (new Date((happening as { expires_at: string }).expires_at) < new Date()) {
      throw new NotFoundException('Happening has expired')
    }

    if (ctx.role !== 'admin') {
      const { data: membership } = await admin
        .from('community_memberships')
        .select('status')
        .eq('community_id', (happening as { community_id: string }).community_id)
        .eq('user_id', ctx.userId)
        .maybeSingle()

      if (!membership || membership.status !== 'active') {
        throw new ForbiddenException('Your community membership cannot RSVP to happenings right now')
      }
    }

    // Idempotent — ignore conflict
    await admin
      .from('happening_rsvps')
      .upsert({ happening_id: id, user_id: ctx.userId }, { onConflict: 'happening_id,user_id' })

    const { data: updated } = await admin
      .from('happenings')
      .select('rsvp_count')
      .eq('id', id)
      .single()

    return ok({ rsvp: true, rsvp_count: (updated as { rsvp_count: number })?.rsvp_count ?? 0 })
  } catch (err) {
    return handleApiError(err)
  }
}

// DELETE /api/happenings/:id/rsvp — leave a happening
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const ctx    = await requireAuth()
    const admin  = createSupabaseAdminClient()

    await admin
      .from('happening_rsvps')
      .delete()
      .eq('happening_id', id)
      .eq('user_id', ctx.userId)

    const { data: updated } = await admin
      .from('happenings')
      .select('rsvp_count')
      .eq('id', id)
      .single()

    return ok({ rsvp: false, rsvp_count: (updated as { rsvp_count: number })?.rsvp_count ?? 0 })
  } catch (err) {
    return handleApiError(err)
  }
}
