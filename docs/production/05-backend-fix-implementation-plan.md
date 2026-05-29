# Backend Fix Implementation Plan

**Date:** 2026-05-29
**Source audit:** [`04-backend-architecture-and-quality-audit.md`](./04-backend-architecture-and-quality-audit.md)
**Status:** Awaiting approval before execution

This document turns the audit's findings into concrete, file-level fix tasks. Items are grouped by phase. Each task has: scope, files touched, change description, verification step, and whether a subagent can execute it autonomously or it needs human input.

---

## Phase 1 — 🔴 Blockers (must close before launch)

These 8 items are the go/no-go set. Estimated effort: ~1.5 days for a focused engineer.

### 1.1 Fix Vercel cron schedule

**File:** `rawaq-web/vercel.json`

**Change:** Replace the single-cron block with three crons:

```jsonc
"crons": [
  { "path": "/api/cron/event-reminders",         "schedule": "* * * * *" },
  { "path": "/api/cron/cancel-pending-bookings", "schedule": "*/10 * * * *" },
  { "path": "/api/cron/keep-warm",               "schedule": "*/3 * * * *" }
]
```

**Verify:** `CRON_SECRET` is set; Vercel Pro plan supports sub-hour crons (Hobby does not — if Hobby, fall back to cron-job.org as noted in route comments).

**Subagent:** ✅ Can do. **Needs human confirmation:** Vercel plan tier.

---

### 1.2 Wire `Sentry.captureException` into error handler

**Files:**
- `rawaq-web/lib/errors.ts` (`handleApiError`)
- `rawaq-web/app/api/webhooks/paymob/route.ts`
- `rawaq-web/app/api/webhooks/stripe/route.ts`
- `rawaq-web/app/api/bookings/[id]/refund/route.ts`

**Change:**
- In `handleApiError`'s unknown-error branch, replace `console.error('[API Error]', error)` with `Sentry.captureException(error)`. Keep the `console.error` for local dev visibility.
- In webhook handlers, capture every `console.error` site with `Sentry.captureException(err, { extra: { txId, gatewayOrderId } })`.

**Verify:** Trigger a contrived 500 in dev, confirm event lands in Sentry.

**Subagent:** ✅ Can do.

---

### 1.3 Disable PII in Sentry config (PDPL / GDPR)

**Files:** `rawaq-web/sentry.server.config.ts`, `rawaq-web/sentry.edge.config.ts`

**Change:**
- `sendDefaultPii: false`
- `enableLogs: false` (or add `beforeSend` that strips message bodies for chat-route errors).
- Move the hard-coded DSN to `process.env.SENTRY_DSN` (with the existing value as the example in `.env.example`).

**Verify:** Send a test error containing a fake email — confirm Sentry does not retain the email.

**Subagent:** ✅ Can do. **Needs human:** Add `SENTRY_DSN` to Vercel project env.

---

### 1.4 Reorder refund flow

**File:** `rawaq-web/app/api/bookings/[id]/refund/route.ts`

**Change:** Restructure the flow from:

```
cancel booking → call gateway → insert refund row → mark tx refunded
```

to:

```
insert refund row (status: pending, optimistic) →
call gateway →
   on success: mark refund completed, mark tx refunded, then cancel booking →
   on failure: leave refund row at pending (manual queue)
```

Ensures money cannot move without a refund row existing, and rollback never re-confirms a refunded booking.

**Verify:** Manual test with simulated gateway: ① simulated success → row+booking match; ② throw inside gateway call → refund row remains pending, booking remains confirmed.

**Subagent:** ✅ Can do (well-scoped refactor of one file).

---

### 1.5 Fix image-proxy SSRF

**File:** `rawaq-web/app/api/image-proxy/route.ts`

**Change:** Replace `redirect: 'follow'` with `redirect: 'manual'`, walk the redirect chain manually, and re-apply the `BLOCKED_HOSTNAMES` check on each hop. Cap at 3 hops. Also extend the blocklist to cover `169.254.0.0/16` (link-local incl. AWS metadata) and `fd00::/8`, `fe80::/10` (IPv6 private/link-local).

**Verify:** Test against a known-good public image, against a URL that 301s to localhost, and against `http://169.254.169.254/`.

**Subagent:** ✅ Can do.

---

### 1.6 Confirm DB-level guards (manual / out-of-scope for subagent)

