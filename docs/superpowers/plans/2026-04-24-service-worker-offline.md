# Service Worker + Offline Support — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a service worker to `rawaq-web` that gives returning users a working shell + cached read-only data when offline. Writes still error normally. Authenticated users bypass the SW cache entirely for allowlisted public endpoints to avoid leaking per-user annotations.

**Architecture:** `@serwist/next` compiles `app/sw.ts` into `public/sw.js` at build time. The SW precaches the Next.js build manifest and the `/offline` page, applies `StaleWhileRevalidate` to a narrow public-API allowlist, `CacheFirst` to static assets, and `NetworkFirst`-with-offline-fallback to navigations. A small client component registers the SW; the auth context posts a `CLEAR_CACHES` message whenever the signed-in user changes (covers both sign-out and user-switch on shared devices).

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, `@serwist/next`, `serwist` runtime.

---

## File Map

| File | Change |
|------|--------|
| `rawaq-web/package.json` | Add `@serwist/next` + `serwist` deps |
| `rawaq-web/next.config.ts` | Compose `withSerwist` with existing `withSentryConfig` |
| `rawaq-web/lib/sw-matchers.ts` | **New.** Pure `classifyRequest` + allowlist helpers |
| `rawaq-web/app/sw.ts` | **New.** Serwist SW entry — imports matchers, wires runtime caching, lifecycle, postMessage handler |
| `rawaq-web/app/offline/page.tsx` | **New.** Branded "you're offline" fallback page |
| `rawaq-web/components/ServiceWorkerRegister.tsx` | **New.** Client-only `useEffect` that registers `/sw.js` in prod |
| `rawaq-web/app/layout.tsx` | Mount `<ServiceWorkerRegister />` in body |
| `rawaq-web/contexts/auth-context.tsx` | On user-id change in `onAuthStateChange`, send `CLEAR_CACHES` postMessage to active SW |

---

## Task 1: Install Serwist and wire `next.config.ts`

**Files:**
- Modify: `rawaq-web/package.json`
- Modify: `rawaq-web/next.config.ts`

- [ ] **Step 1: Install dependencies**

Run from repo root:

```bash
cd rawaq-web && npm install @serwist/next@^9 serwist@^9
```

Expected: no peer-dependency errors. `package.json` gets both entries under `dependencies`.

- [ ] **Step 2: Compose Serwist with Sentry in `next.config.ts`**

Open `rawaq-web/next.config.ts`. Replace the current content with:

```ts
import { withSentryConfig } from '@sentry/nextjs';
import withSerwistInit from '@serwist/next'
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '*.supabase.co' },
      { protocol: 'https', hostname: '*.supabase.in' },
    ],
  },
  experimental: {
    serverActions: { bodySizeLimit: '2mb' },
  },
}

const withSerwist = withSerwistInit({
  swSrc: 'app/sw.ts',
  swDest: 'public/sw.js',
  disable: process.env.NODE_ENV === 'development',
  cacheOnNavigation: true,
})

export default withSentryConfig(withSerwist(nextConfig), {
  org: "rawaq-cs",
  project: "javascript-nextjs",
  silent: !process.env.CI,
  widenClientFileUpload: true,
  tunnelRoute: "/monitoring",
  webpack: {
    automaticVercelMonitors: true,
    treeshake: { removeDebugLogging: true },
  },
});
```

Key changes: new import at line 2, new `withSerwist` initializer block, `withSerwist(nextConfig)` wrapping the config before Sentry takes it.

- [ ] **Step 3: Add `.gitignore` entries for generated SW files**

Open `rawaq-web/.gitignore`. If it doesn't already cover these, append:

```
# Serwist-generated service worker
public/sw.js
public/sw.js.map
public/swe-worker-*.js
```

(Check first — if the entries already exist, skip.)

- [ ] **Step 4: Build smoke test**

```bash
cd rawaq-web && npm run build
```

Expected: build fails with a message like `Cannot find module './app/sw.ts'` or similar — this is correct at this stage. The SW entry hasn't been written yet. Proceed to Task 2.

- [ ] **Step 5: Commit**

```bash
git add rawaq-web/package.json rawaq-web/package-lock.json rawaq-web/next.config.ts rawaq-web/.gitignore
git commit -m "chore(web): install @serwist/next and wire next.config for SW build"
```

---

