# Spec: Service Worker + Offline Support for `rawaq-web`

**Date:** 2026-04-24
**Scope:** Phase 2, Task 2.3 from `docs/superpowers/plans/2026-04-23-front-end-gaps.md`
**App:** `rawaq-web` only (mobile offline hardening is a separate, later effort — Expo has no service workers)

---

## Goal

Add a service worker to `rawaq-web` that gives returning users a working shell + cached read-only data while offline or on flaky networks. Writes still error normally if offline. This is the "shell + stale-while-revalidate for read-only GETs" option — not a full offline-queue PWA.

---

## Architecture

- **Library:** `@serwist/next` + `serwist` — the maintained successor to `next-pwa`, with first-class Next.js 15 App Router support.
- **SW entry:** `rawaq-web/app/sw.ts` — written in TypeScript, compiled by Serwist's webpack plugin to `public/sw.js` at build time.
- **Registration:** handled automatically by Serwist's client runtime. Disabled in `next dev` (Serwist default) to avoid dev-cache confusion.
- **Next.js config:** `next.config.ts` wraps export with `withSerwist({ swSrc: 'app/sw.ts', swDest: 'public/sw.js' })`, composed cleanly with the existing `withSentryConfig` wrapper.
- **Scope:** `/` (full site). The SW explicitly passes through Sentry's tunnel route `/monitoring`.

---

## Caching Strategies

| Pattern | Strategy | Cache name | Max age | Max entries |
|---|---|---|---|---|
| Next.js build output (precache manifest) | Precache | `rawaq-precache-v{hash}` | build-tied | — |
| Static assets (`/_next/static/*`, fonts, `.svg`/`.png`/`.webp` under `/_next/`) | `CacheFirst` | `rawaq-static-v1` | 30d | 200 |
| `GET /api/events`, `/api/events/featured`, `/api/communities`, `/api/categories`, `/api/happenings` | `StaleWhileRevalidate` | `rawaq-api-public-v1` | 5min | 100 |
| `GET /api/events/[id]`, `GET /api/communities/[id]` (public detail) | `StaleWhileRevalidate` | `rawaq-api-public-v1` | 5min | 200 |
| Navigations (HTML document requests) | `NetworkFirst`, 3s timeout, fallback to `/offline` | `rawaq-pages-v1` | 1d | 50 |
| Everything else (authed APIs, mutations, webhooks, cron, uploads, payments, `/monitoring`, `/api/auth/*`) | `NetworkOnly` | — | — | — |

### Auth-bypass rule

Before matching any of the public-SWR rules above, the SW fetch handler inspects the request:

1. If the request is not `GET` → `NetworkOnly`.
2. If the request URL path is not in the public-SWR allowlist → `NetworkOnly`.
3. If the request carries a Supabase auth cookie (`sb-*-auth-token`) **and** the path is any of the public-SWR allowlisted endpoints (`/api/events`, `/api/events/featured`, `/api/communities`, `/api/categories`, `/api/happenings`, `/api/events/[id]`, `/api/communities/[id]`) → `NetworkOnly`. This prevents caching any authenticated variant — which may carry per-user `is_saved` / `is_member` annotations — in a cache shared with anonymous users on the same browser profile.
4. Otherwise, apply the route's declared strategy.

Rule 3 is important: authenticated users always hit the origin (where Redis already caches the anonymous variant separately). Anonymous users get SWR in the browser SW. No cross-contamination.

### Routes explicitly `NetworkOnly`

- Any non-GET method
- `/api/auth/*`
- `/api/webhooks/*`
- `/api/cron/*`
- `/api/upload`
- `/api/payments/*`
- `/monitoring` (Sentry tunnel)
- `/api/notifications`, `/api/bookings`, `/api/saved`, `/api/profiles/me`, `/api/organizer/*`, `/api/admin/*`, `/api/owner/*`, `/api/chat/*`, `/api/tickets/*`, `/api/feed`, `/api/comments`, `/api/tips`, `/api/subscriptions`, `/api/plans`, `/api/support`, `/api/referral`, `/api/waitlist`, `/api/promo-codes`, `/api/recommendations`, `/api/users`, `/api/profiles` (non-me), `/api/internal/*`

---

## Lifecycle & Invalidation

### On SW update

- New SW installs in the background.
- `skipWaiting()` + `clients.claim()` so the new SW takes over immediately — no user-facing "reload to update" toast in scope.
- Stale caches from prior versions are deleted in `activate` by name-pattern: any `rawaq-*-v*` not in the current version's allowlist is cleared.

### On logout

