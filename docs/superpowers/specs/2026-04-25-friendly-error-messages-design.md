# Friendly Error Messages — Design Spec

**Date:** 2026-04-25
**Status:** Approved (pending implementation plan)
**Scope:** Both clients (`rawaq-web`, `rawaq-mobile`)

---

## Goal

Replace raw HTTP error surfaces (`Request failed (504)`, hung requests, silent fetch failures) with a uniform, bilingual, brand-voiced error UX across web and mobile. Users see human messages routed through a small shared toast/banner, with safe automatic retry on read traffic.

## Non-Goals

- Standardizing inline form-validation errors (stays as-is).
- Wrapping direct Supabase calls (`supabase.from(...).select()`) outside the API helpers.
- A success-toast / generic notification system (this spec governs **error** toasts only; the provider can be reused later but copy + behavior for non-error cases are out of scope).
- Server-side new exception types (e.g., a dedicated `GatewayTimeoutException`). The client classifier handles upstream 5xx uniformly.
- Cross-browser visual-regression testing (no Playwright/Storybook in repo today).

## Error Categories

A pure classifier maps any `Response` or thrown `Error` into a discriminated union:

```ts
export type ClassifiedError =
  | { kind: 'rate_limited'; retryAfterSec: number | null }
  | { kind: 'transient' }   // 500, 502, 503, 504, fetch threw, online
  | { kind: 'offline' }     // navigator.onLine === false (web); NetInfo offline (mobile)
  | { kind: 'timeout' }     // our AbortController fired
  | { kind: 'auth' }        // 401, 403 — labelled but NOT toasted
  | { kind: 'client' }      // other 4xx — server message passes through
  | { kind: 'unknown' }     // safety net
```

**Rules:**
- 429 retains a distinct kind because it carries `retryAfterSec` and gets distinct copy.
- All other transient server failures (500/502/503/504) and bare network throws collapse to `transient`.
- `offline` is detected via `navigator.onLine === false` on web before fetch when possible; otherwise via `TypeError: Failed to fetch` + `!navigator.onLine` post-fetch. Mobile uses `@react-native-community/netinfo` (already a likely dep — verify in implementation; if not present, falls back to thrown-error heuristics).
- `auth` errors are labelled so the fetcher knows to skip the toast and let existing redirect/sign-out flows handle them.
- `client` (4xx with server-supplied message — "Event is fully booked", "Already a member", etc.) passes through unchanged. Server already has Arabic copy in `lib/errors.ts` and route handlers; toasting it generically would regress UX.

## Retry Policy

A small retry helper sits inside the GET path of both fetchers. Mutations never auto-retry.

```
GET request
   ↓
fetchWithTimeout (15s default)
   ↓
classifyResponse(res)
   ↓
if kind === 'transient' AND retry !== false
   ↓
sleep(1500)
   ↓
fetchWithTimeout (15s) — single retry, no more
```

- **GET only.** Mutations (POST/PATCH/DELETE) never retry.
- **One retry, fixed 1.5s delay.** No exponential backoff.
- Retries `transient` only. Not `rate_limited` (would just hit limit again), not `offline`, not `timeout` (already burned the budget), not `auth`/`client`.
- **Client-side timeout via `AbortController` is new code.** Default 15s for both clients. Mobile especially needs this — today it has no timeout at all and a hung request waits forever.
- Retry is invisible when it succeeds. No "retrying…" UI.
- Per-request opt-out: `clientGetJson(path, { retry: false })`.

## Localization & Message Shape

The classifier returns a structured object; UI code translates it via the existing `t(key)` system.

**Eight new keys** added to **both** `rawaq-web/contexts/locale-context.tsx` and `rawaq-mobile/contexts/locale-context.tsx`, in EN and AR, under the `errors.*` namespace:

