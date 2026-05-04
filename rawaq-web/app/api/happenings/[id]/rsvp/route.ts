import { NextRequest } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireAuth } from '@/lib/auth'
import { BadRequestException, ForbiddenException, handleApiError, ok, NotFoundException } from '@/lib/errors'
import { limiters, checkRateLimit } from '@/lib/rate-limit'
import { sendNotification } from '@/lib/notifications'

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
      .select('id, author_id, community_id, expires_at, rsvp_count, capacity, requires_approval')
      .eq('id', id)
      .maybeSingle()

    if (!happening) throw new NotFoundException('Happening not found')

    const h = happening as {
      author_id: string; community_id: string; expires_at: string
      rsvp_count: number; capacity: number; requires_approval: boolean
    }

    if (new Date(h.expires_at) < new Date()) {
      throw new NotFoundException('Happening has expired')
    }

    if (ctx.role !== 'admin') {
      const { data: membership } = await admin
        .from('community_memberships')
        .select('status')
        .eq('community_id', h.community_id)
        .eq('user_id', ctx.userId)
        .maybeSingle()

      if (!membership || membership.status !== 'active') {
        throw new ForbiddenException('Your community membership cannot RSVP to happenings right now')
      }
    }

    // Check existing RSVP — handle idempotently without changing existing approved/pending status
    const { data: existing } = await admin
      .from('happening_rsvps')
      .select('status')
      .eq('happening_id', id)
      .eq('user_id', ctx.userId)
      .maybeSingle()

    const existingStatus = (existing as { status: string } | null)?.status as 'pending' | 'approved' | 'rejected' | undefined

    if (existingStatus === 'approved') {
      return ok({ rsvp: true, status: 'approved', rsvp_count: h.rsvp_count })
    }
    if (existingStatus === 'pending') {
      return ok({ rsvp: false, status: 'pending', rsvp_count: h.rsvp_count })
    }

    // Capacity check applies only for auto-approve happenings
    if (!h.requires_approval && h.rsvp_count >= h.capacity) {
      throw new BadRequestException('This happening is full')
    }

    const isAuthor = h.author_id === ctx.userId
    const newStatus: 'pending' | 'approved' = h.requires_approval && !isAuthor ? 'pending' : 'approved'

    await admin
      .from('happening_rsvps')
      .upsert(
        { happening_id: id, user_id: ctx.userId, status: newStatus },
        { onConflict: 'happening_id,user_id' }
      )

    const { data: updated } = await admin
      .from('happenings')
      .select('rsvp_count')
      .eq('id', id)
      .single()

    if (newStatus === 'pending') {
      const { data: requester } = await admin
        .from('profiles')
        .select('display_name')
        .eq('id', ctx.userId)
        .maybeSingle()

      sendNotification({
        userId: h.author_id,
        type:   'happening_rsvp_request',
        payload: {
          happening_id:    id,
          requester_id:    ctx.userId,
          requester_name:  requester?.display_name ?? 'Someone',
        },
      }).catch(() => {})
    }

    return ok({
      rsvp:      newStatus === 'approved',
      status:    newStatus,
      rsvp_count: (updated as { rsvp_count: number })?.rsvp_count ?? 0,
    })
  } catch (err) {
    return handleApiError(err)
  }
}

// DELETE /api/happenings/:id/rsvp — leave / cancel pending request
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