- `AuthProvider`'s signOut sends `postMessage({ type: 'CLEAR_CACHES' })` to the active SW.
- The SW handles the message, iterates `caches.keys()`, and deletes everything starting with `rawaq-api-public-` and `rawaq-pages-`. Static + precache are kept (not sensitive, expensive to rebuild).

### Manual version bump

Bumping any `v1` suffix in cache names (e.g., `rawaq-api-public-v1` → `rawaq-api-public-v2`) in `app/sw.ts` forces all clients to rebuild that cache on the next SW activation. Used if we ship a breaking change to response shapes.

---

## Offline UX

### New `/offline` page

- **File:** `rawaq-web/app/offline/page.tsx`
- **Content:** Branded "You're offline" page matching app theme, with a "Retry" button that calls `location.reload()`.
- **Precached** as part of the build manifest so it's always available when the SW can't reach the network.

### Navigation fallback

- When the navigations cache (`rawaq-pages-v1`) fails and no cached copy exists for the requested URL, the SW's fallback handler returns the precached `/offline` HTML.

### Writes while offline

- No special handling in scope. `fetch` rejects, existing error-toast paths fire. The "Option C" offline queue is explicitly out of scope.

### No "showing cached data" toast

- When a SWR response is served from cache while offline, the UX is transparent. An indicator toast is a plausible follow-up but not in scope here.

---

## Testing

### Manual DevTools flow (primary validation)

1. `npm run build && npm start` in `rawaq-web`.
2. DevTools → Application → Service Workers → confirm `sw.js` is "activated and running".
3. DevTools → Application → Cache Storage → confirm `rawaq-precache-*`, `rawaq-static-v1`, and (after some browsing) `rawaq-api-public-v1` exist.
4. Browse `/events` and `/communities` to warm the cache.
5. DevTools → Network → check "Offline".
6. Reload `/events`: shell + list should load from SW cache.
7. Navigate to a never-visited event detail: `/offline` page should render.
8. Attempt an RSVP: error toast fires (expected).
9. Uncheck "Offline", reload: normal operation resumes.
10. Sign out: DevTools → Application → Cache Storage → confirm `rawaq-api-public-*` and `rawaq-pages-*` are emptied.

### Lighthouse PWA audit

- Run Lighthouse on a production build; confirm no SW-related errors. The "installable" score will be low (no manifest by design) but other PWA checks should pass.

### Matcher correctness

- Pure functions in `rawaq-web/lib/sw-matchers.ts` classify a `Request` into a strategy name (`'swr-public'`, `'static'`, `'pages'`, `'network-only'`).
- `rawaq-web` currently has no test runner configured. Rather than introducing Vitest for a single test file, correctness is verified by:
  1. Keeping `sw-matchers.ts` small (single file, under ~80 lines, no dependencies) so it's reviewable by eye.
  2. Exercising every branch through the manual DevTools flow with and without auth cookies (the "sign out and verify cache cleared" step specifically exercises the per-user bypass rule).
- If the matcher grows or a test runner lands in the web app later, add `lib/sw-matchers.test.ts` then.

### No E2E tests

Service workers are notoriously hard to E2E reliably. The DevTools flow is the pragmatic cut.

---

## Files Changed

### New

- `rawaq-web/app/sw.ts` — Serwist SW entry, registers the routing rules and precaches the build manifest + `/offline`.
- `rawaq-web/app/offline/page.tsx` — branded offline fallback page.
- `rawaq-web/lib/sw-matchers.ts` — pure functions: `classifyRequest(req): StrategyName` and `isAuthBypassedPublicRoute(req)`. Imported by `app/sw.ts`.

### Modified

- `rawaq-web/next.config.ts` — compose `withSerwist` with the existing `withSentryConfig` wrapper.
- `rawaq-web/contexts/auth-context.tsx` — on `signOut`, post `{ type: 'CLEAR_CACHES' }` to the active SW registration before actually signing out.
- `rawaq-web/package.json` — add `@serwist/next` and `serwist` dependencies. No test-runner dependency added (see Testing section).
- `rawaq-web/tsconfig.json` — include the `WebWorker` lib so `app/sw.ts` type-checks against SW globals (`self`, `ExtendableEvent`, etc.).

---

## Out of Scope

- PWA manifest + "Add to Home Screen" install prompt — deferred (separate spec, separate feature).
- Offline write queue (Option C) — deferred.
- Mobile (`rawaq-mobile`) offline hardening — separate workstream, different infra (React Native, no service workers).
- "Showing cached data" UI indicator — deferred.
- Push notifications via SW — out of scope.
- Background sync — out of scope.