```ts
// English
'errors.transient.title':              'Something went wrong',
'errors.transient.body':               "We couldn't reach the server. Please try again in a moment.",
'errors.timeout.title':                'Taking longer than usual',
'errors.timeout.body':                 "Your connection seems slow. We'll wait — you can retry when ready.",
'errors.offline.title':                "You're offline",
'errors.offline.body':                 'Check your connection and try again.',
'errors.rate_limited.title':           'Slow down a moment',
'errors.rate_limited.body':            "You've done that a lot in a short time. Try again in {seconds}s.",
'errors.rate_limited.body_no_seconds': "You've done that a lot in a short time. Please wait a moment.",
'errors.action.retry':                 'Try again',
'errors.action.dismiss':               'Dismiss',

// Arabic
'errors.transient.title':              'حدث خطأ ما',
'errors.transient.body':               'تعذّر الوصول إلى الخادم. حاول مرة أخرى بعد لحظات.',
'errors.timeout.title':                'يستغرق وقتًا أطول من المعتاد',
'errors.timeout.body':                 'يبدو اتصالك بطيئًا. خذ وقتك وأعد المحاولة عندما تكون مستعدًا.',
'errors.offline.title':                'أنت غير متصل بالإنترنت',
'errors.offline.body':                 'تحقق من اتصالك ثم حاول مرة أخرى.',
'errors.rate_limited.title':           'تمهّل قليلاً',
'errors.rate_limited.body':            'لقد قمت بهذا كثيرًا خلال وقت قصير. حاول بعد {seconds} ثانية.',
'errors.rate_limited.body_no_seconds': 'لقد قمت بهذا كثيرًا خلال وقت قصير. يُرجى الانتظار لحظة.',
'errors.action.retry':                 'حاول مرة أخرى',
'errors.action.dismiss':               'إخفاء',
```

- The `{seconds}` placeholder uses the project's existing `{var}` interpolation pattern. The toast component performs the substitution; `t()` itself stays a flat lookup, matching current practice.
- Tone follows `.impeccable.md` brand voice: warm, rooted, alive — no "An error occurred" sterility.
- Existing 429 messages in `client-fetch.ts` and `api.ts` are deleted; they're superseded by these locale-driven messages routed through the toast.

## Toast / Banner UX

### Web

**New files:**
- `rawaq-web/components/feedback/ErrorToast.tsx` — visual component + `<ErrorToastProvider>` context, mounted once at the root layout.
- `rawaq-web/lib/error-emitter.ts` — tiny event emitter (`emit(payload)`, `subscribe(listener)`) with no React dependency, importable by the fetcher.

**Behavior:**
- Bottom-center on mobile viewports, bottom-right on desktop.
- Stacks if multiple fire (max 3 visible, FIFO; new arrivals beyond 3 replace the oldest).
- Auto-dismiss: 6s for `transient`/`timeout`/`offline`. For `rate_limited`, dismiss after `clamp(retryAfterSec ?? 6, 6, 10)` seconds — never shorter than 6s (so the user can read it) and never longer than 10s.
- Manual dismiss button (`×`) always present.
- "Try again" button on toasts originating from a GET, wired by passing a retry callback through the emitter payload. Mutations show no retry button — the user retries the original action.
- RTL-aware via `dir` from `useLocale()`.
- Uses existing color tokens (`--c-ink`, `--c-paper`, `--c-gold`); no new styling system.
- Respects `prefers-reduced-motion`; otherwise 200ms slide-in.

### Mobile (React Native)

**New files:**
- `rawaq-mobile/components/feedback/ErrorToast.tsx` — animated `View` with absolute positioning, mounted once at the root layout.
- `rawaq-mobile/lib/error-emitter.ts` — same emitter pattern.

**Behavior:**
- Anchored above the bottom tab bar; uses `Animated` for slide-in/out (300ms).
- Same auto-dismiss timing as web.
- Tap-to-dismiss + explicit `×`.
- Same retry-button rule.
- `Alert.alert` is **not** used — modal/blocking is wrong for transient errors.

### What's *not* a toast

- `auth` errors → emitter receives nothing; existing redirect/sign-out flow runs.
- `client` errors → emitter receives nothing; caller surfaces server message inline as today.
- Background/silent calls (cache prefetch, telemetry) → fetcher accepts `silent: true`, emitter call skipped.

## Fetcher Integration

### Web — `rawaq-web/lib/client-fetch.ts`

