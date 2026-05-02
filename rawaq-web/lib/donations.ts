import { sendNotification } from './notifications'
import { createSupabaseAdminClient } from './supabase/admin'

interface DonationTx {
  id: string
  user_id: string
  organizer_id: string
  event_id: string | null
  amount: number
  currency: string
  platform_fee: number
  gateway_payload: Record<string, unknown> | null
}

function extractDonationMessage(payload: Record<string, unknown> | null): string | null {
  const message = payload?.message
  return typeof message === 'string' && message.trim().length > 0
    ? message.trim()
    : null
}

function feePct(amount: number, platformFee: number): number {
  if (amount <= 0) return 0
  return Math.round((platformFee / amount) * 10000) / 10000
}

export async function finalizeDonationPayment(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  tx: DonationTx,
  gatewayRef: string,
  message?: string | null,
) {
  if (!tx.event_id) {
    throw new Error('Donation transaction missing event_id')
  }

  const { data: tip, error } = await admin
    .from('tips')
    .upsert({
      user_id:             tx.user_id,
      organizer_id:        tx.organizer_id,
      event_id:            tx.event_id,
      amount:              tx.amount,
      currency:            tx.currency,
      message:             message ?? extractDonationMessage(tx.gateway_payload),
      payment_ref:         gatewayRef,
      is_simulated:        false,
      platform_fee_pct:    feePct(tx.amount, tx.platform_fee),
      platform_fee_amount: tx.platform_fee,
    }, { onConflict: 'payment_ref' })
    .select('id')
    .single()

  if (error) throw error

  const { data: ev } = await admin
    .from('events')
    .select('title')
    .eq('id', tx.event_id)
    .single()

  sendNotification({
    userId: tx.organizer_id,
    type: 'tip_received',
    payload: {
      event_id: tx.event_id,
      event_title: ev?.title ?? '',
      amount: tx.amount,
      currency: tx.currency,
      tipper_id: tx.user_id,
    },
  }).catch(() => {})

  return tip.id as string
}
