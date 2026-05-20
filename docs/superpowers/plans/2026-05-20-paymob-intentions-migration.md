# Paymob Intentions API Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the legacy 3-step Paymob auth/order/payment-key flow with a single Intentions API call and unified checkout redirect URL.

**Architecture:** All changes are confined to `rawaq-web/lib/gateways/paymob.ts` and `rawaq-web/.env.example`. The public `initiatePaymob()` signature is unchanged so no callers need to be touched. Refund and transaction-lookup functions stay on the legacy domain.

**Tech Stack:** TypeScript, Next.js 14 App Router, Node.js `fetch`, `crypto` (built-in)

---

## File Map

| File | Change |
|------|--------|
| `rawaq-web/.env.example` | Retire `PAYMOB_API_KEY` + `PAYMOB_CARD_IFRAME_ID`; add `PAYMOB_BASE_URL`, `PAYMOB_SECRET_KEY`, `NEXT_PUBLIC_PAYMOB_PUBLIC_KEY`, `PAYMOB_CHECKOUT_URL_TEMPLATE` |
| `rawaq-web/lib/gateways/paymob.ts` | Replace 3-step legacy flow with `createIntention()`; split `BASE_URL` into two constants; update `initiatePaymob()`; delete unused helpers |

---

## Task 1: Update `.env.example`

**Files:**
- Modify: `rawaq-web/.env.example`

- [ ] **Step 1: Replace the Paymob env block**

Open `rawaq-web/.env.example`. Find the `# Payments (Paymob)` section (currently lines 23–32) and replace it entirely with:

```bash
# Payments (Paymob)
PAYMOB_BASE_URL=https://accept.paymobsolutions.com
PAYMOB_SECRET_KEY=
NEXT_PUBLIC_PAYMOB_PUBLIC_KEY=
PAYMOB_CHECKOUT_URL_TEMPLATE=https://accept.paymob.com/unifiedcheckout/?publicKey={publicKey}&clientSecret={clientSecret}
PAYMOB_HMAC_SECRET=
PAYMOB_CARD_INTEGRATION_ID=
PAYMOB_FAWRY_INTEGRATION_ID=
PAYMOB_APPLE_PAY_INTEGRATION_ID=
PAYMOB_GOOGLE_PAY_INTEGRATION_ID=
PAYMOB_VALU_INTEGRATION_ID=
```

`PAYMOB_API_KEY` and `PAYMOB_CARD_IFRAME_ID` are intentionally removed.

- [ ] **Step 2: Commit**

```bash
git add rawaq-web/.env.example
git commit -m "chore: update .env.example for Paymob Intentions API"
```

---

## Task 2: Rewrite `paymob.ts` — step-by-step in compile-safe order

The changes below must be applied in sequence within a single editing session. Each sub-step leaves the file compilable. Apply them all before running the TypeScript check at the end.

**Files:**
- Modify: `rawaq-web/lib/gateways/paymob.ts`

### 2a — Replace `BASE_URL` with two constants and update `fetchPaymob` signature

- [ ] **Step 1: Replace the `BASE_URL` constant and update `fetchPaymob`**

Find this near the top of the file:

```ts
const BASE_URL = "https://accept.paymob.com/api";
```

Replace it with:

```ts
const LEGACY_BASE_URL = "https://accept.paymob.com/api";
const INTENTIONS_BASE_URL =
  process.env.PAYMOB_BASE_URL ?? "https://accept.paymobsolutions.com";
```

Then find the `fetchPaymob` function signature:

```ts
async function fetchPaymob(
  step: string,
  path: string,
  init: RequestInit,
): Promise<Response> {
  const url = `${BASE_URL}${path}`;
```

Replace it with:

```ts
async function fetchPaymob(
  step: string,
  path: string,
  init: RequestInit,
  baseUrl: string = LEGACY_BASE_URL,
): Promise<Response> {
  const url = `${baseUrl}${path}`;
```

Everything else inside `fetchPaymob` stays identical. All existing callers (`authenticate`, `refundPaymob`, `getPaymobTransaction`) omit the fourth argument and automatically use `LEGACY_BASE_URL`. File still compiles.

### 2b — Add `createIntention()` and its response interface

- [ ] **Step 2: Add the intention interface and function after `getIntegrationId()`**

Find the comment `// ── Step 1: Authenticate` and insert the following block immediately **before** it (i.e., right after `getIntegrationId` ends):