Extend `ClientGetOptions`:

```ts
type ClientGetOptions = {
  ttlMs?: number
  force?: boolean
  skipCache?: boolean
  scopeKey?: string | null
  signal?: AbortSignal
  retry?: boolean      // default true for GET
  silent?: boolean     // default false; true skips toast emission
  timeoutMs?: number   // default 15_000
}
```

The inner `request` IIFE is restructured to:
1. Wrap `fetch` with an internal `AbortController` tied to `timeoutMs`. If the user passed `signal`, link them — caller-aborts beat timeout-aborts.
2. After `fetch`, call `classifyResponse(res)`.
3. If `transient` and `retry !== false` and method is GET → `sleep(1500)`, fetch again, re-classify.
4. If terminal classification ∈ `{transient, timeout, offline, rate_limited}` and not `silent` → `errorEmitter.emit({ classified, retry: () => clientGetJson(path, options) })`.
5. If `auth` or `client` → emit nothing; throw the existing-style error so existing flows continue.
6. **Add new mutation helpers** `clientPostJson`, `clientPatchJson`, `clientDeleteJson`. The web codebase currently has only `clientGetJson`; mutations are scattered raw `fetch` calls. The new helpers get classification + emitter treatment but no retry, and a toast with no retry button.

Existing `clientGetJson` callers don't change. Mutation call-sites migrate to the new helpers as part of this work, **prioritized by user-facing risk**: bookings → payments → auth → refunds → support → comments → reactions → everything else.

### Mobile — `rawaq-mobile/lib/api.ts`

Extend `ApiGetOptions` and add the same fields to `apiPost / apiPatch / apiDelete` (via an options object parameter):

```ts
{ retry?: boolean, silent?: boolean, timeoutMs?: number }
```

Same flow as web:
1. `AbortController` wraps every fetch with default 15s deadline.
2. After `fetch` → `classifyResponse(res)`.
3. GET-only single retry on `transient`.
4. On terminal transient/timeout/offline/rate_limited → emit toast (unless `silent`).
5. The `{ data, error }` return shape is **kept**, but `error` is now sourced from server-supplied `client` errors only. Transient/network errors show a toast and return `{ data: null, error: null }`.

**Behavior change:** call sites that currently render `result.error` inline for network failures will stop showing inline copy and rely on the toast instead. Acceptable — the toast is more visible and that's the point of this work. Audit and adjust any UIs that currently depend on inline-only display before merging.

### Untouched

- `rawaq-web/lib/errors.ts` (server-side). The server keeps emitting the same status codes.
- Direct Supabase calls outside the API helpers.
- All inline form validation, all server-supplied 4xx "client" errors.

## Architecture Diagram

```
                 ┌───────────────────────────────────────────┐
                 │  classifyResponse(res) / classifyThrown   │
                 │  pure, no React, no i18n                  │
                 └───────────────────────────────────────────┘
                                    │
       ┌────────────────────────────┼────────────────────────────┐
       ▼                            ▼                            ▼
┌─────────────┐           ┌──────────────────┐         ┌───────────────────┐
│ retry       │           │ errorEmitter     │         │ ErrorToastProvider│
│ helper      │           │ (no React)       │ ──────▶ │ subscribe()       │
│ (GET only,  │           │ emit(payload)    │         │ renders toast UI  │
│  1× @1.5s)  │           │ subscribe(fn)    │         │ via t(key)        │
└─────────────┘           └──────────────────┘         └───────────────────┘
       ▲                            ▲                            ▲
       │                            │                            │
       └─── inside client-fetch.ts (web) and lib/api.ts (mobile) ┘
```

## Testing & Verification

The codebase has no Jest/Vitest config wired up. Testing scope:

### Unit tests (the one place automation pays off)

`rawaq-web/lib/error-classifier.test.ts` (and mirrored mobile copy). Use Node's built-in `node:test` runner — no new test framework introduced.

