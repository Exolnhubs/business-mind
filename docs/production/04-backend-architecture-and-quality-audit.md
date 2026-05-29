# Rawaq Web — Next.js Serverless Backend Audit

**Date:** 2026-05-29
**Auditor:** Production go-live review
**Scope:** `rawaq-web/app/api/**` (131 route handlers) + supporting `lib/` and `middleware.ts`
**Stack:** Next.js 15.2 (App Router, serverless) · Vercel (fra1) · Supabase (Postgres + Auth + Storage) · Upstash Redis · Paymob + Stripe · Google Gemini · Sentry · Resend · FCM

---

## 1. Executive Summary

The backend is **well-architected for an MVP and structurally ready to go live with a focused remediation pass.** The codebase shows mature thinking in many places: a single `requireAuth → cached-profile → handleApiError` spine, typed Zod validators on most write paths, a clean payment-gateway abstraction with HMAC verification, and per-user Upstash rate-limiters on the few endpoints that really need them.

Below the surface, however, are **eight high-impact issues** that should be closed before a public launch — most of which are configuration or one-line fixes, two of which touch financial correctness.

| # | Severity | Area | Issue |
|---|---|---|---|
| 1 | **🔴 Critical** | Cron scheduling | Only one cron is registered in `vercel.json`. `event-reminders` (designed for `* * * * *`) and `keep-warm` are never executed in production. `cancel-pending-bookings` is scheduled daily, but code comments and design assume hourly. |
| 2 | **🔴 Critical** | Webhooks / observability | All payment webhook errors are `console.error` only — no `Sentry.captureException`. A silent Paymob/Stripe webhook failure will leave bookings stuck in `pending` with zero alerting. |
| 3 | **🔴 Critical** | Privacy / compliance | `sentry.server.config.ts` ships with `sendDefaultPii: true`. Combined with the recommendations/support chats that include user messages, this exfiltrates PII to Sentry and likely violates KSA PDPL / GDPR for EU traffic. |
| 4 | **🟠 High** | SSRF | `/api/image-proxy` blocks private hostnames at the *initial* URL but sets `redirect: 'follow'` and re-checks nothing on redirect targets. A public URL can 301 → `http://169.254.169.254/...` (AWS metadata) on Vercel. |
| 5 | **🟠 High** | Auth coverage | `/api/promo-codes/validate` is unauthenticated and unrated — supports promo-code enumeration. |
| 6 | **🟠 High** | Race condition | `POST /api/bookings` creates a `confirmed` booking with no DB-level concurrency guard against capacity oversell on the free path; capacity check in `payments/initiate` is read-then-write without `SELECT … FOR UPDATE`. |
| 7 | **🟠 High** | Refund correctness | `POST /api/bookings/:id/refund` cancels the booking *before* calling the gateway. If the gateway call throws, the booking stays cancelled (capacity already decremented) but no refund row, no refund attempt — silent inconsistency. |
| 8 | **🟡 Medium** | Webhook retry semantics | Paymob webhook handler returns `200` ("not found") for unknown `gateway_order_id`. Correct for genuinely foreign orders, but it also hides our own race where the webhook arrives before `payments/initiate` has written `gateway_order_id` — Paymob will not retry. |

Beyond these, the report covers ~35 medium / low findings and a prioritized go-live checklist (§10).

**Verdict:** Ship-able with two days of focused work. None of the issues require architectural redesign; the foundation is sound.

---

## 2. Architecture Overview

### 2.1 Request lifecycle

```
Client (web cookie / mobile bearer)
  │
  ▼
middleware.ts            ─ Global IP rate-limit (300/min via Upstash, 600ms race-deadline)
                         ─ Supabase session refresh on page routes (skipped for /api/*)
  │
  ▼
app/api/**/route.ts      ─ requireAuth() / requireRole()
                         ─ Optional per-user rate-limit (checkRateLimit)
                         ─ Zod schema parse
                         ─ Business logic (admin or server Supabase client)
                         ─ handleApiError() → ApiException | ZodError | Postgres code → response
```

### 2.2 Shared infrastructure (lib/)

| Module | Role | Notes |
|---|---|---|
| `lib/auth.ts` | `requireAuth/Role/Owner/Admin/Organizer`, `requireEventOwnership` | Reads `Authorization: Bearer` (mobile) or cookie session (web); caches profile (role + is_banned) in Redis for 30s. Cache-miss path is safe (falls through to DB). |
| `lib/errors.ts` | `ApiException` hierarchy + `handleApiError`, `ok/created` helpers | Maps known Postgres codes (P0001/P0002/P0003 = capacity triggers, 23505, 23503, PGRST116). Zod errors become 422 with `fieldErrors`. |
| `lib/supabase/admin.ts` | Service-role singleton | Module-level cache reused across warm invocations — good for connection reuse. **101 of 131 routes use this**, deliberately bypassing RLS once auth has been verified in code. |
| `lib/supabase/server.ts` | RLS-respecting SSR client | Used in 46 routes (mostly GETs and admin reads where RLS already enforces). |
| `lib/supabase/profile-cache.ts` | Redis profile cache | 30s TTL; cleared on ban/role change in `admin/users/[id]` and `admin/organizers/[id]`. |
| `lib/rate-limit.ts` | Upstash sliding-window limiters | 17 named limiters covering the highest-abuse-risk endpoints. |
| `lib/gateways/` | `paymob.ts`, `stripe-gw.ts`, `selector.ts`, `types.ts` | Clean abstraction over both gateways; HMAC verification (Paymob: SHA-512; Stripe: SHA-256 with `timingSafeEqual`). Paymob has retry/timeout logic. |
| `lib/bookings/validate.ts` | Booking precondition resolver | Single source of truth for event/occurrence/profile/ticket-type/promo validation, shared by `bookings/route.ts` and `payments/initiate`. **This consolidation is a real strength.** |
| `lib/gemini.ts` | Multi-model Gemini fallback | Tries primary → env-configured fallbacks → built-in safety net (`gemini-2.0-flash`, `gemini-2.0-flash-lite`); recognizes transient vs quota-exhausted errors. |
| `lib/error-classifier.ts` + `error-emitter.ts` | Client-side error UX | Decouples how errors are presented (toasts) from raisers. |

