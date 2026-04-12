/**
 * Stripe Payment Gateway — International (SAR, USD, EUR, GBP, …)
 *
 * Uses Stripe Checkout Sessions (hosted payment page).
 * Automatically presents Apple Pay and Google Pay when available.
 *
 * Flow:
 *   1. POST https://api.stripe.com/v1/checkout/sessions → session.id + session.url
 *   2. Redirect user to session.url
 *   3. User pays on Stripe-hosted page
 *   4. Stripe webhooks → checkout.session.completed → confirm booking
 *
 * Required env vars:
 *   STRIPE_SECRET_KEY           — Stripe secret key (sk_live_... or sk_test_...)
 *   STRIPE_WEBHOOK_SECRET       — Webhook endpoint signing secret (whsec_...)
 *
 * Optional:
 *   STRIPE_INSTALLMENT_ENABLED  — Set to 'true' to enable installments (where available)
 */

import { createHmac, timingSafeEqual } from 'crypto'
import type { InitiatePaymentParams, InitiatePaymentResult, WebhookEvent, PaymentMethod } from './types'

const STRIPE_API = 'https://api.stripe.com/v1'

// ── Helpers ──────────────────────────────────────────────────────────────────

function requireEnv(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`Missing env var: ${name}`)
  return v
}

/**
 * Minimal Stripe API caller — avoids needing the stripe npm package.
 * Stripe accepts application/x-www-form-urlencoded for most endpoints.
 */
async function stripePost<T>(
  path: string,
  params: Record<string, unknown>,
): Promise<T> {
  const secretKey = requireEnv('STRIPE_SECRET_KEY')

  const body = flattenToFormData(params)

  const res = await fetch(`${STRIPE_API}${path}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${secretKey}`,
      'Content-Type':  'application/x-www-form-urlencoded',
      'Stripe-Version': '2024-06-20',
    },
    body,
  })

  const data = await res.json() as T & { error?: { message: string } }

  if (!res.ok) {
    const errData = data as { error?: { message: string } }
    throw new Error(`Stripe API error: ${errData.error?.message ?? res.status}`)
  }

  return data
}

