import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/lib/auth'
import { delCachedProfile } from '@/lib/supabase/profile-cache'
import { handleApiError, ok, NotFoundException, BadRequestException } from '@/lib/errors'
import { sendNotification } from '@/lib/notifications'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'

const PatchSchema = z.object({
  status: z.enum(['approved', 'rejected', 'suspended']).optional(),
  paid_sessions_enabled: z.boolean().optional(),
  plan_id: z.enum(['ind_free', 'ind_basic', 'ind_pro']).optional(),
  note: z.string().max(500).optional(),
}).refine(
  (input) =>
    input.status !== undefined ||
    input.paid_sessions_enabled !== undefined ||
    input.plan_id !== undefined,
  { message: 'At least one update field is required' },
)

type IndividualHostRow = {
  id: string
  user_id: string
  organizer_type: 'individual'
}

type IndividualHostUpdates = {
  updated_at: string
  status?: 'approved' | 'rejected' | 'suspended'
  reviewed_by?: string
  reviewed_at?: string
  paid_sessions_enabled?: boolean
  verified?: boolean
  plan_id?: 'ind_free' | 'ind_basic' | 'ind_pro'
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const ctx = await requireAdmin()
    const input = PatchSchema.parse(await req.json())
    const admin = createSupabaseAdminClient()

    const { data: host, error: fetchError } = await admin
      .from('organizer_profiles')
      .select('id, user_id, organizer_type')
      .eq('id', id)
      .eq('organizer_type', 'individual')
      .maybeSingle<IndividualHostRow>()

    if (fetchError) throw fetchError
    if (!host) throw new NotFoundException('Individual host')

    const now = new Date().toISOString()
    const updates: IndividualHostUpdates = { updated_at: now }

    if (input.status !== undefined) {
      updates.status = input.status
      updates.reviewed_by = ctx.userId
      updates.reviewed_at = now
    }

    if (input.paid_sessions_enabled !== undefined) {
      updates.paid_sessions_enabled = input.paid_sessions_enabled
      updates.verified = input.paid_sessions_enabled
    }

    if (input.plan_id !== undefined) {
      updates.plan_id = input.plan_id
    }

    if (input.plan_id === 'ind_free' && input.paid_sessions_enabled === true) {
      throw new BadRequestException('Individual Free hosts cannot enable paid sessions')
    }

    const { data, error } = await admin
      .from('organizer_profiles')
      .update(updates)
      .eq('id', id)
      .eq('organizer_type', 'individual')
      .select()
      .single()

    if (error) throw error

    if (input.status !== undefined) {
      const nextRole = input.status === 'approved' ? 'organizer' : 'user'
      const notificationType = input.status === 'approved'
        ? 'organizer_approved'
        : input.status === 'rejected'
          ? 'organizer_rejected'
          : 'organizer_suspended'

      await admin
        .from('profiles')
        .update({ role: nextRole })
        .eq('id', host.user_id)

      await delCachedProfile(host.user_id)

      sendNotification({
        userId: host.user_id,
        type: notificationType,
        payload: { note: input.note ?? '' },
      }).catch(() => {})
    }

    return ok(data)
  } catch (err) {
    return handleApiError(err)
  }
}
