/**
 * Payment gateway abstraction.
 *
 * Today:   SimulatedGateway — always succeeds, no real money moves.
 * Future:  Drop in MoyasarGateway (Saudi), StripeGateway, or HyperPayGateway
 *          by checking env vars:
 *            if (process.env.MOYASAR_SECRET_KEY) return moyasarCharge(params)
 *
 * The DB schema, wallet triggers, and business logic are identical
 * regardless of which gateway is active.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export interface ChargeParams {
  supabase: SupabaseClient
  userId: string
  organizerId: string
  eventId: string
  bookingId?: string
  tipId?: string
  type: 'ticket' | 'tip'
  amount: number
  platformFeePct: number   // e.g. 0.10 for 10%
  currency?: string
}

export interface ChargeResult {
  transactionId: string
  gatewayRef: string
  platformFee: number
  organizerNet: number
}

/**
 * Process a payment. Picks the correct gateway based on env configuration.
 * Wallet credit is handled automatically by the DB trigger
 * `trg_payment_wallet_sync` — do NOT update the wallet here.
 */
export async function processPayment(params: ChargeParams): Promise<ChargeResult> {
  // Future gateway selection:
  // if (process.env.MOYASAR_SECRET_KEY) return moyasarCharge(params)
  // if (process.env.STRIPE_SECRET_KEY)  return stripeCharge(params)
  return simulatedCharge(params)
}

// ─────────────────────────────────────────────────────────────
// Simulated gateway — MVP only
// ─────────────────────────────────────────────────────────────

async function simulatedCharge(params: ChargeParams): Promise<ChargeResult> {
  const {
    supabase, userId, organizerId, eventId,
    bookingId, tipId, type, amount, platformFeePct,
    currency = 'SAR',
  } = params

  const platformFee  = round2(amount * platformFeePct)
  const organizerNet = round2(amount - platformFee)
  const gatewayRef   = `sim_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`

  const { data, error } = await supabase
    .from('payment_transactions')
    .insert({
      user_id:       userId,
      organizer_id:  organizerId,
      event_id:      eventId,
      booking_id:    bookingId ?? null,
      tip_id:        tipId     ?? null,
      type,
      status:        'succeeded',  // simulated: always succeeds immediately
      amount,
      platform_fee:  platformFee,
      organizer_net: organizerNet,
      currency,
      gateway:       'simulated',
      gateway_ref:   gatewayRef,
      is_simulated:  true,
    })
    .select('id')
    .single()

  if (error) throw error

  return { transactionId: data.id, gatewayRef, platformFee, organizerNet }
}

// ─────────────────────────────────────────────────────────────
// Future: Moyasar gateway skeleton (uncomment when registering)
// ─────────────────────────────────────────────────────────────

// async function moyasarCharge(params: ChargeParams): Promise<ChargeResult> {
//   const { amount, currency = 'SAR', userId, organizerId, eventId, bookingId, tipId, type, platformFeePct, supabase } = params
//   const platformFee  = round2(amount * platformFeePct)
//   const organizerNet = round2(amount - platformFee)
//
//   // Call Moyasar Payment API
//   const response = await fetch('https://api.moyasar.com/v1/payments', {
//     method: 'POST',
//     headers: {
//       'Authorization': `Basic ${Buffer.from(process.env.MOYASAR_SECRET_KEY! + ':').toString('base64')}`,
//       'Content-Type': 'application/json',
//     },
//     body: JSON.stringify({
//       amount: Math.round(amount * 100),  // halalas
//       currency,
//       description: `${type} for event ${eventId}`,
//       source: { type: 'creditcard', ... },  // card token from frontend
//     }),
//   })
//   const gateway = await response.json()
//   const status = gateway.status === 'paid' ? 'succeeded' : 'failed'
//
//   const { data, error } = await supabase
//     .from('payment_transactions')
//     .insert({ user_id: userId, organizer_id: organizerId, event_id: eventId,
//               booking_id: bookingId, tip_id: tipId, type, status,
//               amount, platform_fee: platformFee, organizer_net: organizerNet,
//               currency, gateway: 'moyasar', gateway_ref: gateway.id,
//               gateway_payload: gateway, is_simulated: false })
//     .select('id').single()
//
//   if (error) throw error
//   if (status === 'failed') throw new Error(gateway.message ?? 'Payment failed')
//   return { transactionId: data.id, gatewayRef: gateway.id, platformFee, organizerNet }
// }

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