Cases:
- `Response` 429 with `Retry-After: 12` → `{ kind: 'rate_limited', retryAfterSec: 12 }`
- `Response` 429 without header → `{ kind: 'rate_limited', retryAfterSec: null }`
- `Response` 500 / 502 / 503 / 504 → `{ kind: 'transient' }`
- `Response` 401 / 403 → `{ kind: 'auth' }`
- `Response` 404 / 409 / 422 → `{ kind: 'client' }`
- `Response` 200 → `null`
- Thrown `TypeError('Failed to fetch')` with `navigator.onLine === false` → `{ kind: 'offline' }`
- Thrown `DOMException('AbortError')` from our timeout controller → `{ kind: 'timeout' }`
- Thrown anything else → `{ kind: 'unknown' }`

### Manual smoke tests (per-task in implementation plan)

1. **Rate limit (429):** Logged-in browser, fire 12 chat POSTs in a loop. After 10, expect "Slow down a moment" toast with `retryAfterSec` visible. Repeat in mobile.
2. **Transient 5xx:** Stop dev server mid-action, trigger a button. Expect 1.5s pause (silent retry), then "Something went wrong" with Try-again button if GET, no retry button if mutation.
3. **Timeout:** Throttle network or hit a delay shim. Expect "Taking longer than usual" after 15s.
4. **Offline:** DevTools → Network → Offline; click any action button. Expect "You're offline" toast immediately, no fetch attempted on web. Mobile: airplane-mode.
5. **Auth (401):** Expire token, hit protected endpoint. Expect existing redirect/sign-out — **no toast.**
6. **Client (4xx):** Trigger "Event is fully booked." Expect inline server message — **no toast.**
7. **RTL:** Toggle Arabic, repeat 1–4. Toast slides from correct side; body text matches AR keys; `{seconds}` interpolates.
8. **Silent:** Background prefetch (`silent: true`) hitting a 5xx → no toast, console-only log.

## File Map (rough — final list lives in implementation plan)

| Action | File | Purpose |
|---|---|---|
| Create | `rawaq-web/lib/error-classifier.ts` | Pure classifier |
| Create | `rawaq-web/lib/error-classifier.test.ts` | `node:test` unit tests |
| Create | `rawaq-web/lib/error-emitter.ts` | Toast event emitter |
| Create | `rawaq-web/components/feedback/ErrorToast.tsx` | Toast component + provider |
| Modify | `rawaq-web/app/layout.tsx` | Mount `<ErrorToastProvider>` |
| Modify | `rawaq-web/lib/client-fetch.ts` | Integrate classifier, retry, timeout, emitter; add mutation helpers |
| Modify | `rawaq-web/contexts/locale-context.tsx` | Add 11 EN + 11 AR keys |
| Modify (~10–20 files) | mutation call-sites | Migrate raw `fetch` mutations to new helpers, prioritized by risk |
| Create | `rawaq-mobile/lib/error-classifier.ts` | Mirror of web |
| Create | `rawaq-mobile/lib/error-classifier.test.ts` | Mirror unit tests |
| Create | `rawaq-mobile/lib/error-emitter.ts` | Mirror emitter |
| Create | `rawaq-mobile/components/feedback/ErrorToast.tsx` | RN toast |
| Modify | `rawaq-mobile/app/_layout.tsx` (or root) | Mount toast provider |
| Modify | `rawaq-mobile/lib/api.ts` | Integrate classifier, retry, timeout, emitter on all helpers |
| Modify | `rawaq-mobile/contexts/locale-context.tsx` | Add 11 EN + 11 AR keys |

## Open Questions / Risks

- **Mutation migration scope.** The "migrate raw `fetch` mutations" pass touches many files. Implementation plan must order them by user-facing risk and ship in stages, not as one giant PR.
- **Inline-error fallout (mobile).** Mobile call-sites that render `result.error` inline for network failures will go quiet (toast handles it). Implementation plan must include a manual audit pass.
- **NetInfo dependency (mobile).** If `@react-native-community/netinfo` isn't already installed, classifier falls back to thrown-error heuristics. Implementation plan should verify and add the dep if needed.
- **Toast styling primitives.** The web codebase has no design-tokenized component library beyond color CSS vars. Toast styles are hand-rolled in `ErrorToast.tsx` using existing tokens — accept this as the cost of introducing the first toast component.
