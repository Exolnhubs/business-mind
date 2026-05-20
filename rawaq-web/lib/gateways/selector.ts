/**
 * Gateway selector — picks the right payment provider and lists available
 * payment methods based on currency (and optionally user country).
 *
 * Routing rules:
 *   EGP → Paymob (card, Apple Pay, Google Pay, Fawry, installments)
 *   SAR / UAE / KWD / BHD / QAR / OMR → Stripe (or Moyasar when configured)
 *   USD / EUR / GBP / other → Stripe
 *   No env key configured → Simulated (dev/test)
 */

import type { PaymentOption, GatewayName, PaymentMethod } from './types'

// ── Available payment options per region ─────────────────────────────────────

const PAYMOB_OPTIONS: PaymentOption[] = [
  {
    id:          'paymob_card',
    gateway:     'paymob',
    method:      'card',
    label:       'Credit / Debit Card',
    description: 'Visa, Mastercard, Meeza — secured by 3DS',
    icon:        '💳',
    currencies:  ['EGP'],
    countries:   ['EG'],
  },
  {
    id:          'paymob_apple_pay',
    gateway:     'paymob',
    method:      'apple_pay',
    label:       'Apple Pay',
    description: 'Pay with Touch ID or Face ID',
    icon:        '',
    currencies:  ['EGP'],
    countries:   ['EG'],
  },
  {
    id:          'paymob_google_pay',
    gateway:     'paymob',
    method:      'google_pay',
    label:       'Google Pay',
    description: 'Fast checkout with Google',
    icon:        'G',
    currencies:  ['EGP'],
    countries:   ['EG'],
  },
  {
    id:          'fawry',
    gateway:     'fawry',
    method:      'fawry',
    label:       'Fawry',
    description: 'Pay at any Fawry outlet, kiosk, or ATM — no card needed',
    icon:        '🏪',
    currencies:  ['EGP'],
    countries:   ['EG'],
  },
]

const STRIPE_OPTIONS: PaymentOption[] = [
  {
    id:          'stripe_card',
    gateway:     'stripe',
    method:      'card',
    label:       'Credit / Debit Card',
    description: 'Visa, Mastercard, Amex — secured by 3DS',
    icon:        '💳',
    currencies:  [],   // all currencies
    countries:   [],
  },
  {
    id:          'stripe_apple_pay',
    gateway:     'stripe',
    method:      'apple_pay',
    label:       'Apple Pay',
    description: 'Pay with Touch ID or Face ID',
    icon:        '',
    currencies:  [],
    countries:   [],
  },
  {
    id:          'stripe_google_pay',
    gateway:     'stripe',
    method:      'google_pay',
    label:       'Google Pay',
    description: 'Fast checkout with Google',
    icon:        'G',
    currencies:  [],
    countries:   [],
  },
]

const SIMULATED_OPTIONS: PaymentOption[] = [
  {
    id:          'simulated',
    gateway:     'simulated',
    method:      'card',
    label:       'Test Payment (Simulated)',
    description: 'Development mode — no real money',
    icon:        '🧪',
    currencies:  [],
    countries:   [],
  },
]

// ── Gateway availability check ───────────────────────────────────────────────

function paymobConfigured(): boolean {
  return !!(
    process.env.PAYMOB_SECRET_KEY &&
    process.env.PAYMOB_CARD_INTEGRATION_ID &&
    process.env.PAYMOB_CHECKOUT_URL_TEMPLATE
  )
}

function stripeConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns ordered list of available payment options for a given currency.
 * Call on the server; currency comes from the event record.
 */
export function getPaymentOptions(currency: string): PaymentOption[] {
  const cur = currency.toUpperCase()

  if (cur === 'EGP' && paymobConfigured()) {
    const opts = [PAYMOB_OPTIONS[0]] // card always shown
    if (process.env.PAYMOB_APPLE_PAY_INTEGRATION_ID)  opts.push(PAYMOB_OPTIONS[1])
    if (process.env.PAYMOB_GOOGLE_PAY_INTEGRATION_ID) opts.push(PAYMOB_OPTIONS[2])
    if (process.env.PAYMOB_FAWRY_INTEGRATION_ID)      opts.push(PAYMOB_OPTIONS[3])
    return opts
  }

  if (stripeConfigured()) {
    return STRIPE_OPTIONS
  }

  // Fallback: simulated (dev / staging)
  return SIMULATED_OPTIONS
}

/**
 * Resolve the canonical gateway name for a given currency + payment option ID.
 */
export function resolveGateway(
  currency: string,
  optionId: string,
): { gateway: GatewayName; method: PaymentMethod } {
  const options = getPaymentOptions(currency)
  const opt     = options.find((o) => o.id === optionId)

  if (!opt) {
    // Default: first available option
    const first = options[0]
    return { gateway: first.gateway, method: first.method }
  }

  // Fawry uses paymob gateway under the hood (Paymob handles Fawry channel)
  if (opt.id === 'fawry') {
    return { gateway: 'paymob', method: 'fawry' }
  }

  return { gateway: opt.gateway, method: opt.method }
}
