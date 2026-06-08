import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { handleApiError, ok, NotFoundException } from '@/lib/errors'
import { resolveHostCommunitySuggestion } from '@/lib/host-community'

// GET /api/bookings/[id]/host-community-suggestion
// Returns the organizer's host community to suggest, but only for a booking the
// caller owns that is in 'confirmed' status. Resolves to null otherwise — never
// blocks the confirmation view.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const ctx = await requireAuth()
    const admin = createSupabaseAdminClient()

    const { data: booking } = await admin
      .from('bookings')
      .select('id, user_id, status, event:events(organizer_id)')
      .eq('id', id)
      .maybeSingle()

    if (!booking || booking.user_id !== ctx.userId) {
      throw new NotFoundException('Booking')
    }
    if (booking.status !== 'confirmed') {
      return ok({ suggested_community: null })
    }

    const organizerId = (booking.event as unknown as { organizer_id: string } | null)?.organizer_id
    if (!organizerId) return ok({ suggested_community: null })

    const suggested = await resolveHostCommunitySuggestion(admin, organizerId, ctx.userId)
    return ok({ suggested_community: suggested })
  } catch (err) {
    return handleApiError(err)
  }
}
