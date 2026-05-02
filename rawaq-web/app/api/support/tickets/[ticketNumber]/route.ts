import { NextRequest } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireAuth } from '@/lib/auth'
import { handleApiError, ok, NotFoundException } from '@/lib/errors'

// GET /api/support/tickets/:ticketNumber
// Returns a single ticket scoped to the authenticated user.
// Both "not found" and "belongs to another user" return 404 — no enumeration risk.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ ticketNumber: string }> }
) {
  try {
    const { ticketNumber } = await params
    const ctx   = await requireAuth()
    const admin = createSupabaseAdminClient()

    const { data } = await admin
      .from('support_tickets')
      .select('ticket_number, category, subject, status, public_response, created_at, updated_at')
      .eq('ticket_number', ticketNumber)
      .eq('user_id', ctx.userId)
      .single()

    if (!data) throw new NotFoundException('Ticket')
    return ok(data)
  } catch (err) {
    return handleApiError(err)
  }
}
