# Backend Fix Execution Report

**Date:** 2026-05-29
**Plan:** [`05-backend-fix-implementation-plan.md`](./05-backend-fix-implementation-plan.md)
**Audit:** [`04-backend-architecture-and-quality-audit.md`](./04-backend-architecture-and-quality-audit.md)
**Status:** Changes staged in working tree (not committed). `npm run type-check` ✅ and `npm run lint` ✅ pass.

This report documents what was changed, what was skipped, and what still
requires human action. No commits, pushes, migrations, `.env*` edits, or Vercel
dashboard changes were made.

---

## Phase 1 — Blockers

| # | Item | Status | Files |
|---|------|--------|-------|
| 1.1 | Fix Vercel cron schedule (3 crons) | ✅ Done | `vercel.json` |
| 1.2 | Wire `Sentry.captureException` into error handler + critical routes | ✅ Done | `lib/errors.ts`, `webhooks/paymob`, `webhooks/stripe`, `bookings/[id]/refund` |
| 1.3 | Disable Sentry PII; DSN → env var | ✅ Done | `sentry.server.config.ts`, `sentry.edge.config.ts`, `.env.example` |
| 1.4 | Reorder refund flow (row-first) | ✅ Done | `bookings/[id]/refund/route.ts` |
| 1.5 | Fix image-proxy SSRF (manual redirect walk + blocklist) | ✅ Done | `image-proxy/route.ts` |
| 1.6 | Confirm DB triggers/FK/RLS | ⏭️ Skipped (requires DB access) | — |
| 1.7 | Audit-log rows for admin actions + `lib/audit.ts` | ✅ Done | `lib/audit.ts`, `admin/users/[id]`, `admin/users/[id]/warn`, `admin/organizers/[id]`, `admin/refunds/[id]`, `admin/payouts/[id]` |
| 1.8 | Paymob webhook race/idempotency hardening | ✅ Done | `webhooks/paymob/route.ts` |

### Notes on Phase 1

- **1.3** also lowered `tracesSampleRate` from `1` → `0.05` for production quota
  control (sensible extra, not in the original plan text).
- **1.5** extended the blocklist beyond the plan: added CGNAT (`100.64.0.0/10`),
  IPv6 ULA/link-local (`fc`/`fd`/`fe80`), AWS/Azure/GCP metadata
  (`169.254.0.0/16`), plus a 10 MB response-size cap and a `MAX_REDIRECTS=3` walk.
- **1.5** the original `redirect: 'follow'` comment ("Don't follow redirects to
  private IPs") was misleading — `follow` *did* follow them. Now `manual` with
  per-hop re-validation via `isAllowedUrl`.
- **1.8** captures to Sentry on HMAC failure, tx-not-found (with `isRecent`
  heuristic), and every DB-update failure stage. ⚠️ **Reviewer should read the
  10-minute recency heuristic carefully** — it relies on `obj.created_at` being
  present and parseable.

---

## Phase 2 — carve-out (launch week)

| # | Item | Status | Files |
|---|------|--------|-------|
| 2.1 | Per-user rate limits | ✅ Done | `lib/rate-limit.ts` (4 new limiters) + `bookings/[id]/refund`, `tickets/verify`, `bookings/scan`, `users/[id]/follow`, `users/[id]/block`, `promo-codes/validate`, `profiles/me` |
| 2.2 | Cap pagination at 100 | ✅ Done | `lib/pagination.ts` (`parsePerPage`/`parsePage`) + 8 GET routes |
| 2.5 | Centralize env validation | ✅ Done | `lib/env.ts` (new), `instrumentation.ts`, `lib/gateways/paymob.ts`, `lib/gateways/stripe-gw.ts` |
| 2.6 | Document Redis fail-open in runbook | ✅ Done (with correction) | `docs/production/06-runbooks.md` (new) |

### Notes on Phase 2

- **2.1** new limiters: `scan` (60/min), `social` (30/min), `promoValidate`
  (20/min, keyed by IP since the endpoint is anonymous), `profileUpdate`
  (10/min).
- **2.5** `lib/env.ts` hard-requires infra vars (Supabase, app URL, Upstash,
  `CRON_SECRET`, `INTERNAL_TRIGGER_SECRET`) via Zod and throws an aggregated
  error on cold start (wired through `instrumentation.ts`). Feature vars stay
  validated at point of use through a shared `requireEnv()`. Both payment
  gateways now import that shared helper instead of defining their own
  duplicates. Gateway integration IDs were intentionally **left** as optional
  point-of-use lookups (not forced into the cold-start schema) because they are
  conditionally required and forcing them would break partial-gateway configs.
- **2.6** ⚠️ **Correction:** the plan/audit called this "fail-open", but the code
  as written **fails closed** — when Redis is unreachable, `checkRateLimit`
  throws and `handleApiError` returns 500. The runbook documents the *actual*
  behavior plus the emergency fail-open mitigation. Worth a product decision on
  whether closed is the desired posture.

---

## Out of scope — still needs a human

| Item | Why |
|------|-----|
| **1.6** DB triggers/FK/RLS audit | Needs Supabase DB inspection + product sign-off |
| **2.3** `processed_webhook_events` migration | DB schema change — explicit approval before apply |
| **2.4** Pick canonical scanner (`tickets/verify` vs `bookings/scan`) | Product/client decision |
| Set `SENTRY_DSN` in Vercel project env | Dashboard click |
| Confirm Vercel plan supports sub-hour crons | Account-level info; Hobby won't run them |
| Add `SENTRY_DSN` value to deployment env | Secret — not edited by automation |

---

## Verification

- `npm run type-check` → ✅ pass (exit 0)
- `npm run lint` → ✅ pass (exit 0)
- Manual gateway simulation for the refund reorder (1.4) and the SSRF redirect
  cases (1.5) are documented as verification steps in the plan but were **not**
  executed here — recommend running them before merge.

## Suggested next steps

1. Review `git diff` for the staged changes.
2. Run the manual verifications for 1.4, 1.5, 1.8.
3. Set `SENTRY_DSN` in Vercel; confirm Vercel Pro for sub-hour crons.
4. Decide the canonical scanner (2.4) and the Redis failure posture (2.6).
5. Commit Phase 1 as one PR, Phase 2 carve-out as a follow-up, per the plan's PR strategy.
