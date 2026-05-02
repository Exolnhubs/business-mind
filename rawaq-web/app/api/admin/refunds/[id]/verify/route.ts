/**
 * GET /api/admin/refunds/:id/verify
 *
 * Queries the original payment gateway to confirm a refund's current status.
 * Uses the refund's gateway_ref to look up the transaction directly.
 *
 * Returns:
 *   { verified: true,  status: 'refunded' | 'pending', raw: {...} }
 *   { verified: false, error: '...' }
 */

import { NextRequest } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/auth'
import { handleApiError, ok, NotFoundException, BadRequestException } from '@/lib/errors'
import { getPaymobTransaction } from '@/lib/gateways/paymob'
import { getStripeRefund } from '@/lib/gateways/stripe-gw'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdmin()
    const { id } = await params

    const admin = createSupabaseAdminClient()

    // Load refund + linked transaction for gateway info
    const { data: refund, error: fetchErr } = await admin
      .from('refunds')
      .select(`
        id, status, gateway_ref, refund_method, amount, is_simulated,
        transaction:payment_transaction_id (
          id, gateway, gateway_ref, is_simulated
        )
      `)
      .eq('id', id)
      .maybeSingle()

    if (fetchErr) throw fetchErr
    if (!refund)  throw new NotFoundException('Refund')
    const refundRow = refund as unknown as {
      is_simulated: boolean
      gateway_ref: string | null
      transaction: { gateway: string; gateway_ref: string } | null
    }

    if (refundRow.is_simulated) {
      return ok({
        verified: true,
        status:   'refunded',
        note:     'Simulated transaction — no real gateway call needed.',
        raw:      null,
      })
    }

    if (!refundRow.gateway_ref) {
      throw new BadRequestException(
        'No gateway reference stored for this refund. It may have been processed manually.',
      )
    }

    const tx = refundRow.transaction
    const gateway = tx?.gateway ?? 'unknown'

    // ── Paymob / Fawry ───────────────────────────────────────────────────────
    if (gateway === 'paymob' || gateway === 'fawry') {
      const { data, error } = await getPaymobTransaction(refundRow.gateway_ref)

      if (error || !data) {
        return ok({ verified: false, error: error ?? 'Gateway lookup failed', raw: null })
      }

      // A Paymob refund transaction shows success=true, is_refunded=true
      const confirmedRefunded = data.success && data.is_refunded
      const isPending         = data.pending && !data.is_refunded

      return ok({
        verified:  true,
        status:    confirmedRefunded ? 'refunded' : isPending ? 'pending' : 'unknown',
        gateway:   'paymob',
        detail: {
          transaction_id: data.id,
          success:        data.success,
          is_refunded:    data.is_refunded,
          is_voided:      data.is_voided,
          pending:        data.pending,
          amount:         data.amount_cents / 100,
          currency:       data.currency,
          error_message:  data.error_message,
          processed_at:   data.created_at,
        },
        raw: data,
      })
    }

    // ── Stripe ────────────────────────────────────────────────────────────────
    if (gateway === 'stripe') {
      const { data, error } = await getStripeRefund(refundRow.gateway_ref)

      if (error || !data) {
        return ok({ verified: false, error: error ?? 'Gateway lookup failed', raw: null })
      }

      return ok({
        verified: true,
        status:   data.status === 'succeeded' ? 'refunded' : data.status,
        gateway:  'stripe',
        detail: {
          refund_id:      data.id,
          status:         data.status,
          amount:         data.amount / 100,
          currency:       data.currency.toUpperCase(),
          failure_reason: data.failure_reason,
          processed_at:   new Date(data.created * 1000).toISOString(),
        },
        raw: data,
      })
    }

    return ok({
      verified: false,
      error:    `Verification not supported for gateway: ${gateway}`,
      raw:      null,
    })
  } catch (err) {
    return handleApiError(err)
  }
}