## Task 2: Implement the pure SW request matcher

**Files:**
- Create: `rawaq-web/lib/sw-matchers.ts`

- [ ] **Step 1: Create `lib/sw-matchers.ts`**

Create the file with exactly this content:

```ts
// Pure classification helpers for the service worker's fetch handler.
// Must have zero side-effects and zero imports beyond standard URL types,
// so it can be bundled into a web-worker context without pulling in the
// Node or DOM-only halves of Next.

export type StrategyName =
  | 'swr-public'
  | 'static'
  | 'pages'
  | 'network-only'

const PUBLIC_SWR_PATHS: ReadonlyArray<RegExp> = [
  /^\/api\/events\/featured\/?$/,
  /^\/api\/events\/?$/,
  /^\/api\/events\/[^/]+\/?$/,
  /^\/api\/communities\/?$/,
  /^\/api\/communities\/[^/]+\/?$/,
  /^\/api\/categories\/?$/,
  /^\/api\/happenings\/?$/,
]

const STATIC_PATH_RE = /^\/_next\/static\//

export function isPublicSwrPath(pathname: string): boolean {
  return PUBLIC_SWR_PATHS.some((re) => re.test(pathname))
}

export function hasSupabaseAuthCookie(cookieHeader: string | null): boolean {
  if (!cookieHeader) return false
  // Supabase SSR sets cookies like `sb-<projectref>-auth-token` and
  // sometimes `sb-<projectref>-auth-token.0`, `.1`, etc. for chunked tokens.
  return /(^|;\s*)sb-[^=]*-auth-token(?:\.\d+)?=/.test(cookieHeader)
}

export function classifyRequest(req: Request): StrategyName {
  if (req.method !== 'GET') return 'network-only'

  const url = new URL(req.url)

  // Never cache cross-origin requests through our SW.
  if (url.origin !== self.location.origin) return 'network-only'

  // Sentry tunnel: always pass through.
  if (url.pathname === '/monitoring' || url.pathname.startsWith('/monitoring/')) {
    return 'network-only'
  }

  // Static build output.
  if (STATIC_PATH_RE.test(url.pathname)) return 'static'

  // API allowlist — but force network-only when the request carries an auth
  // cookie, so authenticated variants with per-user annotations never enter
  // the shared SW cache.
  if (isPublicSwrPath(url.pathname)) {
    if (hasSupabaseAuthCookie(req.headers.get('cookie'))) return 'network-only'
    return 'swr-public'
  }

  // Everything else under /api is network-only (authed APIs, mutations,
  // webhooks, cron, uploads, payments, auth).
  if (url.pathname.startsWith('/api/')) return 'network-only'

  // Non-API GETs with an HTML accept header are treated as page navigations.
  const accept = req.headers.get('accept') ?? ''
  if (req.mode === 'navigate' || accept.includes('text/html')) return 'pages'

  // Other same-origin assets (favicon, og-images, etc.) — treat as static.
  return 'static'
}

// Exposed for the cache-clear message handler in app/sw.ts.
export const USER_CACHES_PREFIX = ['rawaq-api-public-', 'rawaq-pages-'] as const
```

- [ ] **Step 2: Type-check**

```bash
cd rawaq-web && npx tsc --noEmit
```

