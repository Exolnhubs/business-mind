/**
 * Paymob Payment Gateway — Egypt
 *
 * Supports: Card, Fawry (cash), Apple Pay, Google Pay, ValU installments
 *
 * Flow:
 *   1. POST /api/auth/tokens                    → auth_token
 *   2. POST /api/ecommerce/orders               → paymob_order_id
 *   3. POST /api/acceptance/payment_keys        → payment_key
 *   4. Redirect → https://accept.paymob.com/api/acceptance/iframes/{iframeId}?payment_token={payment_key}
 *
 * Webhook (Transaction Processed Callback):
 *   - Paymob POSTs to NEXT_PUBLIC_APP_URL/api/webhooks/paymob
 *   - HMAC-SHA512 computed from ordered transaction fields + PAYMOB_HMAC_SECRET
 *
 * Required env vars:
 *   PAYMOB_API_KEY              — Paymob API key
 *   PAYMOB_HMAC_SECRET          — For webhook HMAC verification
 *   PAYMOB_CARD_INTEGRATION_ID  — Card payments integration
 *   PAYMOB_FAWRY_INTEGRATION_ID — Fawry cash integration
 *   PAYMOB_APPLE_PAY_INTEGRATION_ID  — Apple Pay integration (optional)
 *   PAYMOB_GOOGLE_PAY_INTEGRATION_ID — Google Pay integration (optional)
 *   PAYMOB_CARD_IFRAME_ID       — Card iframe ID from Paymob dashboard
 */

import { createHmac, randomUUID } from 'crypto'
import type { InitiatePaymentParams, InitiatePaymentResult, WebhookEvent, PaymentMethod } from './types'

const BASE_URL = 'https://accept.paymob.com/api'

// ── Helpers ──────────────────────────────────────────────────────────────────

function requireEnv(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`Missing env var: ${name}`)
  return v
}

function amountInCents(amount: number): number {
  // Paymob expects amount in smallest currency unit (piastres for EGP)
  return Math.round(amount * 100)
}

function getIntegrationId(method: PaymentMethod): string {
  switch (method) {
    case 'fawry':
      return requireEnv('PAYMOB_FAWRY_INTEGRATION_ID')
    case 'apple_pay':
      return requireEnv('PAYMOB_APPLE_PAY_INTEGRATION_ID')
    case 'google_pay':
      return requireEnv('PAYMOB_GOOGLE_PAY_INTEGRATION_ID')
    case 'installment':
      return requireEnv('PAYMOB_VALU_INTEGRATION_ID')
    default:
      return requireEnv('PAYMOB_CARD_INTEGRATION_ID')
  }
}

// ── Step 1: Authenticate ─────────────────────────────────────────────────────

async function authenticate(): Promise<string> {
  const res = await fetch(`${BASE_URL}/auth/tokens`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ api_key: requireEnv('PAYMOB_API_KEY') }),
  })
  if (!res.ok) throw new Error(`Paymob auth failed: ${res.status}`)
  const data = await res.json()
  return data.token as string
}

// ── Step 2: Create Order ─────────────────────────────────────────────────────

