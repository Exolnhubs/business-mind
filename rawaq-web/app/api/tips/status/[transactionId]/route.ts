import { NextRequest } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireAuth } from '@/lib/auth'
import { handleApiError, ok, NotFoundException, ForbiddenException } from '@/lib/errors'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ transactionId: string }> },
) {
  try {
    const { transactionId } = await params
    const ctx = await requireAuth()
    const admin = createSupabaseAdminClient()

    const { data: tx, error } = await (admin as any)
      .from('payment_transactions')
      .select('id, user_id, tip_id, type, status, gateway, gateway_ref, gateway_order_id, payment_method, amount, currency, failure_reason, created_at')
      .eq('id', transactionId)
      .eq('type', 'tip')
      .single()

    if (error || !tx) throw new NotFoundException('Donation transaction')
    if (tx.user_id !== ctx.userId) throw new ForbiddenException('Not your donation')

    return ok({
      transaction_id: tx.id,
      transaction_status: tx.status,
      tip_id: tx.tip_id,
      transaction: tx,
    })
  } catch (err) {
    return handleApiError(err)
  }
}
