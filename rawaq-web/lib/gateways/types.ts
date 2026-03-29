/**
 * Shared types for the multi-gateway payment abstraction layer.
 *
 * Gateway routing:
 *   EGP (Egypt)        → Paymob  (card, Apple Pay, Google Pay) + Fawry (cash)
 *   SAR / International → Stripe  (card, Apple Pay, Google Pay)
 *   Simulated (dev/test)→ Immediate success, no redirect
 */

export type GatewayName =
  | 'simulated'
  | 'paymob'
  | 'fawry'
  | 'stripe'
  | 'moyasar'
  | 'hyperpay'

export type PaymentMethod =
  | 'card'          // Credit/debit card
  | 'apple_pay'     // Apple Pay wallet
  | 'google_pay'    // Google Pay wallet
  | 'fawry'         // Fawry cash/kiosk (Egypt only)
  | 'wallet'        // Digital wallet (Paymob wallet, etc.)
  | 'installment'   // Buy Now Pay Later / installments

// ── Available payment option shown to user ──────────────────────────────────

export interface PaymentOption {
  id: string           // Unique key, e.g. 'paymob_card', 'stripe_card', 'fawry'
  gateway: GatewayName
  method: PaymentMethod
  label: string
  description: string
  icon: string         // Emoji or icon identifier
  currencies: string[] // Supported currencies, empty = all
  countries: string[]  // Supported countries (ISO 2-letter), empty = all
}

// ── Parameters for initiating a payment ────────────────────────────────────

export interface InitiatePaymentParams {
  bookingId: string
  transactionId: string   // payment_transactions.id (already created as 'pending')
  amount: number          // in the currency's major unit (e.g. 150.00 EGP)
  currency: string        // ISO 4217 (EGP, SAR, USD, …)
  userId: string
  userEmail?: string
  userPhone?: string
  userFirstName?: string
  userLastName?: string
  organizerId: string
  eventId: string
  eventTitle: string
  platformFeePct: number  // e.g. 0.10 for 10%
  method: PaymentMethod
  successUrl: string      // where to redirect after successful payment
  cancelUrl: string       // where to redirect if user cancels
}

// ── Result of payment initiation ───────────────────────────────────────────

export interface InitiatePaymentResult {
  gateway: GatewayName
  redirectUrl: string           // Hosted payment page URL (card / Apple Pay / Google Pay)
  fawryReferenceNumber?: string // Only for Fawry: reference shown to user
  gatewayOrderId?: string       // Paymob order ID or Stripe session ID
  expiresAt?: string            // ISO timestamp — payment window expiry
}

// ── Webhook event normalized across gateways ──────────────────────────────

export interface WebhookEvent {
  gateway: GatewayName
  gatewayOrderId: string
  gatewayRef: string        // Unique transaction/charge ID from gateway
  gatewayPayload: unknown   // Raw gateway response (stored in gateway_payload)
  status: 'succeeded' | 'failed' | 'pending'
  amount: number
  currency: string
  paymentMethod: PaymentMethod
  failureReason?: string
}