/** Recursively flatten nested object to Stripe's form-encoded format */
function flattenToFormData(
  obj: Record<string, unknown>,
  prefix = '',
): string {
  const parts: string[] = []
  for (const [k, v] of Object.entries(obj)) {
    if (v === null || v === undefined) continue
    const key = prefix ? `${prefix}[${k}]` : k
    if (typeof v === 'object' && !Array.isArray(v)) {
      parts.push(flattenToFormData(v as Record<string, unknown>, key))
    } else if (Array.isArray(v)) {
      v.forEach((item, i) => {
        if (typeof item === 'object') {
          parts.push(flattenToFormData(item as Record<string, unknown>, `${key}[${i}]`))
        } else {
          parts.push(`${encodeURIComponent(`${key}[${i}]`)}=${encodeURIComponent(String(item))}`)
        }
      })
    } else {
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`)
    }
  }
  return parts.join('&')
}

/** Convert amount to Stripe's smallest unit (e.g. cents for USD, halalas for SAR) */
function amountInSmallestUnit(amount: number, currency: string): number {
  // Zero-decimal currencies (no cent subdivision):
  const zeroDecimal = ['bif', 'clp', 'gnf', 'jpy', 'kmf', 'mga', 'pyg', 'rwf', 'ugx', 'vnd', 'vuv', 'xaf', 'xof', 'xpf']
  if (zeroDecimal.includes(currency.toLowerCase())) return Math.round(amount)
  return Math.round(amount * 100)
}

// ── Initiate Stripe Checkout Session ─────────────────────────────────────────

interface StripeSession {
  id:  string
  url: string
}

// ── GET helper ───────────────────────────────────────────────────────────────

async function stripeGet<T>(path: string): Promise<T> {
  const secretKey = requireEnv('STRIPE_SECRET_KEY')
  const res = await fetch(`${STRIPE_API}${path}`, {
    headers: {
      'Authorization':  `Bearer ${secretKey}`,
      'Stripe-Version': '2024-06-20',
    },
  })
  const data = await res.json() as T & { error?: { message: string } }
  if (!res.ok) {
    const errData = data as { error?: { message: string } }
    throw new Error(`Stripe API error: ${errData.error?.message ?? res.status}`)
  }
  return data
}

// ── Refund lookup ─────────────────────────────────────────────────────────────

export interface StripeRefundStatus {
  id: string
  status: 'succeeded' | 'pending' | 'failed' | 'canceled' | string
  amount: number
  currency: string
  created: number
  failure_reason: string | null
}

/**
 * Fetch a Stripe refund by ID to verify its current status.
 */
export async function getStripeRefund(
  refundId: string,
): Promise<{ data: StripeRefundStatus | null; error?: string }> {
  try {
    const obj = await stripeGet<StripeRefundStatus & { failure_reason?: string | null }>(`/refunds/${refundId}`)
    return {
      data: {
        id:             obj.id,
        status:         obj.status,
        amount:         obj.amount,
        currency:       obj.currency,
        created:        obj.created,
        failure_reason: obj.failure_reason ?? null,
      },
    }
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

// ── Refund ────────────────────────────────────────────────────────────────────

/**
 * Refund a Stripe payment.
 *
 * @param gatewayRef  The Stripe PaymentIntent ID (pi_...) stored in gateway_ref
 * @param amount      Amount to refund in SAR
 */
export async function refundStripe(
  gatewayRef: string,
  amount: number,
): Promise<{ success: boolean; gatewayRefundRef?: string; error?: string }> {
  try {
    const data = await stripePost<{ id: string; status: string }>('/refunds', {
      payment_intent: gatewayRef,
      amount:         amountInSmallestUnit(amount, 'SAR'),
    })

    const success = data.status === 'succeeded' || data.status === 'pending'
    return { success, gatewayRefundRef: data.id }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

// ── Initiate Checkout ─────────────────────────────────────────────────────────

export async function initiateStripe(
  params: InitiatePaymentParams,
): Promise<InitiatePaymentResult> {
  const {
    bookingId, transactionId, amount, currency,
    userEmail, eventTitle, method,
    successUrl, cancelUrl, kind = 'ticket',
  } = params

  const unitAmount = amountInSmallestUnit(amount, currency)
  const expiresAt  = new Date(Date.now() + 30 * 60 * 1000).toISOString() // 30 min

  // Payment method types: always include 'card'; Apple/Google Pay are automatic
  // when using Stripe's hosted checkout on supported browsers/devices.
  const paymentMethodTypes = ['card']

  const sessionParams: Record<string, unknown> = {
    mode:    'payment',
    success_url: `${successUrl}?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url:  cancelUrl,
    expires_at:  Math.floor((Date.now() + 30 * 60 * 1000) / 1000), // Unix timestamp
    line_items: [
      {
        price_data: {
          currency:     currency.toLowerCase(),
          unit_amount:  unitAmount,
          product_data: {
            name:        `${eventTitle} — ${kind === 'donation' ? 'Donation' : kind === 'subscription' ? 'Membership' : 'Ticket'}`.slice(0, 255),
            description:
              kind === 'donation'
                ? 'Support the organizer via Rawaq'
                : kind === 'subscription'
                  ? 'Membership subscription via Rawaq'
                  : 'Powered by Rawaq',
          },
        },
        quantity: 1,
      },
    ],
    payment_method_types: paymentMethodTypes,
    metadata: {
      transaction_id: transactionId,
      payment_method: method,
      payment_kind:   kind,
    },
  }

  if (bookingId) {
    sessionParams.metadata = {
      ...(sessionParams.metadata as Record<string, unknown>),
      booking_id: bookingId,
    }
  }

  if (userEmail) {
    sessionParams.customer_email = userEmail
  }

  // Enable installments where available (e.g. SAR)
  if (process.env.STRIPE_INSTALLMENT_ENABLED === 'true') {
    sessionParams.payment_method_options = {
      card: {
        installments: { enabled: true },
      },
    }
  }

  const session = await stripePost<StripeSession>('/checkout/sessions', sessionParams)

  return {
    gateway:        'stripe',
    redirectUrl:    session.url,
    gatewayOrderId: session.id,
    expiresAt,
  }
}

// ── Webhook Verification & Parsing ───────────────────────────────────────────

/**
 * Verify Stripe webhook signature.
 * Stripe sends `Stripe-Signature` header with timestamp + HMAC-SHA256.
 * See: https://stripe.com/docs/webhooks/signatures
 */
export function verifyStripeSignature(
  rawBody: string,
  signature: string,
): boolean {
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!secret) {
    console.error('[stripe] STRIPE_WEBHOOK_SECRET not configured')
    return false
  }

  try {
    // signature format: t=TIMESTAMP,v1=HASH,v1=HASH2,...
    const parts     = signature.split(',').reduce<Record<string, string>>((acc, part) => {
      const [k, v] = part.split('=')
      acc[k] = v
      return acc
    }, {})

    const timestamp = parts['t']
    const v1        = parts['v1']
    if (!timestamp || !v1) return false

    const payload   = `${timestamp}.${rawBody}`
    const expected  = createHmac('sha256', secret).update(payload).digest('hex')

    const expectedBuf = Buffer.from(expected, 'hex')
    const actualBuf   = Buffer.from(v1,       'hex')

    if (expectedBuf.length !== actualBuf.length) return false
    return timingSafeEqual(expectedBuf, actualBuf)
  } catch {
    return false
  }
}

