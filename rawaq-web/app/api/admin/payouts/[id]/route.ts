/**
 * PATCH /api/admin/payouts/[id]
 * Admin-only: advance a payout through its lifecycle.
 *
 * Allowed transitions:
 *   pending     → processing  (admin starts bank transfer)
 *   processing  → completed   (transfer confirmed — triggers wallet debit)
 *   pending     → failed      (rejected before processing)
 *   processing  → failed      (transfer failed)
 *
 * Body: { status: 'processing' | 'completed' | 'failed', failure_reason?: string, gateway_ref?: string }
 */

import { NextRequest } from 'next/server'
import { z } from 'zod'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/auth'
import { handleApiError, ok, BadRequestException, NotFoundException } from '@/lib/errors'

const UpdatePayoutSchema = z.object({
  status:         z.enum(['processing', 'completed', 'failed']),
  gateway_ref:    z.string().max(200).optional(),
  failure_reason: z.string().max(500).optional(),
})

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  pending:    ['processing', 'failed'],
  processing: ['completed', 'failed'],
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAdmin()
    const { id } = await params

    const body  = await req.json()
    const input = UpdatePayoutSchema.parse(body)

    const admin = createSupabaseAdminClient()

    // Load existing payout
    const { data: payout, error: fetchErr } = await admin
      .from('payouts')
      .select('id, status, organizer_id, amount')
      .eq('id', id)
      .maybeSingle()

    if (fetchErr) throw fetchErr
    if (!payout) throw new NotFoundException('Payout not found')

    // Validate transition
    const allowed = ALLOWED_TRANSITIONS[payout.status] ?? []
    if (!allowed.includes(input.status)) {
      throw new BadRequestException(
        `Cannot transition payout from '${payout.status}' to '${input.status}'.`,
      )
    }

    // Build update payload
    const update: Record<string, unknown> = {
      status:     input.status,
      updated_at: new Date().toISOString(),
    }
    if (input.status === 'completed' || input.status === 'processing') {
      update.processed_by = ctx.userId
      update.processed_at = new Date().toISOString()
    }
    if (input.gateway_ref)    update.gateway_ref    = input.gateway_ref
    if (input.failure_reason) update.failure_reason = input.failure_reason

    const { data: updated, error: updateErr } = await admin
      .from('payouts')
      .update(update)
      .eq('id', id)
      .select()
      .single()

    if (updateErr) throw updateErr

    return ok({ payout: updated })
  } catch (err) {
    return handleApiError(err)
  }
}