```ts
// ── Intention API response shape ──────────────────────────────────────────────

interface PaymobIntentionResponse {
  client_secret: string;
  payment_keys: Array<{ order_id: number; [key: string]: unknown }>;
}

// ── Create Intention (single-step replacement for auth+order+payment_key) ─────

async function createIntention(
  amountCents: number,
  currency: string,
  integrationId: string,
  billingData: Record<string, string>,
  eventTitle: string,
  kind: "ticket" | "donation" | "subscription",
): Promise<{ clientSecret: string; orderId: number }> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://rawaq.app";

  const res = await fetchPaymob(
    "intention creation",
    "/v1/intention/",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Token ${requireEnv("PAYMOB_SECRET_KEY")}`,
      },
      body: JSON.stringify({
        amount: amountCents,
        currency,
        payment_methods: [Number(integrationId)],
        items: [
          {
            name: eventTitle.slice(0, 100),
            amount: amountCents,
            description:
              kind === "donation"
                ? "Event donation via Rawaq"
                : kind === "subscription"
                  ? "Membership subscription via Rawaq"
                  : "Event ticket via Rawaq",
            quantity: 1,
          },
        ],
        billing_data: billingData,
        customer: {
          first_name: billingData.first_name,
          last_name: billingData.last_name,
          email: billingData.email,
        },
        special_reference: randomUUID(),
        notification_url: `${appUrl}/api/webhooks/paymob`,
        redirection_url: `${appUrl}/api/payments/callback`,
      }),
    },
    INTENTIONS_BASE_URL,
  );

  if (!res.ok) {
    const details = await readErrorBody(res);
    throw new Error(
      `Paymob intention creation failed: ${res.status}${details ? ` ${details}` : ""}`,
    );
  }

  const data = (await res.json()) as PaymobIntentionResponse;

  const orderId = data.payment_keys?.[0]?.order_id;
  if (!orderId) {
    throw new Error(
      "Paymob intention response missing payment_keys[0].order_id — cannot correlate webhook",
    );
  }

  return { clientSecret: data.client_secret, orderId };
}
```

File still compiles — the old 3-step helpers are still present.

### 2c — Rewrite `initiatePaymob()` body

- [ ] **Step 3: Replace the body of `initiatePaymob()`**

Find the `initiatePaymob` export. The full function currently looks like:

```ts
export async function initiatePaymob(
  params: InitiatePaymentParams,
): Promise<InitiatePaymentResult> {
  const {
    amount,
    currency,
    userEmail,
    userPhone,
    userFirstName,
    userLastName,
    eventTitle,
    method,
    kind = "ticket",
  } = params;

  const amountCents = amountInCents(amount);
  const integrationId = getIntegrationId(method);
  const iframeId = requireEnv("PAYMOB_CARD_IFRAME_ID");
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour

  const billingData: PaymobBillingData = {
    first_name: userFirstName ?? "Rawaq",
    last_name: userLastName ?? "User",
    email: userEmail ?? "customer@rawaq.app",
    phone_number: userPhone ?? "+20000000000",
    apartment: "N/A",
    floor: "N/A",
    street: "N/A",
    building: "N/A",
    city: "Cairo",
    country: "EG",
    state: "Cairo",
    postal_code: "N/A",
  };

  // 3-step Paymob flow
  // Generate a fresh UUID as merchant_order_id on every call. Paymob rejects
  // with 422 if the same merchant_order_id is reused across attempts (e.g.
  // retrying after a failed payment). Webhook correlation uses Paymob's own
  // numeric order ID (stored in gateway_order_id), not merchant_order_id, so
  // this value is only a unique label for Paymob's records.
  const token = await authenticate();
  const orderId = await createOrder(
    token,
    amountCents,
    currency,
    randomUUID(),
    eventTitle,
    kind,
  );
  const paymentKey = await getPaymentKey(
    token,
    amountCents,
    currency,
    orderId,
    integrationId,
    billingData,
  );

  const redirectUrl =
    method === "fawry"
      ? // Fawry: Paymob hosts the Fawry reference number display
        `https://accept.paymob.com/api/acceptance/iframes/${iframeId}?payment_token=${paymentKey}`
      : // Card / Apple Pay / Google Pay: Paymob hosted checkout
        `https://accept.paymob.com/api/acceptance/iframes/${iframeId}?payment_token=${paymentKey}`;

  return {
    gateway: "paymob",
    redirectUrl,
    gatewayOrderId: String(orderId),
    expiresAt,
  };
}
```

Replace it entirely with:

```ts
export async function initiatePaymob(
  params: InitiatePaymentParams,
): Promise<InitiatePaymentResult> {
  const {
    amount,
    currency,
    userEmail,
    userPhone,
    userFirstName,
    userLastName,
    eventTitle,
    method,
    kind = "ticket",
  } = params;

  const amountCents = amountInCents(amount);
  const integrationId = getIntegrationId(method);
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

  const billingData = {
    first_name: userFirstName ?? "Rawaq",
    last_name: userLastName ?? "User",
    email: userEmail ?? "customer@rawaq.app",
    phone_number: userPhone ?? "+20000000000",
    apartment: "N/A",
    floor: "N/A",
    street: "N/A",
    building: "N/A",
    city: "Cairo",
    country: "EG",
    state: "Cairo",
    postal_code: "N/A",
  };

  const { clientSecret, orderId } = await createIntention(
    amountCents,
    currency,
    integrationId,
    billingData,
    eventTitle,
    kind,
  );

  const template = requireEnv("PAYMOB_CHECKOUT_URL_TEMPLATE");
  const publicKey = requireEnv("NEXT_PUBLIC_PAYMOB_PUBLIC_KEY");
  const redirectUrl = template
    .replace("{publicKey}", publicKey)
    .replace("{clientSecret}", clientSecret);

  return {
    gateway: "paymob",
    redirectUrl,
    gatewayOrderId: String(orderId),
    expiresAt,
  };
}
```

File still compiles — old helpers exist but are now unreferenced.

### 2d — Delete the 2 legacy step functions and `PaymobBillingData`

> **Important:** `authenticate()` is **kept** — it is still called by `refundPaymob()` and `getPaymobTransaction()` which remain on the legacy domain. Only `createOrder()` and `getPaymentKey()` are removed.

- [ ] **Step 4: Delete `createOrder()`**

Find and delete this entire function including its section comment:

```ts
// ── Step 2: Create Order ─────────────────────────────────────────────────────

