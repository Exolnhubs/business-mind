# Paymob Intentions API Migration

**Date:** 2026-05-20  
**Status:** Approved  
**Scope:** `rawaq-web/lib/gateways/paymob.ts` + `rawaq-web/.env.example`

---

## Problem

The current Paymob integration uses the legacy 3-step API:
1. `POST /auth/tokens` → short-lived `auth_token`
2. `POST /ecommerce/orders` → numeric `order_id`
3. `POST /acceptance/payment_keys` → `payment_key`
4. Redirect to iframe: `accept.paymob.com/api/acceptance/iframes/{iframeId}?payment_token=…`

The Paymob dashboard has been migrated to the new Intentions API. The legacy API no longer applies.

---

## Solution

Replace the 3-step flow with a single `POST /v1/intention/` call to the new base URL. The response gives a `client_secret` used to build the unified checkout redirect URL.

**Only two files change:** `lib/gateways/paymob.ts` and `.env.example`.  
All callers, webhook handlers, refund routes, and DB correlation logic are unchanged.

---

## Architecture

### URL constants (replacing single `BASE_URL`)

```ts
const INTENTIONS_BASE_URL = process.env.PAYMOB_BASE_URL ?? 'https://accept.paymobsolutions.com'
const LEGACY_BASE_URL = 'https://accept.paymob.com/api'
```

- `INTENTIONS_BASE_URL` — used only by `createIntention()`
- `LEGACY_BASE_URL` — used by `refundPaymob()` and `getPaymobTransaction()`

### New flow in `initiatePaymob()`

```
createIntention()
  POST {INTENTIONS_BASE_URL}/v1/intention/
  Authorization: Token {PAYMOB_SECRET_KEY}

  Body:
  {
    amount:           amountCents,
    currency:         "EGP",
    payment_methods:  [integrationId],   // from getIntegrationId()
    items:            [{ name, amount, description, quantity: 1 }],
    billing_data:     { first_name, last_name, email, phone_number, apartment: "N/A", ... },
    customer:         { first_name, last_name, email },
    special_reference: randomUUID(),
    notification_url: "{APP_URL}/api/webhooks/paymob",
    redirection_url:  "{APP_URL}/api/payments/callback"
  }

  Response:
  {
    client_secret: "...",
    payment_keys: [{ order_id: 123456789, ... }]
  }
```

Returns `{ client_secret, gatewayOrderId: payment_keys[0].order_id }`.

### Redirect URL

Built by substituting into `PAYMOB_CHECKOUT_URL_TEMPLATE`:
```
https://accept.paymob.com/unifiedcheckout/?publicKey={publicKey}&clientSecret={clientSecret}
```

No iframe ID required.

### Order ID correlation (webhook)

`payment_keys[0].order_id` from the intention response is stored as `gateway_order_id` in `payment_transactions`. The webhook still sends `obj.order.id` matching this value. Lookup logic in `/api/webhooks/paymob` is **unchanged**.

### What stays the same

| Component | Status |
|-----------|--------|
| `verifyPaymobHmac()` | Unchanged |
| `parsePaymobWebhook()` | Unchanged |
| `refundPaymob()` | Unchanged (legacy domain) |
| `getPaymobTransaction()` | Unchanged (legacy domain) |
| `getIntegrationId()` | Unchanged — integration IDs still used in `payment_methods[]` |
| `/api/webhooks/paymob` | Unchanged |
| `/api/payments/callback` | Unchanged |
| `/api/payments/initiate` | Unchanged — same `initiatePaymob()` signature |
| `/api/bookings/[id]/refund` | Unchanged |
| `/api/subscriptions` | Unchanged |
| `lib/gateways/types.ts` | Unchanged |

### What is deleted from `paymob.ts`

- `authenticate()` — legacy `/auth/tokens` step
- `createOrder()` — legacy `/ecommerce/orders` step
- `getPaymentKey()` — legacy `/acceptance/payment_keys` step
- `PaymobBillingData` interface — inlined into intention payload
- `BASE_URL` constant — replaced by two distinct constants above

---

## Env vars

### Retired
```
PAYMOB_API_KEY
PAYMOB_CARD_IFRAME_ID
```

### Added
```
PAYMOB_BASE_URL=https://accept.paymobsolutions.com
PAYMOB_SECRET_KEY=
NEXT_PUBLIC_PAYMOB_PUBLIC_KEY=
PAYMOB_CHECKOUT_URL_TEMPLATE=https://accept.paymob.com/unifiedcheckout/?publicKey={publicKey}&clientSecret={clientSecret}
```

### Unchanged
```
PAYMOB_HMAC_SECRET
PAYMOB_CARD_INTEGRATION_ID
PAYMOB_FAWRY_INTEGRATION_ID
PAYMOB_APPLE_PAY_INTEGRATION_ID
PAYMOB_GOOGLE_PAY_INTEGRATION_ID
PAYMOB_VALU_INTEGRATION_ID
```

---

## Error handling

- `createIntention()` throws on non-2xx responses with the same `readErrorBody` + `createGatewayError` pattern already in use
- If `payment_keys` is empty or missing in the intention response, `createIntention()` throws — a null `gateway_order_id` would silently break webhook correlation
- Retry + timeout logic (`fetchPaymob`) applies to the intention call as it does today
- Callers in `initiate/route.ts` already catch and map gateway errors to 502/504 — no change needed

---

## Out of scope

- Webhook payload format changes (HMAC structure confirmed unchanged)
- Refund endpoint migration (stays on legacy domain)
- Transaction lookup endpoint migration (stays on legacy domain)
- Multi-method unified checkout (passing multiple integration IDs simultaneously)
