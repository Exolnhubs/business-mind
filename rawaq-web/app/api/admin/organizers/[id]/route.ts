import { NextRequest } from 'next/server'
import { z } from 'zod'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth'
import { delCachedProfile } from '@/lib/supabase/profile-cache'
import { handleApiError, ok, NotFoundException } from '@/lib/errors'
import { sendNotification } from '@/lib/notifications'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'

const ReviewSchema = z.object({
  status: z.enum(['approved', 'rejected', 'suspended']),
  note: z.string().max(500).optional(),
})

// PATCH /api/admin/organizers/:id — approve / reject / suspend
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const ctx = await requireAdmin()
    const body = await req.json()
    const input = ReviewSchema.parse(body)

    const supabase = await createSupabaseServerClient()

    const { data: organizer, error: fetchErr } = await supabase
      .from('organizer_profiles')
      .select('user_id')
      .eq('id', id)
      .single()

    if (fetchErr || !organizer) throw new NotFoundException('Organizer profile')

    const { data, error } = await supabase
      .from('organizer_profiles')
      .update({
        status: input.status,
        verified: input.status === 'approved',
        reviewed_by: ctx.userId,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    // Elevate/demote profile role in sync
    const adminClient = createSupabaseAdminClient()
    if (input.status === 'approved') {
      await adminClient
        .from('profiles')
        .update({ role: 'organizer' })
        .eq('id', organizer.user_id)

      await delCachedProfile(organizer.user_id)

      sendNotification({
        userId: organizer.user_id,
        type: 'organizer_approved',
        payload: { note: input.note ?? '' },
      }).catch(() => {})
    } else if (input.status === 'rejected' || input.status === 'suspended') {
      await adminClient
        .from('profiles')
        .update({ role: 'user' })
        .eq('id', organizer.user_id)

      await delCachedProfile(organizer.user_id)

      sendNotification({
        userId: organizer.user_id,
        type: input.status === 'rejected' ? 'organizer_rejected' : 'organizer_suspended',
        payload: { note: input.note ?? '' },
      }).catch(() => {})
    }

    return ok(data)
  } catch (err) {
    return handleApiError(err)
  }
}