**Files (read-only audit):** `rawaq-web/supabase/migrations/*`

**Verify:**
- `bookings` insert has a trigger raising `P0001 / P0002 / P0003` for capacity oversell, sold-out session, and ticket-type sold-out.
- FK from `payment_transactions.user_id`, `bookings.user_id`, `refunds.requested_by`, `wallet_ledger.user_id` to `auth.users.id` is **NOT** `ON DELETE CASCADE` (financial preservation).
- RLS is enabled on `organizer_bank_accounts` and restricts SELECT to `organizer_id = auth.uid()` OR `requireAdmin`.

**Subagent:** ❌ Read-only DB inspection by a human or via a DB-aware agent that has Supabase access. The web-backend subagent should not write migrations without product sign-off.

**Output:** A short note added to the audit document confirming or contradicting each assumption.

---

### 1.7 Add audit-log rows for high-impact admin actions

**Files:**
- `rawaq-web/app/api/admin/users/[id]/route.ts` (DELETE handler)
- `rawaq-web/app/api/admin/organizers/[id]/route.ts` (PATCH approve/reject/suspend)
- `rawaq-web/app/api/admin/refunds/[id]/route.ts` (status → completed)
- `rawaq-web/app/api/admin/payouts/[id]/route.ts` (status → completed)

**Change:**
- Add a helper `lib/audit.ts` that wraps `admin.from('audit_logs').insert(...)` and throws on failure (audit must not silently fail).
- Use the helper in all four routes with appropriate `action` strings: `delete_user`, `approve_organizer` / `reject_organizer` / `suspend_organizer`, `complete_refund`, `complete_payout`.
- Refactor existing `ban_user` / `unban_user` / `warn_user` callsites to use the helper.

**Verify:** Audit-log row exists for each admin action; insert failure surfaces as a 500.

**Subagent:** ✅ Can do.

---

### 1.8 Paymob webhook: race + idempotency hardening

**File:** `rawaq-web/app/api/webhooks/paymob/route.ts`

**Change (lighter version — full event-ID dedup is Phase 2):**
- When `gateway_order_id` lookup fails *and* the webhook is for a payment that should belong to us (heuristic: created in the last 10 minutes — read `obj.created_at`), return **500** so Paymob retries up to its 3-attempt limit. For older orders, keep the 200 ("not ours").
- Add structured `Sentry.captureException` in this branch.

**Verify:** Local replay with a fake order ID — confirm 500 on a recent webhook, 200 on a 1-hour-old one.

**Subagent:** ✅ Can do, but flag with reviewer — heuristic logic deserves a careful read.

---

## Phase 2 — 🟠 Strongly recommended (launch week)

Group these into a single PR after Phase 1 is merged and verified.

### 2.1 Per-user rate limits

**Files (add `checkRateLimit(limiters.X, ctx.userId)`):**

| Route | Limiter to use | New limiter to add? |
|---|---|---|
| `POST /api/bookings/[id]/refund` | `limiters.payments` | reuse |
| `POST /api/tickets/verify` | `limiters.scan` | **add** (60/min/user) |
| `POST /api/bookings/scan` | `limiters.scan` | reuse |
| `POST /api/users/[id]/follow` | `limiters.social` | **add** (30/min/user) |
| `POST /api/users/[id]/block` | `limiters.social` | reuse |
| `GET  /api/promo-codes/validate` | `limiters.promoValidate` | **add** (20/min/IP — endpoint is anonymous) |
| `PATCH /api/profiles/me` | `limiters.profileUpdate` | **add** (10/min/user) |

Add new limiters to `rawaq-web/lib/rate-limit.ts`.

**Subagent:** ✅ Can do.

---

### 2.2 Cap pagination

**Files:** Every route parsing `per_page` / `limit` from `req.nextUrl.searchParams`.

**Change:** Wrap `Number(req.nextUrl.searchParams.get('per_page') ?? N)` with `Math.min(..., 100)`. Centralize via `lib/pagination.ts` if it exposes a parser.

**Search to find all:** `grep -rn "per_page" rawaq-web/app/api/`

**Subagent:** ✅ Can do.

---

### 2.3 Webhook event-ID idempotency table