/**
 * Parse a Stripe webhook event into our normalized WebhookEvent.
 * We handle: checkout.session.completed, payment_intent.payment_failed
 */
export function parseStripeWebhook(
  event: Record<string, unknown>,
): WebhookEvent | null {
  const type   = event.type as string
  const dataObj = (event.data as Record<string, unknown>)?.object as Record<string, unknown>

  if (!dataObj) return null

  if (type === 'checkout.session.completed') {
    const metadata       = (dataObj.metadata as Record<string, string>) ?? {}
    const paymentStatus  = dataObj.payment_status as string
    const rawMethod      = metadata.payment_method ?? 'card'

    let paymentMethod: PaymentMethod = 'card'
    if (rawMethod === 'apple_pay')  paymentMethod = 'apple_pay'
    if (rawMethod === 'google_pay') paymentMethod = 'google_pay'

    return {
      gateway:        'stripe',
      gatewayOrderId: String(dataObj.id ?? ''),
      gatewayRef:     String(dataObj.payment_intent ?? dataObj.id ?? ''),
      gatewayPayload: event,
      status:         paymentStatus === 'paid' ? 'succeeded' : 'pending',
      amount:         Number(dataObj.amount_total ?? 0) / 100,
      currency:       String(dataObj.currency ?? 'usd').toUpperCase(),
      paymentMethod,
    }
  }

  if (type === 'checkout.session.async_payment_failed' || type === 'payment_intent.payment_failed') {
    const metadata = (dataObj.metadata as Record<string, string>) ?? {}
    return {
      gateway:        'stripe',
      gatewayOrderId: String(dataObj.id ?? ''),
      gatewayRef:     String(dataObj.payment_intent ?? dataObj.id ?? ''),
      gatewayPayload: event,
      status:         'failed',
      amount:         Number(dataObj.amount ?? 0) / 100,
      currency:       String(dataObj.currency ?? 'usd').toUpperCase(),
      paymentMethod:  (metadata.payment_method as PaymentMethod) ?? 'card',
      failureReason:  'Payment failed',
    }
  }

  return null
}