**Strengths**

- **One canonical error path.** Every route uses `try { ... } catch (err) { return handleApiError(err) }`. Easy to audit, easy to extend, no scattered `try/catch` styles.
- **Auth helpers are tiny and orthogonal.** `requireAdmin → requireRole('admin','owner')` rather than duplicated role checks.
- **Connection reuse.** `createSupabaseAdminClient()` returns a module singleton — important for cold-start latency to Supabase/PostgREST.
- **Gateway fallback realism.** Paymob has explicit retry on transient `UND_ERR_*`/`ETIMEDOUT`, customized error messages distinguishing "could not be reached" vs "timed out", and 502 vs 504 mapping.

**Gaps**

- No central observability wrapper — every route writes its own `try/catch`, and most don't log to Sentry on failure. `Sentry.captureException` is called in **0 API routes** despite Sentry being initialized.
- Heavy use of unsafe casts: `53 × ' as never'` and `19 × 'as unknown as'` in route handlers (most are workarounds for `@supabase/ssr 0.5.2` ↔ `supabase-js 2.49` type-parameter mismatch noted in `lib/supabase/server.ts`). Functionally fine, but it disarms TS where it matters most.
- Two parallel Supabase client paths in `app/api/recommendations/chat/route.ts` — `createClient<Database>(URL, SERVICE_ROLE_KEY)` is created twice per request *inside* function bodies, bypassing the `lib/supabase/admin.ts` singleton. Should be refactored to reuse the singleton.

---

## 3. Payments & Webhooks (financial integrity)

### 3.1 `POST /api/payments/initiate`

**File:** `app/api/payments/initiate/route.ts`

What it does: validates booking input via `validateBookingInput`, upserts an `idempotent`-on-`booking_id` `payment_transactions` row, picks a gateway (Paymob | Stripe | simulated), calls the gateway to get a `redirect_url`, stores `gateway_order_id`, returns the URL.

**Strengths**

- Idempotency-aware: when the user retries against the same booking, an existing pending tx is marked `failed: 'superseded_by_new_attempt'` and a new one is created via upsert. Prevents duplicate charges on the same booking.
- Free-booking fast path short-circuits before touching the gateway and inserts a `confirmed` booking + emits notifications.
- Gateway-call failures bubble up as `ApiException` with status 502 (`PAYMENT_GATEWAY_ERROR`) or 504 (`PAYMENT_GATEWAY_TIMEOUT`) — distinguishable on the client.
- Notifications are dispatched through `waitUntil()` so they don't block the response — correct for serverless.
- Rate-limited (`limiters.payments`: 5/min/user).

**Risks**

1. **Capacity race.** The capacity check at lines 51-56:
   ```ts
   if (occurrence.capacity !== null && occurrence.bookings_count + input.group_size > occurrence.capacity)
   ```
   `occurrence.bookings_count` is read in `validateBookingInput` — there is no row-level lock, and the actual booking insert happens several statements later. Two concurrent requests can both pass the check and both insert.
   *The trigger-based P0001/P0002/P0003 capacity guards in `errors.ts` suggest there are DB-level guards, but the audit cannot verify that without seeing the migrations.* **Action:** Inspect `supabase/migrations/` for the actual triggers and confirm they enforce capacity atomically; if not, this is a real oversell risk.
2. **`group_size` cost calculation is single-source-of-truth on the server (good), but `discount_amount` is only applied to the *primary* ticket** (`primaryPrice = ticketType.price - discountAmount`). The `extraPrice = ticketType.price * (input.group_size - 1)` line does *not* apply the discount to the extras. This may be intentional (promo only applies to primary), but it's a quirk worth confirming with product.
3. **Mobile success/cancel URLs** point to `/api/payments/mobile-return` rather than a `rawaq://` deep link — verify the mobile-return route exists and redirects to the app correctly (we did not audit that route in depth).

### 3.2 `POST /api/webhooks/paymob`

**File:** `app/api/webhooks/paymob/route.ts`

**Strengths**

- HMAC-SHA512 verification using the documented field order (`amount_cents, created_at, currency, error_occured, …, success`); rejects with 401 on mismatch.
- Status mapping is thoughtful: handles the **3DS-intermediate quirk** where Paymob fires `success=false, pending=false, is_3d_secure=true` mid-flow (treated as `pending`). Wallets/Fawry with deferred settlement (`success=true, pending=true`) correctly treated as `succeeded`.
- Idempotency check: re-processed transactions skip with `'already processed'` 200, *except* tip rows that have not yet had `tip_id` written (donation-recovery escape hatch). Solid.
- Returns 500 on booking update failure so Paymob retries; returns 200 on "transaction not found" so Paymob doesn't retry forever.

**Risks**

