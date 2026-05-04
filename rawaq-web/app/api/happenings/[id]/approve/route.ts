import { NextRequest } from 'next/server'
import { z } from 'zod'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireAuth } from '@/lib/auth'
import { BadRequestException, ForbiddenException, handleApiError, ok, NotFoundException } from '@/lib/errors'
import { sendNotification } from '@/lib/notifications'

const ApproveSchema = z.object({
  user_id: z.string().uuid(),
  action: z.enum(['approve', 'reject']),
})

// GET /api/happenings/:id/approve — list pending RSVPs (author only)
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const ctx   = await requireAuth()
    const admin = createSupabaseAdminClient()

    const { data: happening } = await admin
      .from('happenings')
      .select('id, author_id')
      .eq('id', id)
      .maybeSingle()

    if (!happening) throw new NotFoundException('Happening not found')
    if ((happening as { author_id: string }).author_id !== ctx.userId && ctx.role !== 'admin') {
      throw new ForbiddenException('Only the author can view pending approvals')
    }

    const { data: rows, error } = await admin
      .from('happening_rsvps')
      .select('user_id, created_at, profile:profiles!user_id(id, display_name, avatar_url)')
      .eq('happening_id', id)
      .eq('status', 'pending')
      .order('created_at', { ascending: true })

    if (error) throw error

    const pending = ((rows ?? []) as unknown as Array<{
      user_id: string
      created_at: string
      profile: { id: string; display_name: string; avatar_url: string | null } | null
    }>)
      .filter((r) => r.profile !== null)
      .map((r) => ({
        user_id:      r.user_id,
        display_name: r.profile!.display_name,
        avatar_url:   r.profile!.avatar_url,
        requested_at: r.created_at,
      }))

    return ok({ pending })
  } catch (err) {
    return handleApiError(err)
  }
}

// POST /api/happenings/:id/approve — approve or reject a pending RSVP (author only)
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const ctx   = await requireAuth()
    const admin = createSupabaseAdminClient()

    const body              = await req.json()
    const { user_id, action } = ApproveSchema.parse(body)

    const { data: happening } = await admin
      .from('happenings')
      .select('id, author_id, capacity, rsvp_count')
      .eq('id', id)
      .maybeSingle()

    if (!happening) throw new NotFoundException('Happening not found')

    const h = happening as { author_id: string; capacity: number; rsvp_count: number }
    if (h.author_id !== ctx.userId && ctx.role !== 'admin') {
      throw new ForbiddenException('Only the author can approve or reject joiners')
    }

    if (action === 'approve' && h.rsvp_count >= h.capacity) {
      throw new BadRequestException('This happening is at full capacity')
    }

    const { error } = await admin
      .from('happening_rsvps')
      .update({ status: action === 'approve' ? 'approved' : 'rejected' })
      .eq('happening_id', id)
      .eq('user_id', user_id)
      .eq('status', 'pending')

    if (error) throw error

    if (action === 'approve') {
      sendNotification({
        userId:  user_id,
        type:    'happening_rsvp_approved',
        payload: { happening_id: id, author_id: ctx.userId },
      }).catch(() => {})
    }

    return ok({ action, user_id })
  } catch (err) {
    return handleApiError(err)
  }
}