**Files:**
- New migration: `rawaq-web/supabase/migrations/0XXXX_processed_webhook_events.sql` (DB schema change → needs sign-off)
- `rawaq-web/app/api/webhooks/paymob/route.ts`
- `rawaq-web/app/api/webhooks/stripe/route.ts`

**Change:**
- Create `processed_webhook_events (gateway text, event_id text, processed_at timestamptz default now(), primary key (gateway, event_id))`.
- In each webhook handler, attempt `insert` first; on `23505` (duplicate), return 200 immediately.

**Subagent:** ⚠️ Migration creation needs human approval before applying. Code change is fine.

---

### 2.4 Pick canonical scanner; deprecate the other

**Files:** `rawaq-web/app/api/tickets/verify/route.ts` and `rawaq-web/app/api/bookings/scan/route.ts`

**Decision needed (human):** Which one do the mobile and web clients call? Keep that one; mark the other `@deprecated` and add a runtime `console.warn`.

**Subagent:** ❌ Needs product/client decision first.

---

### 2.5 Centralize env-var validation

**Files:**
- New: `rawaq-web/lib/env.ts` — Zod schema for all required env vars.
- `rawaq-web/instrumentation.ts` — call `validateEnv()` on cold start.
- Refactor `lib/gateways/paymob.ts` `requireEnv` and `lib/gateways/stripe-gw.ts` `requireEnv` to read from the validated object.

**Subagent:** ✅ Can do.

---

### 2.6 Document Redis fail-open in runbook

**Files:** `docs/production/06-runbooks.md` (new)

**Subagent:** ✅ Can do (small doc add).

---

## Phase 3 — 🟡 Desirable (post-launch backlog)

These are *not* part of the launch fix and are listed for the subagent to **skip**:

- File magic-number sniffing in `/api/upload`
- Field-level encryption of IBAN/SWIFT in `organizer_bank_accounts`
- Regenerate Supabase types; eliminate `as never` casts
- Move from `console.log` to structured logger in webhooks
- AI cost-budget tracking per user/day in Redis
- `media_uploads` table cleanup job
- Multi-region Vercel (`bom1` / `cdg1`)
- OpenAPI generation for mobile client type-share

---

## Out of subagent scope (human-only)

| Item | Why |
|---|---|
| Confirm DB triggers/RLS/FK policies (§1.6) | Needs DB inspection + product sign-off |
| Migration for `processed_webhook_events` (§2.3) | DB change — explicit human approval before apply |
| Pick canonical scanner (§2.4) | Product/client decision |
| Mobile payment-redirect end-to-end test | Needs physical iOS + Android devices |
| Set `SENTRY_DSN` in Vercel project env | Dashboard click; humans only |
| Confirm Vercel plan supports sub-hour crons | Account-level info |

---

## Verification & PR strategy

1. **Phase 1 lands as ONE PR** titled "fix: production blockers from audit (phase 1)". Reviewer should be able to walk the 8 commits in order.
2. Each commit message references the audit document section.
3. After merge: 24-hour soak on staging with synthetic traffic before promoting to prod.
4. **Phase 2 lands as a second PR** one week after Phase 1 is live in prod.
5. **Phase 3** stays in the backlog and is tackled in normal feature cadence.

---

## Subagent execution proposal

If you approve this plan, I'll launch a single `general-purpose` subagent with:

- **Scope:** Phase 1 items 1.1, 1.2, 1.3, 1.4, 1.5, 1.7, 1.8 (skipping 1.6 which requires DB access). Plus a small carve-out of Phase 2: items 2.1, 2.2, 2.5, 2.6.
- **Working directory:** `D:\BMC\business-mind\rawaq-web` (no isolation worktree — the changes touch many files and benefit from being in the user's normal working tree where they can review the diff).
- **Deliverable:** A single set of staged changes (not committed) the user can review with `git diff`. The subagent will write a short summary of what was changed and what was skipped (and why) into `docs/production/05a-fix-execution-report.md`.
- **Hard rules for the subagent:**
  - Do NOT commit, push, or merge anything.
  - Do NOT run any migrations or any database write.
  - Do NOT modify `.env.local`, `.env.production`, or any secret file.
  - Do NOT modify Vercel project settings or dashboard.
  - If a fix requires DB inspection (e.g., capacity trigger), STOP that item, log it in the report, and continue with the next.
  - Run `npm run type-check` after each phase batch; if it fails, fix or revert.
  - Run `npm run lint` after each phase batch.