async function createOrder(
  token: string,
  amountCents: number,
  currency: string,
  merchantOrderId: string,
  eventTitle: string,
  kind: 'ticket' | 'donation',
): Promise<number> {
  const res = await fetch(`${BASE_URL}/ecommerce/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      auth_token:          token,
      delivery_needed:     false,
      amount_cents:        amountCents,
      currency,
      merchant_order_id:   merchantOrderId,
      items: [
        {
          name:        eventTitle.slice(0, 100),
          amount_cents: amountCents,
          description: kind === 'donation' ? 'Event donation via Rawaq' : 'Event ticket via Rawaq',
          quantity:    1,
        },
      ],
    }),
  })
  if (!res.ok) throw new Error(`Paymob create order failed: ${res.status}`)
  const data = await res.json()
  return data.id as number
}

// ── Step 3: Get Payment Key ───────────────────────────────────────────────────

async function getPaymentKey(
  token: string,
  amountCents: number,
  currency: string,
  orderId: number,
  integrationId: string,
  billingData: PaymobBillingData,
): Promise<string> {
  const res = await fetch(`${BASE_URL}/acceptance/payment_keys`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      auth_token:     token,
      amount_cents:   amountCents,
      expiration:     3600,   // 1 hour
      order_id:       orderId,
      billing_data:   billingData,
      currency,
      integration_id: Number(integrationId),
      lock_order_when_paid: true,
    }),
  })
  if (!res.ok) throw new Error(`Paymob payment key failed: ${res.status}`)
  const data = await res.json()
  return data.token as string
}

interface PaymobBillingData {
  first_name:    string
  last_name:     string
  email:         string
  phone_number:  string
  apartment:     string
  floor:         string
  street:        string
  building:      string
  city:          string
  country:       string
  state:         string
  postal_code:   string
}

// ── Main: Initiate Paymob Checkout ───────────────────────────────────────────

export async function initiatePaymob(
  params: InitiatePaymentParams,
): Promise<InitiatePaymentResult> {
  const {
    bookingId, transactionId, amount, currency,
    userEmail, userPhone, userFirstName, userLastName,
    eventTitle, method, kind = 'ticket',
  } = params

  const amountCents    = amountInCents(amount)
  const integrationId  = getIntegrationId(method)
  const iframeId       = requireEnv('PAYMOB_CARD_IFRAME_ID')
  const expiresAt      = new Date(Date.now() + 60 * 60 * 1000).toISOString() // 1 hour

  const billingData: PaymobBillingData = {
    first_name:   userFirstName ?? 'Rawaq',
    last_name:    userLastName  ?? 'User',
    email:        userEmail     ?? 'customer@rawaq.app',
    phone_number: userPhone     ?? '+20000000000',
    apartment:    'N/A',
    floor:        'N/A',
    street:       'N/A',
    building:     'N/A',
    city:         'Cairo',
    country:      'EG',
    state:        'Cairo',
    postal_code:  'N/A',
  }

  // 3-step Paymob flow
  // Generate a fresh UUID as merchant_order_id on every call. Paymob rejects
  // with 422 if the same merchant_order_id is reused across attempts (e.g.
  // retrying after a failed payment). Webhook correlation uses Paymob's own
  // numeric order ID (stored in gateway_order_id), not merchant_order_id, so
  // this value is only a unique label for Paymob's records.
  const token        = await authenticate()
  const orderId      = await createOrder(token, amountCents, currency, randomUUID(), eventTitle, kind)
  const paymentKey   = await getPaymentKey(token, amountCents, currency, orderId, integrationId, billingData)

  const redirectUrl = method === 'fawry'
    // Fawry: Paymob hosts the Fawry reference number display
    ? `https://accept.paymob.com/api/acceptance/iframes/${iframeId}?payment_token=${paymentKey}`
    // Card / Apple Pay / Google Pay: Paymob hosted checkout
    : `https://accept.paymob.com/api/acceptance/iframes/${iframeId}?payment_token=${paymentKey}`

  return {
    gateway:        'paymob',
    redirectUrl,
    gatewayOrderId: String(orderId),
    expiresAt,
  }
}

// ── Webhook Verification & Parsing ───────────────────────────────────────────

/**
 * Paymob sends HMAC verification via query string param `hmac`.
 * The HMAC is computed as SHA512 of a specific concatenation of transaction fields.
 *
 * Fields (in order):
 *   amount_cents, created_at, currency, error_occured, has_parent_transaction,
 *   id, integration_id, is_3d_secure, is_auth, is_capture, is_refunded,
 *   is_standalone_payment, is_voided, order.id, owner, pending,
 *   source_data.pan, source_data.sub_type, source_data.type, success
 */
export function verifyPaymobHmac(obj: Record<string, unknown>, hmac: string): boolean {
  const secret = process.env.PAYMOB_HMAC_SECRET
  if (!secret) {
    console.error('[paymob] PAYMOB_HMAC_SECRET not configured')
    return false
  }

  const order     = (obj.order as Record<string, unknown>) ?? {}
  const sourceData = (obj.source_data as Record<string, unknown>) ?? {}

  const concatenated = [
    obj.amount_cents,
    obj.created_at,
    obj.currency,
    obj.error_occured,
    obj.has_parent_transaction,
    obj.id,
    obj.integration_id,
    obj.is_3d_secure,
    obj.is_auth,
    obj.is_capture,
    obj.is_refunded,
    obj.is_standalone_payment,
    obj.is_voided,
    order.id,
    obj.owner,
    obj.pending,
    sourceData.pan       ?? '',
    sourceData.sub_type  ?? '',
    sourceData.type      ?? '',
    obj.success,
  ].join('')

  const expected = createHmac('sha512', secret)
    .update(concatenated)
    .digest('hex')

  return expected === hmac
}

/**
 * Parse a Paymob webhook payload into our normalized WebhookEvent.
 */
export function parsePaymobWebhook(body: Record<string, unknown>): WebhookEvent | null {
  const obj = body.obj as Record<string, unknown> | undefined
  if (!obj) return null

  const order      = (obj.order as Record<string, unknown>) ?? {}
  const sourceData = (obj.source_data as Record<string, unknown>) ?? {}
  const success    = Boolean(obj.success)
  const pending    = Boolean(obj.pending)
  const isRefunded = Boolean(obj.is_refunded)
  const is3ds      = Boolean(obj.is_3d_secure)
  const errorOccured = Boolean(obj.error_occured)

  let status: WebhookEvent['status']
  if (isRefunded) {
    status = 'failed'
  } else if (success) {
    // success=true always means the payment was authorized, regardless of the
    // pending flag. Paymob sends success=true + pending=true for mobile wallets
    // and some card types where settlement is deferred — the authorization itself
    // is complete and we should confirm the booking immediately.
    status = 'succeeded'
  } else if (is3ds && !errorOccured) {
    // 3DS intermediate: Paymob fires success=false, pending=false, is_3d_secure=true
    // when the cardholder is being redirected to their bank. A second callback
    // with the real result arrives after 3DS completes. Treat as pending so we
    // don't cancel the booking prematurely.
    status = 'pending'
  } else if (pending) {
    // Genuinely awaiting user action (async payment method not yet completed).
    status = 'pending'
  } else {
    status = 'failed'
  }

  const rawMethod = String(sourceData.type ?? '').toLowerCase()
  let paymentMethod: PaymentMethod = 'card'
  if (rawMethod === 'wallet') paymentMethod = 'wallet'
  if (rawMethod === 'fawry')  paymentMethod = 'fawry'

  const amountCents = Number(obj.amount_cents ?? 0)

  return {
    gateway:        'paymob',
    gatewayOrderId: String(order.id ?? ''),
    gatewayRef:     String(obj.id ?? ''),
    gatewayPayload: body,
    status,
    amount:         amountCents / 100,
    currency:       String(obj.currency ?? 'EGP'),
    paymentMethod,
    failureReason:  success ? undefined : String(obj.data_message ?? 'Payment failed'),
  }
}
