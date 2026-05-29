# Production Runbooks

Operational notes for on-call. Each section: what can break, how it manifests, what to do.

---

## Rate limiting / Redis (Upstash)

### Current behavior: **fail-closed**

Rate limiting runs through Upstash Redis (`lib/redis.ts`, `lib/rate-limit.ts`).
`checkRateLimit()` awaits `limiter.limit()` inside each route's `try` block. If
Redis is **unreachable or erroring**, that call **throws**, and `handleApiError`
converts it into an HTTP **500**.

> ⚠️ Despite the original audit phrasing ("fail-open"), the code as written
> **fails closed**: during an Upstash outage, every rate-limited endpoint
> returns 500 and those requests are rejected. This is safe (no abuse window)
> but means an Upstash outage degrades core flows (bookings, payments, scan,
> social, profile updates).

### Symptoms

- Spike in 500s across many endpoints simultaneously.
- Sentry events with stack traces originating in `@upstash/ratelimit` /
  `checkRateLimit`.
- Upstash dashboard shows elevated latency, errors, or quota exhaustion.

### Immediate response

1. Check the Upstash console (https://console.upstash.com) — database status,
   latency, daily command quota. Free tier has a hard daily cap.
2. If quota-exhausted: upgrade the Upstash plan or wait for the daily reset.
3. If Upstash is down with no quick fix and the 500s are blocking launch-critical
   flows, the **emergency** mitigation is to make `checkRateLimit` fail **open**
   (log + allow) so an infra outage doesn't take down checkout. This trades the
   abuse window for availability — only do this knowingly and revert once Redis
   recovers. (A permanent fail-open-with-alerting policy is a product decision,
   not an on-call default.)

### Required env vars

`UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are **hard-required** —
the app validates them on cold start via `validateEnv()` (`lib/env.ts`,
called from `instrumentation.ts`). A deploy missing them fails to boot rather
than silently disabling rate limiting.

---

## Environment validation

`validateEnv()` (`lib/env.ts`) runs once per cold start from
`instrumentation.ts` (Node runtime only). It hard-requires the infrastructure
vars (Supabase, app URL, Upstash Redis, `CRON_SECRET`, `INTERNAL_TRIGGER_SECRET`)
and throws a single aggregated error listing every missing/invalid one.

Feature vars (payment gateway keys/integration IDs, Resend, Firebase, Gemini,
`SENTRY_DSN`) are validated at point of use via `requireEnv()` so one missing
optional key doesn't take down the whole app.

**If a deploy crashes on boot with "Environment validation failed":** read the
listed vars, set them in the Vercel project env, and redeploy.

---

## Sentry

- DSN is read from `process.env.SENTRY_DSN` (no longer hard-coded). It must be
  set in the Vercel project env or Sentry capture is silently disabled.
- `sendDefaultPii: false` and `enableLogs: false` (PDPL/GDPR) — do not re-enable
  without a privacy review; user message bodies and PII must not reach Sentry.
- `tracesSampleRate: 0.05` in production to control quota.

---

## Payment webhooks (Paymob / Stripe)

- Both verify signatures/HMAC before processing; failures return 401 and are
  captured to Sentry.
- **Paymob "transaction not found"**: if the gateway order was created within the
  last 10 minutes, the handler returns **500** to force a Paymob retry (our
  `payments/initiate` write may not have committed `gateway_order_id` yet). For
  older orders it returns 200 ("not ours"). If you see repeated 500s here for
  genuinely foreign orders, check the recency heuristic in
  `app/api/webhooks/paymob/route.ts`.
- DB update failures mid-webhook return 500 so the gateway retries. This can
  cause duplicate processing attempts — full event-ID idempotency
  (`processed_webhook_events` table) is tracked as Phase 2 item 2.3 and not yet
  shipped.

---

## Refund flow

`app/api/bookings/[id]/refund/route.ts` uses **refund-row-first** ordering:

1. Insert refund row (`status: pending`) as a write-ahead intent.
2. Call the gateway.
3. On success → mark refund `completed`, mark tx `refunded`, cancel booking.
4. On failure → row stays `pending` (admin manual queue), booking stays
   `confirmed`.

**If a refund row is stuck `pending`:** the gateway call failed or a DB write
failed after a successful gateway refund (the latter is logged to Sentry with
`stage: refund_row_complete_failed_after_gateway_success`). Check Sentry for the
`refundId`, confirm with the gateway whether money actually moved, then complete
or void the row via the admin refunds endpoint.

---

## Cron jobs (Vercel)

`vercel.json` defines three crons:

| Path                              | Schedule      | Purpose                          |
|-----------------------------------|---------------|----------------------------------|
| `/api/cron/event-reminders`       | `* * * * *`   | Send event reminder notifications |
| `/api/cron/cancel-pending-bookings` | `*/10 * * * *` | Release expired pending holds   |
| `/api/cron/keep-warm`             | `*/3 * * * *` | Prevent cold starts              |

- Sub-hour crons require **Vercel Pro**. On Hobby they silently won't run at the
  configured frequency — fall back to an external scheduler (cron-job.org)
  hitting the routes with the `CRON_SECRET` header.
- All cron routes require `CRON_SECRET`.