Expected: tsc complains about `self.location.origin` (the project's lib currently only includes `dom`, not `webworker`, so `self` may resolve to `Window`). If tsc passes, continue. If it errors on `self`, proceed to Step 3.

- [ ] **Step 3: Annotate `self` for matcher file only (if needed)**

If Step 2 errored, add this as the very first line of `lib/sw-matchers.ts`:

```ts
/// <reference lib="webworker" />
```

Then re-run `npx tsc --noEmit`. Expected: passes.

- [ ] **Step 4: Commit**

```bash
git add rawaq-web/lib/sw-matchers.ts
git commit -m "feat(web): add pure SW request matcher with auth-cookie bypass rule"
```

---

## Task 3: Implement the SW entry `app/sw.ts`

**Files:**
- Create: `rawaq-web/app/sw.ts`

- [ ] **Step 1: Create `app/sw.ts`**

Create the file with exactly this content:

```ts
/// <reference lib="webworker" />

import { defaultCache } from '@serwist/next/worker'
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist'
import { Serwist } from 'serwist'
import { ExpirationPlugin } from 'serwist'
import {
  CacheFirst,
  NetworkFirst,
  NetworkOnly,
  StaleWhileRevalidate,
} from 'serwist'

import { classifyRequest, USER_CACHES_PREFIX } from '@/lib/sw-matchers'

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined
  }
}

declare const self: ServiceWorkerGlobalScope

const CACHE_VERSION = 'v1'
const CACHE_NAMES = {
  static:     `rawaq-static-${CACHE_VERSION}`,
  apiPublic:  `rawaq-api-public-${CACHE_VERSION}`,
  pages:      `rawaq-pages-${CACHE_VERSION}`,
} as const

const serwist = new Serwist({
  precacheEntries: [
    ...(self.__SW_MANIFEST ?? []),
    // Ensure the offline fallback is always precached.
    { url: '/offline', revision: CACHE_VERSION },
  ],
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  disableDevLogs: true,
  fallbacks: {
    entries: [
      { url: '/offline', matcher: ({ request }) => request.destination === 'document' },
    ],
  },
  runtimeCaching: [
    {
      matcher: ({ request }) => classifyRequest(request) === 'static',
      handler: new CacheFirst({
        cacheName: CACHE_NAMES.static,
        plugins: [
          new ExpirationPlugin({
            maxEntries: 200,
            maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
          }),
        ],
      }),
    },
    {
      matcher: ({ request }) => classifyRequest(request) === 'swr-public',
      handler: new StaleWhileRevalidate({
        cacheName: CACHE_NAMES.apiPublic,
        plugins: [
          new ExpirationPlugin({
            maxEntries: 200,
            maxAgeSeconds: 60 * 5, // 5 minutes
          }),
        ],
      }),
    },
    {
      matcher: ({ request }) => classifyRequest(request) === 'pages',
      handler: new NetworkFirst({
        cacheName: CACHE_NAMES.pages,
        networkTimeoutSeconds: 3,
        plugins: [
          new ExpirationPlugin({
            maxEntries: 50,
            maxAgeSeconds: 60 * 60 * 24, // 1 day
          }),
        ],
      }),
    },
    {
      matcher: () => true, // catch-all: network-only
      handler: new NetworkOnly(),
    },
  ],
})

// Clean up caches that don't belong to the current version on activate.
self.addEventListener('activate', (event: ExtendableEvent) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      const current = new Set(Object.values(CACHE_NAMES))
      await Promise.all(
        keys
          .filter((k) => k.startsWith('rawaq-') && !current.has(k))
          .filter((k) => !k.startsWith('rawaq-precache-'))
          .map((k) => caches.delete(k)),
      )
    })(),
  )
})

// CLEAR_CACHES: called by AuthProvider on user-id change (sign-out or user switch).
self.addEventListener('message', (event: ExtendableMessageEvent) => {
  const data = event.data as { type?: string } | undefined
  if (data?.type !== 'CLEAR_CACHES') return
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(
        keys
          .filter((name) => USER_CACHES_PREFIX.some((p) => name.startsWith(p)))
          .map((name) => caches.delete(name)),
      )
    })(),
  )
})

// Silence unused-import lint if defaultCache is ever removed from the import.
void defaultCache

serwist.addEventListeners()
```

- [ ] **Step 2: Type-check**

```bash
cd rawaq-web && npx tsc --noEmit
```

Expected: passes. If it errors on `Serwist`, `ExpirationPlugin`, or strategy classes, verify the import paths match your installed serwist version (`npm ls serwist` — should be `^9.x`).

- [ ] **Step 3: Build smoke test**

```bash
cd rawaq-web && npm run build
```

Expected: build succeeds. `public/sw.js` is created. Output log shows something like `[@serwist/next] Compiled service worker...`.

- [ ] **Step 4: Commit**

```bash
git add rawaq-web/app/sw.ts
git commit -m "feat(web): add Serwist SW entry with public-SWR + offline fallback"
```

---

## Task 4: Create the `/offline` page

**Files:**
- Create: `rawaq-web/app/offline/page.tsx`

The page itself is a server component (so `export const metadata` works), and the Retry button lives in a separate `'use client'` file because it needs an `onClick` handler.

- [ ] **Step 1: Create the client-side retry button**

Create `rawaq-web/app/offline/RetryButton.tsx` with exactly this content:

```tsx
'use client'

export function OfflineRetryButton() {
  return (
    <button
      type="button"
      onClick={() => window.location.reload()}
      style={{
        padding: '12px 28px',
        borderRadius: 999,
        border: 'none',
        background: '#D4A574',
        color: '#1a0d04',
        fontWeight: 700,
        fontSize: 16,
        cursor: 'pointer',
      }}
    >
      Retry
    </button>
  )
}
```

- [ ] **Step 2: Create the server-rendered offline page**

Create `rawaq-web/app/offline/page.tsx` with exactly this content:

```tsx
import type { Metadata } from 'next'
import { OfflineRetryButton } from './RetryButton'

export const metadata: Metadata = {
  title: 'Offline',
  description: 'You are currently offline.',
}

export default function OfflinePage() {
  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        background: '#1a0d04',
        color: '#fff',
        fontFamily:
          "system-ui, -apple-system, 'Mulish', 'Noto Sans Arabic', sans-serif",
      }}
    >
      <div style={{ maxWidth: 420, textAlign: 'center' }}>
        <div
          style={{ fontSize: 64, lineHeight: 1, marginBottom: 16 }}
          aria-hidden
        >
          ✱
        </div>
        <h1 style={{ fontSize: 28, fontWeight: 800, margin: '0 0 12px' }}>
          You&rsquo;re offline
        </h1>
        <p style={{ opacity: 0.75, margin: '0 0 24px', lineHeight: 1.5 }}>
          We couldn&rsquo;t reach the network. Some pages you&rsquo;ve already
          visited may still work from cache.
        </p>
        <OfflineRetryButton />
      </div>
    </main>
  )
}
```

- [ ] **Step 3: Type-check**

```bash
cd rawaq-web && npx tsc --noEmit
```

Expected: passes.

- [ ] **Step 4: Build**

```bash
cd rawaq-web && npm run build
```

Expected: build succeeds; `/offline` appears in the Next build output.

- [ ] **Step 5: Commit**

```bash
git add rawaq-web/app/offline/page.tsx rawaq-web/app/offline/RetryButton.tsx
git commit -m "feat(web): add /offline fallback page for SW navigation failures"
```

---

## Task 5: Register the SW from a client component

**Files:**
- Create: `rawaq-web/components/ServiceWorkerRegister.tsx`
- Modify: `rawaq-web/app/layout.tsx`

- [ ] **Step 1: Create the registration component**

Create `rawaq-web/components/ServiceWorkerRegister.tsx` with exactly this content:

```tsx
'use client'

import { useEffect } from 'react'

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!('serviceWorker' in navigator)) return
    if (process.env.NODE_ENV !== 'production') return

    const register = async () => {
      try {
        await navigator.serviceWorker.register('/sw.js', { scope: '/' })
      } catch (err) {
        // SW registration failing should never break the app.
        console.warn('[sw] registration failed:', err)
      }
    }
    register()
  }, [])

  return null
}
```

- [ ] **Step 2: Mount the component in the root layout**

Open `rawaq-web/app/layout.tsx`. Find the existing import block near the top:

```tsx
import { AuthProvider } from '@/contexts/auth-context'
import { LocaleProvider } from '@/contexts/locale-context'
import { CustomCursor } from '@/components/ui/CustomCursor'
import { Analytics } from "@vercel/analytics/next"
import { SpeedInsights } from "@vercel/speed-insights/next"
```

Add the new import below them:

```tsx
import { ServiceWorkerRegister } from '@/components/ServiceWorkerRegister'
```

Then find the `<body>` block and add `<ServiceWorkerRegister />` as the very first child inside `<body>`:

```tsx
      <body>
        <ServiceWorkerRegister />
        <CustomCursor />
        <LocaleProvider>
          <AuthProvider>
            {children}
          </AuthProvider>
        </LocaleProvider>
        <Analytics />
        <SpeedInsights />
      </body>
```

- [ ] **Step 3: Type-check**

```bash
cd rawaq-web && npx tsc --noEmit
```

Expected: passes.

- [ ] **Step 4: Commit**

```bash
git add rawaq-web/components/ServiceWorkerRegister.tsx rawaq-web/app/layout.tsx
git commit -m "feat(web): register service worker from root layout in production"
```

---

## Task 6: Clear SW caches on user-id change

**Files:**
- Modify: `rawaq-web/contexts/auth-context.tsx`

- [ ] **Step 1: Add the SW cache-clear helper**

Open `rawaq-web/contexts/auth-context.tsx`. Add this helper function just below the existing imports (after line 7 `import type { Profile } from '@/types/database'`):

```tsx
function clearServiceWorkerCaches() {
  if (typeof window === 'undefined') return
  if (!('serviceWorker' in navigator)) return
  navigator.serviceWorker.getRegistration().then((reg) => {
    reg?.active?.postMessage({ type: 'CLEAR_CACHES' })
  }).catch(() => {
    // SW unavailable or not yet activated — safe to ignore.
  })
}
```

- [ ] **Step 2: Call it on user-id change**

Still in `rawaq-web/contexts/auth-context.tsx`, find the `onAuthStateChange` block (around line 51-56):

```tsx
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextUserId = session?.user?.id ?? null
      if (lastUserIdRef.current !== nextUserId) {
        clientFetchInvalidateAll()
        lastUserIdRef.current = nextUserId
      }
```

Replace it with:

```tsx
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextUserId = session?.user?.id ?? null
      if (lastUserIdRef.current !== nextUserId) {
        clientFetchInvalidateAll()
        clearServiceWorkerCaches()
        lastUserIdRef.current = nextUserId
      }
```

Rationale: this fires on sign-out (`prev → null`), sign-in (`null → new`), and user-switch (`A → B`) — every case where SW caches could leak per-user data across sessions on a shared browser profile.

- [ ] **Step 3: Type-check**

```bash
cd rawaq-web && npx tsc --noEmit
```

Expected: passes.

- [ ] **Step 4: Commit**

```bash
git add rawaq-web/contexts/auth-context.tsx
git commit -m "feat(web): clear SW caches on user-id change (sign-out / switch)"
```

---

## Task 7: Production-build verification

**Files:**
- None modified. This is a verification-only task.

- [ ] **Step 1: Full type-check**

```bash
cd rawaq-web && npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 2: Full production build**

```bash
cd rawaq-web && npm run build
```

Expected:
- Build completes.
- Output contains a Serwist line (`[@serwist/next] Compiled service worker...` or similar).
- `public/sw.js` exists after build: `ls rawaq-web/public/sw.js` should find it.
- `/offline` appears in the route summary printed at end of build.

- [ ] **Step 3: If build fails on an import from `serwist`**

`serwist@9` re-exports some classes from `serwist/strategies` or `serwist/plugins` depending on minor version. If the build errors on `ExpirationPlugin`, `CacheFirst`, etc., fix the imports in `rawaq-web/app/sw.ts`:

```ts
import { ExpirationPlugin } from 'serwist'
```

becomes

```ts
import { ExpirationPlugin } from 'serwist/plugins'
```

and

```ts
import { CacheFirst, NetworkFirst, NetworkOnly, StaleWhileRevalidate } from 'serwist'
```

becomes

```ts
import { CacheFirst, NetworkFirst, NetworkOnly, StaleWhileRevalidate } from 'serwist/strategies'
```

Re-run `npm run build`. Commit any import fix as a separate commit:

```bash
git add rawaq-web/app/sw.ts
git commit -m "fix(web): use sub-path imports for serwist strategies/plugins"
```

---

## Task 8: Manual DevTools validation

**Files:**
- None modified. Execute the flow below against the production build.

- [ ] **Step 1: Start the production server**

```bash
cd rawaq-web && npm start
```

Leave it running. Open `http://localhost:3000` in Chrome (fresh incognito window recommended).

- [ ] **Step 2: Confirm SW registration**

DevTools → Application → Service Workers. Expected:
- `sw.js` listed with status `activated and is running`.
- Scope: `http://localhost:3000/`.

- [ ] **Step 3: Confirm precaches**

DevTools → Application → Cache Storage. Expected to see at minimum:
- `rawaq-precache-v{hash}` (populated with build output + `/offline`).

- [ ] **Step 4: Warm public SWR cache**

Browse `/events` and `/communities` in the normal browser window (NOT incognito, so fetches happen in the SW-controlled page). Reload each.

Expected:
- DevTools → Application → Cache Storage now shows `rawaq-api-public-v1` with entries for `/api/events`, `/api/communities`, possibly `/api/events/featured` and category endpoints.

- [ ] **Step 5: Confirm pages cache**

DevTools → Application → Cache Storage → `rawaq-pages-v1`. Expected:
- Contains HTML entries for `/events`, `/communities` (the pages you've browsed).

- [ ] **Step 6: Offline — cached route should load**

DevTools → Network tab → check "Offline". Reload `/events`.

Expected: page loads from SW cache (shell + event list rendered from SWR cache). No network error.

- [ ] **Step 7: Offline — never-visited deep link shows `/offline`**

Still offline in DevTools. Navigate to `/events/some-random-slug-you-never-visited`.

Expected: the branded `/offline` page renders.

- [ ] **Step 8: Offline — writes error normally**

Still offline. Click any button that triggers a POST (e.g., save an event, RSVP). Expected: the existing error toast appears. No SW interference.

- [ ] **Step 9: Back online, normal operation resumes**

Uncheck "Offline". Reload `/events`. Expected: fresh data loads normally. SW serves stale cached data first (SWR), revalidates in the background.

- [ ] **Step 10: Auth-bypass verification**

Sign in. DevTools → Network. Reload `/events`. Expected:
- Request to `/api/events` goes to the network (no "(ServiceWorker)" in the Size column, or "Size" shows actual bytes).
- `rawaq-api-public-v1` cache does **not** grow with authenticated responses — check Cache Storage contents haven't changed unexpectedly.

- [ ] **Step 11: Logout cache-clear verification**

Still signed in. Note the current contents of `rawaq-api-public-v1` and `rawaq-pages-v1` in Cache Storage. Sign out via the app.

Expected (within a second): both `rawaq-api-public-v1` and `rawaq-pages-v1` are empty. `rawaq-precache-*` and `rawaq-static-v1` are untouched.

- [ ] **Step 12: Lighthouse spot check**

DevTools → Lighthouse → run a "PWA" + "Performance" audit on `/events`.

Expected:
- No red errors under PWA referencing the SW.
- "Current page does not respond with a 200 when offline" is EXPECTED to pass (thanks to `/offline` fallback) — if it fails, the navigation route is not being matched correctly; check Task 3 routing.
- "Web app manifest" check will fail with "no manifest". Ignore — out of scope.

- [ ] **Step 13: If any of Steps 2–12 fail**

Stop. Do not proceed to Step 14. Report the specific failure (step number + DevTools evidence) so the issue can be diagnosed. Common root causes:

- `sw.js` not emitted → build-config issue, re-run Task 1 Step 2.
- SW registers but does not activate → route classifier throws inside the SW; check DevTools → Console in the ServiceWorker context (gear icon next to the SW entry).
- SWR cache not filling → the request's path didn't match `isPublicSwrPath` in the matcher; print the path from the matcher temporarily.
- Logout doesn't clear caches → the message handler is not wired; check the SW Console for the incoming message.

- [ ] **Step 14: Final commit (if any cleanup needed)**

If Steps 2–12 all pass without further code changes, no commit is needed — the feature is complete. If minor fixes were made during validation, commit them now:

```bash
git add -u
git commit -m "fix(web): SW validation cleanups from DevTools flow"
```

---

## Self-Review Notes

- **Spec coverage:**
  - Architecture (Serwist, app/sw.ts, next.config) → Tasks 1, 3
  - Caching strategies table → Task 2 (matcher) + Task 3 (runtime caching)
  - Auth-bypass rule → Task 2 (matcher)
  - SW update lifecycle (`skipWaiting`, `clientsClaim`, activate cleanup) → Task 3
  - Logout cache clear → Task 3 (SW handler) + Task 6 (auth postMessage)
  - `/offline` page → Task 4
  - Navigation fallback → Task 3 (fallbacks config)
  - Registration → Task 5
  - Manual DevTools flow → Task 8
  - Lighthouse spot check → Task 8 Step 12
  - No test-runner added → respected, no Vitest step
  - Mobile, manifest, offline queue out of scope → respected (no tasks)

- **Broadened auth-clear trigger:** the spec described "on signOut" — the plan hooks into `onAuthStateChange` user-id change instead, which is strictly more correct (covers user-switch on shared devices). Same threat model, better coverage.

- **Version-tolerant serwist imports:** Task 7 Step 3 provides a fallback if `serwist@9.x` re-exports change across minor versions.
