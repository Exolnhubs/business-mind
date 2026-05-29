/**
 * PATCH /api/admin/refunds/:id
 *
 * Allowed transitions:
 *   pending    → approved    (admin confirms refund will be processed)
 *   approved   → completed   (money sent → sets payment_transaction.status = 'refunded',
 *                              which triggers organizer wallet debit via existing DB trigger)
 *   pending    → rejected    (refund denied)
 *   approved   → rejected    (reversed before completion)
 *
 * On 'completed': payment_transaction.status set to 'refunded' here.
 *   The existing trg_payment_wallet_sync trigger then debits the organizer wallet.
 */

import { NextRequest } from 'next/server'
import { z } from 'zod'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/auth'
import { logAdminAction } from '@/lib/audit'
import { handleApiError, ok, BadRequestException, NotFoundException } from '@/lib/errors'

const UpdateRefundSchema = z.object({
  status:         z.enum(['approved', 'completed', 'rejected']),
  gateway_ref:    z.string().max(200).optional(),
  refund_method:  z.enum(['original_payment', 'manual']).optional(),
})

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  pending:  ['approved', 'rejected'],
  approved: ['completed', 'rejected'],
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx    = await requireAdmin()
    const { id } = await params
    const body   = await req.json()
    const input  = UpdateRefundSchema.parse(body)

    const admin = createSupabaseAdminClient()

    // Load refund + transaction
    const { data: refund, error: fetchErr } = await admin
      .from('refunds')
      .select('id, status, payment_transaction_id, amount, booking_id')
      .eq('id', id)
      .maybeSingle()

    if (fetchErr) throw fetchErr
    if (!refund)  throw new NotFoundException('Refund')

    const allowed = ALLOWED_TRANSITIONS[refund.status] ?? []
    if (!allowed.includes(input.status)) {
      throw new BadRequestException(
        `Cannot transition refund from '${refund.status}' to '${input.status}'.`,
      )
    }

    // ── Build refund update ───────────────────────────────────────────────────
    const update: Record<string, unknown> = {
      status:     input.status,
      updated_at: new Date().toISOString(),
    }
    if (input.status === 'approved' || input.status === 'completed') {
      update.processed_by = ctx.userId
      update.processed_at = new Date().toISOString()
    }
    if (input.gateway_ref)   update.gateway_ref   = input.gateway_ref
    if (input.refund_method) update.refund_method = input.refund_method

    const { data: updatedRefund, error: refundUpdateErr } = await admin
      .from('refunds')
      .update(update)
      .eq('id', id)
      .select()
      .single()

    if (refundUpdateErr) throw refundUpdateErr

    // ── On completed: mark payment_transaction as refunded ───────────────────
    // This fires the existing trg_payment_wallet_sync trigger which debits
    // the organizer wallet and writes a wallet_ledger 'refund_deducted' entry.
    if (input.status === 'completed') {
      const { error: txErr } = await admin
        .from('payment_transactions')
        .update({
          status:     'refunded',
          updated_at: new Date().toISOString(),
        })
        .eq('id', refund.payment_transaction_id)

      if (txErr) {
        // Roll back the refund status update to keep state consistent
        await admin
          .from('refunds')
          .update({ status: refund.status, updated_at: new Date().toISOString() })
          .eq('id', id)
        throw txErr
      }

      // Audit log — fails loud (money has moved at this point).
      await logAdminAction({
        adminId:    ctx.userId,
        action:     'complete_refund',
        targetType: 'refund',
        targetId:   id,
        meta:       {
          payment_transaction_id: refund.payment_transaction_id,
          booking_id:             refund.booking_id,
          amount:                 refund.amount,
        },
      })
    }

    return ok({ refund: updatedRefund })
  } catch (err) {
    return handleApiError(err)
  }
}