async function createOrder(
  token: string,
  amountCents: number,
  currency: string,
  merchantOrderId: string,
  eventTitle: string,
  kind: "ticket" | "donation" | "subscription",
): Promise<number> {
  const res = await fetchPaymob("order creation", "/ecommerce/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      auth_token: token,
      delivery_needed: false,
      amount_cents: amountCents,
      currency,
      merchant_order_id: merchantOrderId,
      items: [
        {
          name: eventTitle.slice(0, 100),
          amount_cents: amountCents,
          description:
            kind === "donation"
              ? "Event donation via Rawaq"
              : kind === "subscription"
                ? "Membership subscription via Rawaq"
                : "Event ticket via Rawaq",
          quantity: 1,
        },
      ],
    }),
  });
  if (!res.ok) {
    const details = await readErrorBody(res);
    throw new Error(
      `Paymob create order failed: ${res.status}${details ? ` ${details}` : ""}`,
    );
  }
  const data = await res.json();
  return data.id as number;
}
```

- [ ] **Step 6: Delete `getPaymentKey()` and `PaymobBillingData`**

Find and delete this entire block including the interface:

```ts
// ── Step 3: Get Payment Key ───────────────────────────────────────────────────

async function getPaymentKey(
  token: string,
  amountCents: number,
  currency: string,
  orderId: number,
  integrationId: string,
  billingData: PaymobBillingData,
): Promise<string> {
  const res = await fetchPaymob(
    "payment key creation",
    "/acceptance/payment_keys",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        auth_token: token,
        amount_cents: amountCents,
        expiration: 3600, // 1 hour
        order_id: orderId,
        billing_data: billingData,
        currency,
        integration_id: Number(integrationId),
        lock_order_when_paid: true,
      }),
    },
  );
  if (!res.ok) {
    const details = await readErrorBody(res);
    throw new Error(
      `Paymob payment key failed: ${res.status}${details ? ` ${details}` : ""}`,
    );
  }
  const data = await res.json();
  return data.token as string;
}

interface PaymobBillingData {
  first_name: string;
  last_name: string;
  email: string;
  phone_number: string;
  apartment: string;
  floor: string;
  street: string;
  building: string;
  city: string;
  country: string;
  state: string;
  postal_code: string;
}
```

### 2e — Verify and commit

- [ ] **Step 7: Run TypeScript check**

```bash
cd rawaq-web && npx tsc --noEmit
```

Expected output: no errors. If you see errors referencing `authenticate`, `createOrder`, `getPaymentKey`, `PaymobBillingData`, `PAYMOB_API_KEY`, `PAYMOB_CARD_IFRAME_ID`, or `BASE_URL`, one of the deletions above was missed.

- [ ] **Step 8: Verify no stale references remain**

```bash
cd rawaq-web && grep -r "PAYMOB_API_KEY\|PAYMOB_CARD_IFRAME_ID\|createOrder(\|getPaymentKey(\|PaymobBillingData\|[^S_]BASE_URL" --include="*.ts" --include="*.tsx" .
```

Expected output: no matches. (`authenticate` is intentionally excluded from this grep — it is still present and used by refund/lookup functions. `.env.local` and `.env.example` are not `.ts` files and won't appear.)

- [ ] **Step 9: Commit**

```bash
git add rawaq-web/lib/gateways/paymob.ts
git commit -m "feat(payments): migrate Paymob to Intentions API

Replace 3-step legacy auth/order/payment-key flow with single
POST /v1/intention/ call. Checkout now uses unified checkout URL
instead of iframe. Refund and transaction-lookup endpoints unchanged."
```

---

## Verification checklist (manual, after deploy)

These cannot be automated without a Paymob sandbox account. Verify in staging:

- [ ] Initiate a card payment for an EGP event → redirects to `accept.paymob.com/unifiedcheckout/` (not an iframe URL)
- [ ] Complete the payment → webhook fires → booking flips to `confirmed`
- [ ] Attempt a refund → `refundPaymob` hits the legacy domain → refund succeeds
- [ ] Check Paymob dashboard → intention appears with the correct amount and integration