1. **Logging is `console.error` only.** Every important failure (HMAC fail, tx not found, DB update fail, donation finalize fail) writes to console. Sentry is configured but `captureException` is never called. **A failed webhook update is invisible until a customer complains** about a `pending` booking. **High severity.**
2. **Webhook-arrives-before-DB-write race.** Paymob fires the webhook as soon as the transaction settles; `payments/initiate` writes `gateway_order_id` *after* the gateway call returns. In theory the gateway call cannot complete before the redirect to the user, but for async methods (Fawry, wallets) the webhook can fire before our DB write commits. The current code returns 200 (don't retry) when not found — so the booking stays pending forever. **Mitigation:** Either (a) write `gateway_order_id` *before* calling the gateway (we know it from `data.payment_keys[0].order_id`, but that happens *inside* `initiatePaymob`), or (b) return 500/410 in the `tx not found` branch to force Paymob retry, accepting the cost of occasional retry storms for foreign orders.
3. **`tx.status !== 'pending'` short-circuit** prevents replay attacks — good. But the donation-recovery escape hatch (`needsDonationRecovery`) opens a window where the same webhook is processed twice if `tip_id` write fails on the first pass. Not a security issue (it's the same Paymob event with verified HMAC), but worth a tag/lock.
4. **`processed_webhooks` table?** I did not find an `idempotency_key` table. Idempotency is inferred from `tx.status` (which mutates). Industry standard is to record the gateway event ID (`obj.id`) in a write-once dedup table and reject duplicates explicitly. Recommended for v2.

### 3.3 `POST /api/webhooks/stripe`

**File:** `app/api/webhooks/stripe/route.ts`

**Strengths**

- Verifies `Stripe-Signature` with `timingSafeEqual` (correct: prevents timing oracle on HMAC compare).
- Handles `checkout.session.completed`, `checkout.session.async_payment_failed`, `payment_intent.payment_failed`.
- Mirrors Paymob's tip-recovery semantics.

**Risks**

1. Same lack of Sentry / structured logging.
2. **No event-ID dedup.** Stripe occasionally re-delivers the same event after timeouts. Currently relies on `tx.status !== 'pending'`. Same idempotency-key recommendation as Paymob.
3. **No `event.id` audit log.** When something goes wrong, you cannot ask Stripe support "what happened to event evt_…" because we don't store it. Recommend persisting raw event IDs alongside the transaction (e.g., `gateway_event_ids text[]`).

### 3.4 `GET /api/payments/callback` (Paymob browser return)

**Strengths**

- Verifies HMAC even though the comment correctly notes it's purely a UX redirect.
- Looks up via `gateway_order_id` (the canonical correlation key now that `merchant_order_id` is a per-attempt UUID).
- Handles web vs mobile (`rawaq://payment-result?...`) split well.
- Handles tip and subscription redirect types separately.

**Risks**

- The HMAC verification is **guarded by `if (process.env.PAYMOB_HMAC_SECRET)`**. If the env var is unset in any environment, the entire signature check is silently skipped and the redirect is honored. Better: hard-fail on missing secret (it's required for prod).

### 3.5 `POST /api/bookings/:id/refund`

**File:** `app/api/bookings/[id]/refund/route.ts`

**Strengths**

- 24-hour refund window enforced server-side.
- Duplicate-refund guard via `refunds where status != 'rejected'`.
- Distinguishes simulated/no-gateway/unknown-gateway → manual queue, vs auto-refund.
- Rolls back cancellation if refund row insert fails (lines 195-200).

**Risks (High)**

1. **Wrong rollback ordering.** The flow is: ① cancel booking → ② call gateway refund → ③ insert refund row. If step ② succeeds (money is refunded!) but step ③ fails, the rollback at lines 195-200 re-confirms the booking *while the gateway has already refunded the money*. The user gets both their ticket and their money back. The rollback only handles the case where step ③ fails for the `pending` (manual) path — that is correct. The unsafe case is the auto-refund path where money has already moved. **Fix:** Refund row insert must happen *before* the gateway refund call, with status `pending`, then advance to `completed` after gateway success.
2. **Not rate-limited.** A user can spam refund requests against booking IDs they don't own — `ForbiddenException` is thrown but the DB is queried first. Add `limiters.payments` here.
3. **`autoRefundError` is captured but never surfaced.** If the gateway refund fails, the refund silently falls into the manual queue with `user_note` untouched and no internal log of *why*. Add a `failure_reason` column or store it in `refunds.gateway_payload`.

---

## 4. Bookings, Tickets, Events

### 4.1 `POST /api/bookings` (free path)

**File:** `app/api/bookings/route.ts`

- Force-sets `status: 'confirmed'` regardless of free/paid — meaning if a paid event slips through this endpoint (bypassing `payments/initiate`), the user gets a confirmed booking for free. The validator should reject paid events here.
- Rate-limited (`limiters.bookings`: 10/min/user). Good.
- Capacity check missing entirely. Relies on the DB trigger or on the read-after-insert sold-out check. **High** — a paid event that has slipped into this endpoint would also have its capacity bypass.

### 4.2 `POST /api/tickets/verify` + `POST /api/bookings/scan`

**Two endpoints doing almost the same thing.** Tickets/verify is the older, more featured endpoint (also has GET for QR landing); bookings/scan is leaner. They diverge in:
- `tickets/verify` doesn't import the rate limiter; `bookings/scan` doesn't either. Neither limits.
- `tickets/verify` uses `requireAuth` then plan-checks `canUseTicketScanner`; `bookings/scan` uses `requireOrganizer` first.
- `tickets/verify` returns `403` for "not yet open"; `bookings/scan` returns `200 { valid: false, reason: 'scan_not_open_yet' }`.

**Action:** Pick one as canonical, deprecate the other, mark the deprecated one with a `@deprecated` JSDoc and a console warning. Currently mobile and web likely call different ones — verify which clients hit which.

### 4.3 `GET /api/events/:id/occurrences` & `PATCH /api/events/:id/occurrences/[occurrenceId]`

- Uses `requireEventOwnership` for ownership — clean.
- `is_exception: true` flag on PATCH — recurring-event editing is implemented carefully (preserving duration when only start is changed).
- Rejects editing past or ongoing occurrences server-side — good.

### 4.4 `GET /api/events/:id/attendees`

- Properly gated to organizer or admin.
- Pagination via `range(from, from + perPage - 1)`. **`perPage` is parsed via `Number(...)` with no upper bound** — a client could request `per_page=10000` and dump the entire attendee list. Cap at 100. (Same issue exists in `app/api/bookings/route.ts` and a number of admin listing routes.)

### 4.5 Promo codes

- `POST /api/promo-codes/validate` is **public** and **unrate-limited** — supports promo-code enumeration. **High.** Either add a per-IP limiter (10/min) or scope to authenticated users only.
- `validateBookingInput` checks `promo.used_count >= promo.max_uses` non-atomically. The `used_count` increment happens elsewhere (trigger?) — verify it's atomic.

---

## 5. Admin / Auth / User Management

### 5.1 Auth helper consistency

- 106 of 131 routes go through `requireAuth/Role/Admin/Owner`. The 25 that don't include webhooks, cron, internal, public read endpoints (categories, plans listing, communities listing) — all reasonable.
- `optionalAuth()` (returns null on failure) used in a handful of read endpoints to gate organizer-private fields — correct pattern.

### 5.2 `PATCH /api/admin/users/:id`

- Prevents self-ban and prevents banning other admins.
- Calls `delCachedProfile(id)` — important: stale 30-second profile cache could otherwise let a banned user continue requesting.
- Writes audit log row.

**Issue:** The audit log insert uses `as never` to cast — fine, but failing audit-log inserts are silently swallowed (no `if (error) throw`). For a financial-adjacent admin platform, audit log writes should be fail-loud. Recommend wrapping in a helper that `throws` on failure or at minimum captures to Sentry.

### 5.3 `DELETE /api/admin/users/:id`

- Hard-deletes via `adminClient.auth.admin.deleteUser(id)` (cascades to `profiles`).
- No audit-log entry on delete. **Add one** — this is the highest-blast-radius admin action.
- No "anonymize-vs-delete" choice. Booking/payment history attached to the deleted user via FK cascade may corrupt financial records. **Action:** Confirm that `payment_transactions`, `bookings`, `refunds`, `wallet_ledger` FKs to the user are either `ON DELETE RESTRICT` or `SET NULL` — *not* `CASCADE`. Otherwise admin delete could wipe financial history.

### 5.4 `PATCH /api/admin/organizers/:id`

- Approves/rejects organizer applications and elevates/demotes the profile role.
- Clears profile cache after role change — good.
- **No audit log** despite changing a privilege level. Add one.
- The role demotion on rejected/suspended is permanent role change to `'user'` — what if the organizer had paid bookings as a user? Their role flip during a session may surprise the client. Soft state preferred.

### 5.5 `PATCH /api/admin/refunds/:id` & `PATCH /api/admin/payouts/:id`

- Both enforce a state-machine via `ALLOWED_TRANSITIONS` map — clean.
- Refund completion rolls back on `payment_transactions` update failure — good defensive code.
- Both lack audit logging despite moving money. **Add audit log rows.**

### 5.6 `POST /api/admin/users/:id/warn`

- Writes warning + audit log.
- No rate limit on warning issuance — an admin tool, low risk, but worth noting.

### 5.7 `GET/POST /api/organizer/bank-account`

- Uses `requireOrganizer` (organizer + admin + owner).
- IBAN normalized via `.replace(/\s+/g, '').toUpperCase()` — good.
- Resets `is_verified: false` on every update — forces admin re-verification, correct.
- **Sensitive PII in the database.** The `organizer_bank_accounts` table contains IBANs and SWIFT codes. Confirm:
  - RLS is enabled and restricts SELECT to the organizer themselves + admin role.
  - Field-level encryption (pgcrypto) is applied to `iban`, `swift_code`. *Currently they appear to be stored as plaintext.*

---

## 6. AI Endpoints, Uploads, Cron, Supporting

### 6.1 `/api/recommendations/chat` and `/api/support/chat`

Both call Gemini through `runGeminiWithFallback`.

**Strengths**

- Multi-model fallback (`gemini-2.5-flash` → env-configured → `gemini-2.0-flash-lite`).
- Distinguishes transient (retryable) errors from quota-exhausted (skip to next model). Good design.
- Rate limits: `limiters.recommendations` (20/min/user), `limiters.supportChat` (20/min/user).
- 30s `maxDuration` configured in `vercel.json`.
- Soft-fail UX: "The assistant is busy right now" instead of a 5xx.

**Risks**

1. **Cost / abuse vector.** Per-user limit is 20/min, but a user can run a long conversation that pushes Gemini context to its limit on each call. There's **no token budget** in the route — a single user could burn the daily quota for everyone. Suggest tracking estimated tokens per user per day in Redis and capping.
2. **PII to Sentry.** With `sendDefaultPii: true` and `enableLogs: true`, every Gemini error logged from chat routes carries user message text into Sentry. **High privacy concern.** Scrub or disable PII before launch.
3. **System prompt injection risk.** The recommendations bot parses `[SEARCH]{...json...}[/SEARCH]` blocks from Gemini output, then `JSON.parse`s them. A user can submit `[SEARCH]{"city":"..."}[/SEARCH]` themselves and *influence* what the server queries — but since the search params are constrained to a whitelist of cities/interests downstream and queries are SQL-safe via Supabase's parameterized API, the actual attack surface is limited to triggering unintended searches, not data exfiltration. Worth noting but not a critical fix.
4. **The recommendations route creates two ad-hoc `createClient<Database>(url, serviceRoleKey)` instances per request** instead of using `lib/supabase/admin.ts` — bypasses the connection-reuse singleton and is a maintenance footgun.
5. **Gemini error path on rate-limit (`RateLimitException`) goes through `isTransientGeminiError` first** which incorrectly classifies 429 as transient — but the code carefully guards with `if (!(err instanceof ApiException) && isTransientGeminiError(err))` so it does the right thing. Comment-worthy but correct.

### 6.2 `POST /api/upload` and `POST /api/upload/sign`

Both endpoints validate type, MIME, and size; both do per-user rate-limiting via `media_uploads` row counts.

**Strengths**

- Mobile/web parity: bearer-token or cookie session both supported.
- Bans enforced on both paths.
- Bucket auto-provisioning is idempotent (handles `'already exists'`).
- Path format `${userId}/${Date.now()}.${ext}` prevents cross-user overwrite.

**Risks**

1. **MIME type is trusted from the client.** `file.type` and `mimeType` (in the sign endpoint) come from the client. A malicious user can upload a `.exe` and label it `image/jpeg`. For comment-media and event-cover specifically, this could be served back from Supabase Storage with the spoofed type. **Action:** Either (a) sniff the first bytes server-side (magic number check), or (b) re-set Content-Type on a CDN egress (Supabase Storage may allow that via metadata).
2. **Rate limit via DB row counts** runs two `COUNT(*)` queries per upload — works, but flagged for cost as volumes scale. Reusing the Upstash rate limiter would be cheaper.
3. **`/api/upload/sign` doesn't include `allowedMimeTypes` in the bucket creation call** (unlike `/api/upload`). Two slightly different bucket-creation calls is a subtle drift that could surprise future maintainers.
4. The rate-limit `media_uploads` table is **append-only with no TTL**, growing forever. Add a periodic cleanup job (it's only needed for the last hour).

### 6.3 Cron jobs (**🔴 BLOCKER**)

`vercel.json` registers **only one** cron:

```json
"crons": [{ "path": "/api/cron/cancel-pending-bookings", "schedule": "0 2 * * *" }]
```

But the codebase contains **three** cron endpoints designed to run on different schedules:

| Endpoint | Designed cadence (per code/comments) | Actually scheduled? |
|---|---|---|
| `/api/cron/cancel-pending-bookings` | "Called every hour" (header comment in route) | Yes — daily at 02:00, **not hourly** |
| `/api/cron/event-reminders` | "Called every minute" (header comment); routes 55-65min and 23h55-24h05 windows | **No — not scheduled** |
| `/api/cron/keep-warm` | Warms cold-start-prone routes | **No — not scheduled** |

**Impact**

- **Event reminders will never be sent in production.** This is the single biggest functional gap. Users will not receive their 1-hour or 24-hour pre-event notifications. For an event-discovery platform that's a credibility-defining defect.
- **Pending bookings will linger for up to 24 hours** instead of the 15-minute window the code's `cutoff = now - 15min` implies. `payment_pending_until` is also set to 1 hour in `payments/initiate`, creating a 23-hour discrepancy between the design and the actual schedule.
- **Cold starts will impact perceived performance** for `/events/featured`, `/events`, `/categories` — the three highest-traffic endpoints.

**Fix:**
```jsonc
// vercel.json
"crons": [
  { "path": "/api/cron/event-reminders",         "schedule": "* * * * *" },
  { "path": "/api/cron/cancel-pending-bookings", "schedule": "*/10 * * * *" },
  { "path": "/api/cron/keep-warm",               "schedule": "*/3 * * * *" }
]
```
(Vercel Pro is required for sub-hour crons. If on Hobby, route `event-reminders` through cron-job.org as the code comments suggest.)

### 6.4 `/api/internal/booking-cancelled`

- Protected by `INTERNAL_TRIGGER_SECRET` header; called from a Postgres `pg_net` trigger.
- Zod-validates the payload, sends notification, returns 200.
- Clean implementation. **Risk:** the secret check uses strict string equality — fine, but if the secret is ever rotated, the DB function needs simultaneous update. Document this dependency.

### 6.5 `/api/image-proxy`

```ts
const BLOCKED_HOSTNAMES = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1|0\.0\.0\.0)/
```
Blocks the *initial* hostname — good. But:

1. `redirect: 'follow'` then proceeds to follow redirects with **no re-validation** of the target. A public URL `https://attacker.example.com/redir` can 301 → `http://169.254.169.254/latest/meta-data/iam/security-credentials/` on Vercel (AWS metadata endpoint), and the proxy will happily serve the bytes back. **SSRF.**
2. **No auth, no rate limit.** Anyone can route arbitrary traffic through your egress.
3. DNS rebinding: `attacker.com` resolves to a public IP on first lookup, then to a private one on the second. Mitigation requires socket-level binding or a server-side resolver.

**Fix:**
```ts
// Option A (preferred): use the official next/image loader with a remotePattern allowlist
// Option B: manually re-resolve and re-check after redirect using `redirect: 'manual'`
// and walking the chain
```

---

## 7. Cross-Cutting Concerns

### 7.1 Rate limiting

| Limiter | Limit | Used by |
|---|---|---|
| `globalIp` | 300/min | middleware on all `/api/*` |
| `bookings` | 10/min | `POST /api/bookings` |
| `payments` | 5/min | `POST /api/payments/initiate` |
| `chat` | 10/min | `POST /api/chat` |
| `comments` | 15/min | `POST /api/comments` |
| `supportChat` | 20/min | `POST /api/support/chat` |
| `recommendations` | 20/min | `POST /api/recommendations/chat` |
| `tips` | 5/min | (`/api/tips`) |
| `organizerReq` | 3/24h | (`/api/organizer/request`) |
| `reactions`, `rsvp`, `communityJoin`, `happenings`, `happeningParticipants`, `eventCreate`, `referralClaim`, `communityCreate` | varied | corresponding routes |

**Findings**

- Only **18 of 131 routes** apply a per-user limiter. The middleware's global 300/min/IP catches the most egregious abuse, but specific endpoints with state-mutating side effects should have their own.
- Notably missing per-user limits:
  - `POST /api/bookings/:id/refund` — no limit
  - `POST /api/tickets/verify` — no limit
  - `POST /api/bookings/scan` — no limit
  - `POST /api/upload` — DB-backed limit instead of Upstash
  - `POST /api/users/:id/follow`, `…/block`, `…/decline` — no limit; potential harassment vector
  - `POST /api/promo-codes/validate` — no limit (enumeration)
  - `POST /api/profiles/me` (PATCH) — no limit; account-spam by bots
- The global limiter has a 600 ms race-deadline against Upstash and **fails open** on Redis outage — sensible for availability, but means a Redis outage temporarily disables rate-limiting entirely. Document this in runbooks.

### 7.2 Observability (**Critical gap**)

- **`Sentry.captureException` is called from 0 API routes.** Sentry is initialized and `tunnelRoute: '/monitoring'` is configured to route browser traffic, but server-side errors only land in Sentry via unhandled exception propagation — which `handleApiError` always catches. As a result, **all 500s are silent in Sentry**.
  - **Fix:** Inside `handleApiError`, call `Sentry.captureException(error)` for unknown errors (the `console.error('[API Error]', error)` line at the end of the function).
- `sendDefaultPii: true` + `enableLogs: true` in `sentry.server.config.ts` exfiltrate user email, IPs, and possibly chat content. Disable for PDPL/GDPR compliance before launch.
- The hard-coded Sentry DSN in `sentry.server.config.ts` is a minor convenience for deploys but means a forgotten staging env will report into production Sentry. Move to `SENTRY_DSN` env var.
- `console.log` is used liberally in the Paymob webhook (lines 88, 92, 157) — these will show up in Vercel logs but won't surface in any structured way.

### 7.3 Security headers & CSP

`next.config.ts` ships a strict CSP — well done overall. Notable observations:

- `script-src 'unsafe-inline' 'unsafe-eval'` is required by Next.js's hydration scripts; with `tunnelRoute: '/monitoring'`, you could tighten this with nonces in App Router (Next.js 15 supports nonce propagation for app-router pages).
- `connect-src` includes `https://exp.host` — Expo dev server URL. Verify this is intentional for production (probably for OTA mobile updates) or remove.
- `worker-src 'self' blob:` is required for Serwist; correct.
- `vercel.json` separately declares CORS-adjacent headers (`X-Frame-Options`, `Permissions-Policy`, HSTS). **These overlap with `next.config.ts.headers()`** — duplication is harmless but means changes have to be made in two places.

### 7.4 Env-var validation

- No central env-var schema (Zod or otherwise). Each module that needs an env var calls `process.env.X!` or `requireEnv('X')`.
- `lib/gateways/paymob.ts` has a local `requireEnv()` that throws — good fail-fast.
- `lib/supabase/admin.ts` throws if `SUPABASE_SERVICE_ROLE_KEY` is missing — good.
- `lib/gateways/stripe-gw.ts` has a `requireEnv()` of its own — duplication; should be in a shared `lib/env.ts`.
- `.env.example` lists 30+ vars but **does not list `STRIPE_INSTALLMENT_ENABLED` or `INTERNAL_TRIGGER_SECRET` clearly** (the latter has a description; the former is undocumented).
- **Risk:** A missing env in production fails at the first request, not at startup. A consolidated `lib/env.ts` with Zod validation called from `instrumentation.ts` would surface missing config on cold start.

### 7.5 TypeScript safety

- 53 `as never` casts and 19 `as unknown as` in route handlers.
- Most are workarounds for the documented `@supabase/ssr 0.5.2 / supabase-js 2.49` mismatch — fine.
- A handful of casts in `lib/bookings/validate.ts` and `lib/notifications.ts` chain unsafe casts in a way that papers over real type mismatches between joined query shapes. These would benefit from inline Zod schemas to validate at the boundary.

### 7.6 Vercel function configuration

`vercel.json`:

```jsonc
"functions": {
  "app/api/**/*.ts":              { "memory": 1024, "maxDuration": 30 },
  "app/api/payments/initiate":    { "maxDuration": 30 },
  "app/api/webhooks/stripe":      { "maxDuration": 30 },
  "app/api/webhooks/paymob":      { "maxDuration": 30 },
  "app/api/support/chat":         { "maxDuration": 30 },
  "app/api/recommendations/chat": { "maxDuration": 30 }
}
```

- All routes get 1 GB + 30s; the specific overrides are redundant.
- 30s is on the high end for non-AI/non-payment routes — consider 10s default and only push to 30s where AI/payment latency warrants it. Saves wall-clock for stuck connections.
- `regions: ["fra1"]` — Frankfurt is far from Saudi Arabia (the primary market). Latency ~140 ms round-trip. Consider `cdg1` (Paris) or `bom1` (Mumbai) for better KSA/UAE latency, or multi-region (Vercel Pro+).

---

## 8. Endpoint Quality Snapshot (selected)

| Endpoint | Auth | Validation | Rate limit | Idempotency | Observability | Verdict |
|---|---|---|---|---|---|---|
| `POST /api/payments/initiate` | ✅ requireAuth | ✅ Zod | ✅ 5/min | ✅ upsert-on-booking | ⚠️ console only | **Sound** with the capacity race caveat |
| `POST /api/webhooks/paymob` | ✅ HMAC | ✅ parser | n/a (webhook) | ⚠️ status-flag based | ❌ console only | **Functional, needs Sentry + dedup table** |
| `POST /api/webhooks/stripe` | ✅ HMAC + timingSafeEqual | ✅ parser | n/a (webhook) | ⚠️ status-flag based | ❌ console only | **Functional, needs Sentry + dedup table** |
| `POST /api/bookings/[id]/refund` | ✅ requireAuth | ✅ Zod | ❌ none | ✅ duplicate guard | ⚠️ console only | **Reorder cancel/refund/insert; add rate limit** |
| `POST /api/bookings` | ✅ requireAuth | ✅ Zod | ✅ 10/min | ⚠️ existing-booking check | ⚠️ minimal | **Force-confirms; capacity race; missing paid-event guard** |
| `POST /api/tickets/verify` | ✅ requireAuth + plan | ✅ inline | ❌ none | ✅ idempotent scan | ⚠️ minimal | **Duplicate of bookings/scan** |
| `POST /api/bookings/scan` | ✅ requireOrganizer | ✅ Zod | ❌ none | ✅ idempotent scan | ⚠️ minimal | **Duplicate of tickets/verify** |
| `GET /api/promo-codes/validate` | ❌ none | ✅ inline | ❌ none | n/a (read) | ⚠️ minimal | **Public enumeration risk** |
| `POST /api/recommendations/chat` | ✅ requireAuth | ✅ Zod | ✅ 20/min | n/a | ✅ Gemini fallback | **Solid; cost/quota cap missing** |
| `POST /api/support/chat` | ✅ requireAuth | ✅ Zod (80 msg max) | ✅ 20/min | n/a | ✅ Gemini fallback | **Solid; ticket category fallback graceful** |
| `POST /api/upload` | ✅ dual-mode | ✅ MIME+size | ✅ DB-backed | n/a | ⚠️ minimal | **MIME spoof + perf concerns** |
| `GET /api/image-proxy` | ❌ none | ✅ URL parse | ❌ none | n/a | ❌ minimal | **SSRF — must fix before launch** |
| `GET /api/cron/event-reminders` | ✅ CRON_SECRET | ✅ inline | n/a | ✅ window-based | ⚠️ minimal | **Not scheduled in vercel.json** |
| `PATCH /api/admin/users/[id]` | ✅ requireAdmin | ✅ Zod | n/a | ✅ self-ban guard | ⚠️ audit silently fails | **Force audit success or capture** |
| `DELETE /api/admin/users/[id]` | ✅ requireAdmin | n/a | n/a | n/a | ❌ no audit log | **Add audit; verify FK ON DELETE policies** |
| `PATCH /api/admin/refunds/[id]` | ✅ requireAdmin | ✅ Zod + FSM | n/a | ✅ rollback on tx fail | ⚠️ no audit | **Add audit log** |
| `PATCH /api/admin/payouts/[id]` | ✅ requireAdmin | ✅ Zod + FSM | n/a | n/a | ⚠️ no audit | **Add audit log** |
| `POST /api/organizer/bank-account` | ✅ requireOrganizer | ✅ Zod | ❌ none | ✅ upsert | ⚠️ minimal | **Verify field encryption + RLS** |
| `GET /api/profiles/me` / PATCH | ✅ requireAuth | ✅ Zod | ❌ none | n/a | ⚠️ minimal | **Add update rate-limit (account-takeover defense)** |
| `POST /api/comments` | ✅ requireAuth | ✅ Zod | ✅ 15/min | n/a | ⚠️ minimal | **Sound** |
| `GET /api/feed` | ✅ requireAuth | ✅ Zod | ❌ none | n/a | ⚠️ minimal | **Sound** |

---

## 9. Architectural Recommendations

### 9.1 Short-term (do during launch hardening)

1. **Centralize observability.** Edit `lib/errors.ts → handleApiError` to call `Sentry.captureException(error, { extra: { url, userId } })` on the unknown-error path. Add per-webhook captures in `webhooks/paymob` and `webhooks/stripe`.
2. **Disable Sentry PII.** `sendDefaultPii: false`, `enableLogs: false` (or scrub message bodies via `beforeSend`).
3. **Fix `vercel.json` crons.** Add `event-reminders` (`* * * * *`), `cancel-pending-bookings` (`*/10 * * * *`), `keep-warm` (`*/3 * * * *`).
4. **Wrap audit-log inserts in a helper** that throws on failure, used by all admin mutations.
5. **Move env-var validation into `instrumentation.ts`.** Zod-validate the full required set on cold start; fail fast.
6. **Cap pagination** with `Math.min(perPage, 100)` everywhere `per_page` is parsed from query.
7. **Add per-user rate limit** to refund, follow, block, profile PATCH, promo validate.
8. **Fix the refund ordering**: insert refund row first (pending) → call gateway → on success update row to completed; on failure leave at pending for manual processing.
9. **Fix image-proxy SSRF.** Either deny redirects or re-validate target after every hop.

### 9.2 Medium-term (next 30 days post-launch)

10. **Idempotency-key table** for webhook events. Every Paymob/Stripe event ID stored once; reject on re-delivery.
11. **Replace cluster of `' as never'` casts** with regenerated Supabase types (update `@supabase/ssr` to ≥ 0.5.4 which has the type fix).
12. **Sniff file magic numbers** server-side in `/api/upload` before trusting client MIME.
13. **Cost budget for AI routes.** Track tokens/user/day in Redis; soft-cap at e.g. 50 K/day.
14. **DB-level capacity locks.** Replace the JS-side `bookings_count + group_size > capacity` check with `SELECT … FOR UPDATE` inside a Postgres function the route calls via `rpc()`. Or rely solely on the existing P0001 trigger and treat the JS check as advisory.
15. **Encrypt sensitive PII at rest.** IBAN/SWIFT in `organizer_bank_accounts` should use pgcrypto with a KMS-managed key (Supabase has Vault for this).
16. **Move from console to structured logging** in webhooks (and elsewhere). Use a thin wrapper like `log.error({ route, txId, err })`.

### 9.3 Long-term

17. **Region strategy.** Add `bom1` or `cdg1` for KSA users; keep `fra1` for EU.
18. **OpenAPI / type-share with mobile.** 131 routes + a mobile client is a lot of surface area to keep typed by hand. Generate types from Zod schemas → emit an OpenAPI spec → share with `rawaq-mobile`.
19. **Workflow engine for refund/payout state machines.** The current `ALLOWED_TRANSITIONS` map works fine at this scale but will multiply across refunds, payouts, organizer applications, support tickets, plan upgrades. Consider a single `workflow_states` table with a generic transition validator.

---

## 10. Pre-Launch Go-Live Checklist

### 🔴 BLOCKING (must close before public launch)

- [ ] Add `event-reminders` and `cancel-pending-bookings` to `vercel.json` crons with correct cadences.
- [ ] Add `Sentry.captureException` in `handleApiError` + both webhook handlers + refund route.
- [ ] Set `sendDefaultPii: false` and `enableLogs: false` in Sentry server + edge configs (or implement `beforeSend` scrubber).
- [ ] Reorder `bookings/[id]/refund`: insert refund row → call gateway → update row to completed.
- [ ] Patch `image-proxy` SSRF: deny redirects or re-resolve and re-validate target.
- [ ] Confirm `payment_transactions`, `bookings`, `refunds`, `wallet_ledger` FK cascade behaviour on `auth.users` delete is NOT cascade (financial preservation).
- [ ] Confirm DB-level capacity guard (Postgres trigger raising P0001) is in place for `bookings` insert.
- [ ] Add audit-log rows for admin user delete, organizer approve/reject, refund completion, payout completion.

### 🟠 STRONGLY RECOMMENDED (close during launch week)

- [ ] Per-user rate-limit on: refund, follow/block, profile PATCH, promo-validate, bookings/scan, tickets/verify.
- [ ] Cap `per_page` parameter at 100 across all paginated GETs.
- [ ] Webhook event-ID idempotency table (Paymob + Stripe).
- [ ] Pick one of `tickets/verify` vs `bookings/scan` as canonical; deprecate the other.
- [ ] Centralize env-var validation in `instrumentation.ts`.
- [ ] Verify mobile-return route correctness and deep-link interception on iOS/Android.
- [ ] Confirm CSP `connect-src 'exp.host'` is intentional for production.
- [ ] Document Redis outage failure mode (rate limit fails open) in runbook.
- [ ] Add cost-tracking metric in Sentry/Vercel for Gemini token usage per route.

### 🟡 DESIRABLE (post-launch backlog)

- [ ] Refactor `recommendations/chat` to use `lib/supabase/admin.ts` singleton.
- [ ] Add structured logging helper; remove `console.log` from webhook paths.
- [ ] Magic-number sniffing for upload MIME validation.
- [ ] Encrypt `organizer_bank_accounts.iban` and `swift_code` (pgcrypto).
- [ ] Regenerate Supabase types; eliminate `as never` casts.
- [ ] Consider `bom1`/`cdg1` Vercel region for KSA latency.
- [ ] Cleanup job for `media_uploads` table (rate-limit history).
- [ ] OpenAPI generation for mobile client type-share.

---

## 11. Notable Strengths to Preserve

Beyond the gaps above, several patterns in this codebase are notably well-executed for an MVP and should be preserved as the team scales:

- **One canonical error path.** `handleApiError` makes error handling auditable and consistent. Every shape of failure — Zod, ApiException, Postgres code, unknown — has a deterministic mapping. This is the single most valuable convention in the codebase; protect it.
- **Single source of truth for booking validation.** `lib/bookings/validate.ts` shared between `/api/bookings` and `/api/payments/initiate` is exactly the right factoring; resist the temptation to "just inline" similar logic in new routes.
- **Gateway abstraction.** `lib/gateways/{paymob,stripe-gw,selector,types}.ts` makes adding a future gateway (Moyasar, HyperPay) a contained change. The thoughtful 3DS-intermediate handling in `parsePaymobWebhook` shows the team has read the real gateway docs, not just the happy path.
- **Profile cache with safe invalidation.** Redis cache + explicit `delCachedProfile` on ban/role-change is exactly right — 30 s TTL bounds the staleness, explicit invalidation cuts it to zero on the events that matter.
- **State-machine guards** in refund and payout admin routes — much better than free-form status edits.
- **Mobile/web auth parity** with bearer + cookie supported by the same `requireAuth` is clean.
- **Server-trusted pricing.** Prices, fees, and platform-fee percentages are *always* computed server-side from the DB-side event/plan record — never trusted from the client.

---

## 12. Verdict

**The backend is launch-ready conditional on the BLOCKING items in §10.** The structural decisions are sound, the gateway abstraction is mature, and the auth/error/cache infrastructure is in better shape than most pre-launch Next.js APIs. The remaining risk surface is concentrated in a small number of misconfigurations (crons, Sentry PII) and a handful of subtle correctness issues (refund ordering, SSRF, capacity race), all of which can be closed in 1–2 focused days of work.

The findings above are bounded by what's visible in `app/`, `lib/`, `middleware.ts`, `next.config.ts`, and `vercel.json`. Two things this audit did **not** verify but that are worth a parallel review:

1. **Supabase migrations / RLS policies / triggers** (`rawaq-web/supabase/`) — several findings here depend on what's enforced at the DB level (capacity trigger, FK cascade on user delete, RLS on `organizer_bank_accounts`).
2. **Mobile client behaviour** on payment redirects (`/api/payments/mobile-return`, `rawaq://payment-result`) — needs end-to-end smoke test on physical iOS and Android.

Close those two and the 🔴 items, and this is a confident production launch.
