# Friendly Error Messages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace raw HTTP errors (504/429/timeout/offline/5xx) with bilingual, brand-voiced toasts in both web and mobile, with safe automatic retry on read traffic.

**Architecture:** A pure error classifier returns a discriminated union; existing fetchers (`rawaq-web/lib/client-fetch.ts`, `rawaq-mobile/lib/api.ts`) absorb classification + a single 1.5s GET retry + a 15s `AbortController` timeout, then publish to a tiny event emitter; a global toast provider/component subscribes and renders localized copy. New mutation helpers replace raw `fetch` calls at high-risk surfaces.

**Tech Stack:** Next.js 14 + React (web), Expo + React Native (mobile), existing `t(key)` locale system, `node --import tsx --test` for unit tests. No new runtime deps; `tsx` added as a single dev dep on the web side for TS test execution.

**Spec:** `docs/superpowers/specs/2026-04-25-friendly-error-messages-design.md`

---

## File Map

| Action | File                                                              | Purpose                                                      |
| ------ | ----------------------------------------------------------------- | ------------------------------------------------------------ |
| Modify | `rawaq-web/package.json`                                          | Add `tsx` dev dep                                            |
| Create | `rawaq-web/lib/error-classifier.ts`                               | Pure classifier                                              |
| Create | `rawaq-web/lib/error-classifier.test.ts`                          | `node --test` unit tests                                     |
| Create | `rawaq-web/lib/error-emitter.ts`                                  | React-free event emitter                                     |
| Modify | `rawaq-web/contexts/locale-context.tsx`                           | Add 11 EN + 11 AR `errors.*` keys                            |
| Create | `rawaq-web/components/feedback/ErrorToast.tsx`                    | Toast UI + `<ErrorToastProvider>`                            |
| Modify | `rawaq-web/app/layout.tsx`                                        | Mount `<ErrorToastProvider>`                                 |
| Modify | `rawaq-web/lib/client-fetch.ts`                                   | Classifier + retry + timeout + emitter; add mutation helpers |
| Modify | `rawaq-web/app/(app)/bookings/BookingsClient.tsx`                 | Migrate to `clientPostJson` (refund flow)                    |
| Modify | `rawaq-web/app/(app)/bookings/[id]/page.tsx`                      | Migrate booking confirm/cancel                               |
| Modify | `rawaq-web/app/(app)/communities/page.tsx`                        | Migrate community join                                       |
| Modify | `rawaq-web/app/(app)/communities/[slug]/page.tsx`                 | Migrate community actions                                    |
| Modify | `rawaq-web/app/(app)/communities/new/page.tsx`                    | Migrate community create                                     |
| Modify | `rawaq-web/app/(app)/chat/page.tsx`                               | Migrate chat send                                            |
| Modify | `rawaq-web/app/(app)/notifications/page.tsx`                      | Migrate mark-read mutations                                  |
| Modify | `rawaq-web/app/(auth)/register/page.tsx`                          | Migrate register                                             |
| Modify | `rawaq-web/app/(app)/profile/page.tsx`                            | Migrate profile save                                         |
| Modify | `rawaq-web/app/(app)/organizer/events/[id]/ticket-types/page.tsx` | Migrate ticket-type CRUD                                     |
| Modify | `rawaq-web/app/(app)/organizer/promo-codes/page.tsx`              | Migrate promo CRUD                                           |
| Modify | `rawaq-web/app/(app)/organizer/earnings/page.tsx`                 | Migrate earnings actions                                     |
| Modify | `rawaq-web/app/(app)/admin/refunds/page.tsx`                      | Migrate admin refund actions                                 |
| Modify | `rawaq-web/app/(app)/admin/payouts/page.tsx`                      | Migrate admin payout actions                                 |
| Modify | `rawaq-web/app/(app)/admin/communities/page.tsx`                  | Migrate admin community actions                              |
| Modify | `rawaq-web/app/(app)/admin/support/page.tsx`                      | Migrate admin support actions                                |
| Modify | `rawaq-web/app/(app)/admin/reports/page.tsx`                      | Migrate admin reports actions                                |
| Modify | `rawaq-web/app/(app)/admin/audit-logs/page.tsx`                   | Migrate admin audit actions                                  |
| Create | `rawaq-mobile/lib/error-classifier.ts`                            | Mirror of web                                                |
| Create | `rawaq-mobile/lib/error-classifier.test.ts`                       | Mirror unit tests                                            |
| Create | `rawaq-mobile/lib/error-emitter.ts`                               | Mirror emitter                                               |
| Modify | `rawaq-mobile/contexts/locale-context.tsx`                        | Add 11 EN + 11 AR `errors.*` keys                            |
| Create | `rawaq-mobile/components/feedback/ErrorToast.tsx`                 | RN toast                                                     |
| Modify | `rawaq-mobile/app/_layout.tsx`                                    | Mount toast component                                        |
| Modify | `rawaq-mobile/lib/api.ts`                                         | Classifier + retry + timeout + emitter on all helpers        |

---

## Task 1: Install tsx for running classifier tests (web)

**Files:**

- Modify: `rawaq-web/package.json`

- [ ] **Step 1: Install tsx as dev dep**

```bash
cd rawaq-web && npm install --save-dev tsx
```

Expected output ends with `added 1 package`.

- [ ] **Step 2: Verify it runs**

```bash
cd rawaq-web && npx tsx --version
```

Expected: a version string like `tsx v4.x.x`.

- [ ] **Step 3: Commit**

```bash
cd rawaq-web && git add package.json package-lock.json
git commit -m "chore(web): add tsx dev dep for TS unit tests"
```

---

## Task 2: Create web error classifier (TDD)

**Files:**

- Create: `rawaq-web/lib/error-classifier.ts`
- Create: `rawaq-web/lib/error-classifier.test.ts`

- [ ] **Step 1: Write the failing test file**

Create `rawaq-web/lib/error-classifier.test.ts`:

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyResponse, classifyThrown } from "./error-classifier";

function res(status: number, headers: Record<string, string> = {}): Response {
  return new Response(null, { status, headers });
}

test("429 with Retry-After becomes rate_limited with seconds", () => {
  const out = classifyResponse(res(429, { "Retry-After": "12" }));
  assert.deepEqual(out, { kind: "rate_limited", retryAfterSec: 12 });
});

test("429 without Retry-After becomes rate_limited with null", () => {
  const out = classifyResponse(res(429));
  assert.deepEqual(out, { kind: "rate_limited", retryAfterSec: null });
});

test("500/502/503/504 become transient", () => {
  for (const s of [500, 502, 503, 504]) {
    assert.deepEqual(
      classifyResponse(res(s)),
      { kind: "transient" },
      `status ${s}`,
    );
  }
});

test("401/403 become auth", () => {
  for (const s of [401, 403]) {
    assert.deepEqual(classifyResponse(res(s)), { kind: "auth" }, `status ${s}`);
  }
});

test("400/404/409/422 become client", () => {
  for (const s of [400, 404, 409, 422]) {
    assert.deepEqual(
      classifyResponse(res(s)),
      { kind: "client" },
      `status ${s}`,
    );
  }
});

test("200 returns null (not an error)", () => {
  assert.equal(classifyResponse(res(200)), null);
});

test("AbortError thrown by our timeout becomes timeout", () => {
  const err = new DOMException("aborted", "AbortError");
  assert.deepEqual(classifyThrown(err, { isOnline: true, timedOut: true }), {
    kind: "timeout",
  });
});

test("Network throw with offline flag becomes offline", () => {
  const err = new TypeError("Failed to fetch");
  assert.deepEqual(classifyThrown(err, { isOnline: false, timedOut: false }), {
    kind: "offline",
  });
});

test("Network throw while online becomes transient", () => {
  const err = new TypeError("Failed to fetch");
  assert.deepEqual(classifyThrown(err, { isOnline: true, timedOut: false }), {
    kind: "transient",
  });
});

test("Unknown error type becomes unknown", () => {
  assert.deepEqual(
    classifyThrown("string-error", { isOnline: true, timedOut: false }),
    { kind: "unknown" },
  );
});
```

- [ ] **Step 2: Run the test — verify it fails (module missing)**

```bash
cd rawaq-web && node --import tsx --test lib/error-classifier.test.ts
```

Expected: failure messages mentioning that `./error-classifier` cannot be resolved.

- [ ] **Step 3: Write the minimal implementation**

Create `rawaq-web/lib/error-classifier.ts`:

```typescript
export type ClassifiedError =
  | { kind: "rate_limited"; retryAfterSec: number | null }
  | { kind: "transient" }
  | { kind: "offline" }
  | { kind: "timeout" }
  | { kind: "auth" }
  | { kind: "client" }
  | { kind: "unknown" };

export type ThrownContext = {
  isOnline: boolean;
  timedOut: boolean;
};

export function classifyResponse(res: Response): ClassifiedError | null {
  const s = res.status;
  if (s >= 200 && s < 400) return null;
  if (s === 429) {
    const header = res.headers.get("Retry-After");
    const parsed = header ? parseInt(header, 10) : NaN;
    return {
      kind: "rate_limited",
      retryAfterSec: Number.isFinite(parsed) ? parsed : null,
    };
  }
  if (s === 401 || s === 403) return { kind: "auth" };
  if (s >= 500 && s <= 599) return { kind: "transient" };
  if (s >= 400 && s < 500) return { kind: "client" };
  return { kind: "unknown" };
}

export function classifyThrown(
  err: unknown,
  ctx: ThrownContext,
): ClassifiedError {
  if (ctx.timedOut) return { kind: "timeout" };
  if (err instanceof DOMException && err.name === "AbortError") {
    return { kind: "timeout" };
  }
  if (err instanceof TypeError) {
    return ctx.isOnline ? { kind: "transient" } : { kind: "offline" };
  }
  return { kind: "unknown" };
}
```

- [ ] **Step 4: Run the test — verify it passes**

```bash
cd rawaq-web && node --import tsx --test lib/error-classifier.test.ts
```

Expected: all 10 tests pass, exit code 0.

- [ ] **Step 5: TypeScript compiles**

```bash
cd rawaq-web && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
cd rawaq-web && git add lib/error-classifier.ts lib/error-classifier.test.ts
git commit -m "feat(web): add error classifier with discriminated-union output"
```

---

## Task 3: Create web error emitter

**Files:**

- Create: `rawaq-web/lib/error-emitter.ts`

- [ ] **Step 1: Write the file**

```typescript
import type { ClassifiedError } from "./error-classifier";

export type ErrorEvent = {
  classified: ClassifiedError;
  retry?: () => void; // present only when caller is retryable (GET)
};

type Listener = (event: ErrorEvent) => void;

const listeners = new Set<Listener>();

export const errorEmitter = {
  emit(event: ErrorEvent): void {
    for (const fn of listeners) {
      try {
        fn(event);
      } catch {
        /* listener errors must not break callers */
      }
    }
  },
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};
```

- [ ] **Step 2: TypeScript compiles**

```bash
cd rawaq-web && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd rawaq-web && git add lib/error-emitter.ts
git commit -m "feat(web): add error event emitter for toast surface"
```

---

## Task 4: Add web error locale keys

**Files:**

- Modify: `rawaq-web/contexts/locale-context.tsx`

- [ ] **Step 1: Add EN keys**

Open `rawaq-web/contexts/locale-context.tsx`. Find the `en: { ... }` block. Inside, anywhere before `...(landingTranslationsEn as Record<string, string>),` (e.g., right after the `// Common` group around line 156), insert:

```typescript
    // Errors
    'errors.transient.title': 'Something went wrong',
    'errors.transient.body':"We couldn't reach the server. Please try again in a moment.",
    'errors.timeout.title': 'Taking longer than usual',
    'errors.timeout.body':  "Your connection seems slow. We'll wait - you can retry when ready.",
    'errors.offline.title': "You're offline",
    'errors.offline.body': 'Check your connection and try again.',
    'errors.rate_limited.title': 'Slow down a moment',
    'errors.rate_limited.body': "You've done that a lot in a short time. Try again in {seconds}s.",
    'errors.rate_limited.body_no_seconds': "You've done that a lot in a short time. Please wait a moment.",
    'errors.action.retry':  'Try again',
    'errors.action.dismiss':'Dismiss',
```

- [ ] **Step 2: Add AR keys**

In the same file, find the `ar: { ... }` block. Insert before `...(landingTranslationsAr as Record<string, string>),`:

```typescript
    // Errors
    'errors.transient.title':    'حدث خطأ ما',
    'errors.transient.body':'تعذّر الوصول إلى الخادم. حاول مرة أخرى بعد لحظات.',
    'errors.timeout.title': 'يستغرق وقتًا أطول من المعتاد',
    'errors.timeout.body':  'يبدو اتصالك بطيئًا. خذ وقتك وأعد المحاولة عندما تكون مستعدًا.',
    'errors.offline.title': 'أنت غير متصل بالإنترنت',
    'errors.offline.body':  'تحقق من اتصالك ثم حاول مرة أخرى.',
    'errors.rate_limited.title': 'تمهّل قليلاً',
    'errors.rate_limited.body':  'لقد قمت بهذا كثيرًا خلال وقت قصير. حاول بعد {seconds} ثانية.',
    'errors.rate_limited.body_no_seconds': 'لقد قمت بهذا كثيرًا خلال وقت قصير. يُرجى الانتظار لحظة.',
    'errors.action.retry':  'حاول مرة أخرى',
    'errors.action.dismiss':'إخفاء',
```

- [ ] **Step 3: TypeScript compiles**

```bash
cd rawaq-web && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd rawaq-web && git add contexts/locale-context.tsx
git commit -m "feat(web): add errors.* locale keys (EN+AR) for friendly error toasts"
```

---

## Task 5: Create web ErrorToast component + provider

**Files:**

- Create: `rawaq-web/components/feedback/ErrorToast.tsx`

- [ ] **Step 1: Write the file**

```tsx
"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useLocale } from "@/contexts/locale-context";
import { errorEmitter, type ErrorEvent } from "@/lib/error-emitter";
import type { ClassifiedError } from "@/lib/error-classifier";

type ToastItem = {
  id: number;
  classified: ClassifiedError;
  retry?: () => void;
  dismissAfterMs: number;
};

const MAX_TOASTS = 3;
let nextId = 1;

function dismissDelayFor(c: ClassifiedError): number {
  if (c.kind === "rate_limited") {
    const sec = c.retryAfterSec ?? 6;
    const clamped = Math.min(Math.max(sec, 6), 10);
    return clamped * 1000;
  }
  return 6000;
}

function titleKey(c: ClassifiedError): string {
  switch (c.kind) {
    case "rate_limited":
      return "errors.rate_limited.title";
    case "timeout":
      return "errors.timeout.title";
    case "offline":
      return "errors.offline.title";
    default:
      return "errors.transient.title";
  }
}

function bodyKeyAndVars(c: ClassifiedError): { key: string; seconds?: number } {
  switch (c.kind) {
    case "rate_limited":
      return c.retryAfterSec != null
        ? { key: "errors.rate_limited.body", seconds: c.retryAfterSec }
        : { key: "errors.rate_limited.body_no_seconds" };
    case "timeout":
      return { key: "errors.timeout.body" };
    case "offline":
      return { key: "errors.offline.body" };
    default:
      return { key: "errors.transient.body" };
  }
}

export function ErrorToastProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { t, dir } = useLocale();
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(
    new Map(),
  );

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  useEffect(() => {
    const unsub = errorEmitter.subscribe((event: ErrorEvent) => {
      const id = nextId++;
      const dismissAfterMs = dismissDelayFor(event.classified);
      setToasts((prev) => {
        const next = [
          ...prev,
          {
            id,
            classified: event.classified,
            retry: event.retry,
            dismissAfterMs,
          },
        ];
        // FIFO: drop oldest above MAX_TOASTS
        return next.length > MAX_TOASTS
          ? next.slice(next.length - MAX_TOASTS)
          : next;
      });
      const timer = setTimeout(() => dismiss(id), dismissAfterMs);
      timersRef.current.set(id, timer);
    });
    return unsub;
  }, [dismiss]);

  useEffect(() => {
    return () => {
      timersRef.current.forEach((t) => clearTimeout(t));
      timersRef.current.clear();
    };
  }, []);

  return (
    <>
      {children}
      <div
        role="region"
        aria-live="polite"
        aria-label="Notifications"
        dir={dir}
        style={{
          position: "fixed",
          bottom: 16,
          insetInlineEnd: 16,
          display: "flex",
          flexDirection: "column",
          gap: 8,
          zIndex: 9999,
          pointerEvents: "none",
          maxWidth: "calc(100vw - 32px)",
          width: 360,
        }}
      >
        {toasts.map((toast) => {
          const body = bodyKeyAndVars(toast.classified);
          let bodyText = t(body.key);
          if (body.seconds != null)
            bodyText = bodyText.replace("{seconds}", String(body.seconds));
          return (
            <div
              key={toast.id}
              style={{
                pointerEvents: "auto",
                background: "var(--c-ink, #1a1410)",
                color: "var(--c-paper, #fafaf7)",
                borderInlineStart: "4px solid var(--c-gold, #d8a23a)",
                padding: "12px 14px",
                borderRadius: 8,
                boxShadow: "0 6px 24px rgba(0,0,0,0.18)",
                fontFamily: "inherit",
                animation:
                  "@media (prefers-reduced-motion: no-preference) { errorToastSlideIn 200ms ease-out }",
              }}
            >
              <div
                style={{ display: "flex", alignItems: "flex-start", gap: 12 }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{ fontWeight: 700, fontSize: 14, marginBottom: 2 }}
                  >
                    {t(titleKey(toast.classified))}
                  </div>
                  <div style={{ fontSize: 13, opacity: 0.85, lineHeight: 1.4 }}>
                    {bodyText}
                  </div>
                  {toast.retry && (
                    <button
                      type="button"
                      onClick={() => {
                        toast.retry?.();
                        dismiss(toast.id);
                      }}
                      style={{
                        marginTop: 8,
                        background: "transparent",
                        color: "var(--c-gold, #d8a23a)",
                        border: "1px solid var(--c-gold, #d8a23a)",
                        padding: "4px 10px",
                        borderRadius: 6,
                        cursor: "pointer",
                        fontSize: 12,
                        fontWeight: 600,
                      }}
                    >
                      {t("errors.action.retry")}
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  aria-label={t("errors.action.dismiss")}
                  onClick={() => dismiss(toast.id)}
                  style={{
                    background: "transparent",
                    color: "inherit",
                    border: "none",
                    cursor: "pointer",
                    fontSize: 18,
                    lineHeight: 1,
                    opacity: 0.6,
                    padding: 0,
                  }}
                >
                  ×
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
```

- [ ] **Step 2: TypeScript compiles**

```bash
cd rawaq-web && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd rawaq-web && git add components/feedback/ErrorToast.tsx
git commit -m "feat(web): add ErrorToastProvider and toast UI for transient errors"
```

---

## Task 6: Mount ErrorToastProvider in web root layout

**Files:**

- Modify: `rawaq-web/app/layout.tsx`

- [ ] **Step 1: Add the import and wrap children**

Open `rawaq-web/app/layout.tsx`. After the `LocaleProvider` import (line 4), add:

```typescript
import { ErrorToastProvider } from "@/components/feedback/ErrorToast";
```

In `RootLayout`, change the body wrapping from:

```tsx
<LocaleProvider>
  <AuthProvider>{children}</AuthProvider>
</LocaleProvider>
```

to:

```tsx
<LocaleProvider>
  <ErrorToastProvider>
    <AuthProvider>{children}</AuthProvider>
  </ErrorToastProvider>
</LocaleProvider>
```

`ErrorToastProvider` must be inside `LocaleProvider` (it calls `useLocale()`).

- [ ] **Step 2: TypeScript compiles**

```bash
cd rawaq-web && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Smoke test — page still renders**

```bash
cd rawaq-web && npm run dev
```

Open http://localhost:3000. Expected: page loads normally, no console errors. The toast won't render anything yet because nothing has emitted — visual verification of the toast happens in Task 7 Step 5 once the fetcher emits real errors.

- [ ] **Step 4: Commit**

```bash
cd rawaq-web && git add app/layout.tsx
git commit -m "feat(web): mount ErrorToastProvider at root layout"
```

---

## Task 7: Integrate classifier + retry + timeout + emitter into clientGetJson

**Files:**

- Modify: `rawaq-web/lib/client-fetch.ts`

- [ ] **Step 1: Update imports and `ClientGetOptions` type**

At the top of `rawaq-web/lib/client-fetch.ts`, add imports:

```typescript
import {
  classifyResponse,
  classifyThrown,
  type ClassifiedError,
} from "./error-classifier";
import { errorEmitter } from "./error-emitter";
```

Replace the `ClientGetOptions` type with:

```typescript
type ClientGetOptions = {
  ttlMs?: number;
  force?: boolean;
  skipCache?: boolean;
  scopeKey?: string | null;
  signal?: AbortSignal;
  retry?: boolean; // default true
  silent?: boolean; // default false; true skips toast emission
  timeoutMs?: number; // default 15_000
};
```

- [ ] **Step 2: Add timeout + retry helpers near the top of the module**

After the `parseJsonSafe` function (around line 82), add:

```typescript
const DEFAULT_TIMEOUT_MS = 15_000;
const TRANSIENT_RETRY_DELAY_MS = 1_500;

async function fetchWithTimeout(
  input: RequestInfo,
  init: RequestInit,
  timeoutMs: number,
  externalSignal: AbortSignal | undefined,
): Promise<{ res: Response | null; thrown: unknown; timedOut: boolean }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  let timedOut = false;
  controller.signal.addEventListener("abort", () => {
    if (!externalSignal?.aborted) timedOut = true;
  });

  // Link external signal
  let externalAbortHandler: (() => void) | null = null;
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort();
    else {
      externalAbortHandler = () => controller.abort();
      externalSignal.addEventListener("abort", externalAbortHandler);
    }
  }

  try {
    const res = await fetch(input, { ...init, signal: controller.signal });
    return { res, thrown: null, timedOut: false };
  } catch (err) {
    return { res: null, thrown: err, timedOut };
  } finally {
    clearTimeout(timeoutId);
    if (externalSignal && externalAbortHandler) {
      externalSignal.removeEventListener("abort", externalAbortHandler);
    }
  }
}

function isOnline(): boolean {
  return typeof navigator === "undefined" ? true : navigator.onLine !== false;
}

function emitToast(
  classified: ClassifiedError,
  retry?: () => void,
  silent?: boolean,
) {
  if (silent) return;
  if (
    classified.kind === "auth" ||
    classified.kind === "client" ||
    classified.kind === "unknown"
  )
    return;
  errorEmitter.emit({ classified, retry });
}
```

- [ ] **Step 3: Replace the `request` IIFE in `clientGetJson`**

Find the existing `const request = (async () => { ... })()` block in `clientGetJson` (around line 151) and replace it with:

```typescript
const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
const allowRetry = options.retry !== false;

const request = (async () => {
  // Pre-flight offline short-circuit (web only — navigator.onLine is reliable here)
  if (!isOnline()) {
    const classified: ClassifiedError = { kind: "offline" };
    emitToast(
      classified,
      () => {
        void clientGetJson<T>(path, options);
      },
      options.silent,
    );
    throw new Error("offline");
  }

  const init: RequestInit = {
    method: "GET",
    cache: "no-store",
    credentials: "same-origin",
  };

  let attempt = await fetchWithTimeout(path, init, timeoutMs, options.signal);
  let classified: ClassifiedError | null = null;

  if (attempt.res) {
    classified = classifyResponse(attempt.res);
  } else {
    classified = classifyThrown(attempt.thrown, {
      isOnline: isOnline(),
      timedOut: attempt.timedOut,
    });
  }

  // Retry once on `transient` for GETs
  if (allowRetry && classified?.kind === "transient") {
    await new Promise((r) => setTimeout(r, TRANSIENT_RETRY_DELAY_MS));
    attempt = await fetchWithTimeout(path, init, timeoutMs, options.signal);
    if (attempt.res) {
      classified = classifyResponse(attempt.res);
    } else {
      classified = classifyThrown(attempt.thrown, {
        isOnline: isOnline(),
        timedOut: attempt.timedOut,
      });
    }
  }

  if (attempt.res && attempt.res.ok) {
    const json = await parseJsonSafe<T>(attempt.res);
    if (!skipCache) {
      const entry = { updatedAt: Date.now(), data: json };
      getCache.set(cacheKey, entry);
      setPersistentCached(cacheKey, entry);
    }
    return json;
  }

  // Failure path
  if (attempt.res && classified) {
    const errJson = await parseJsonSafe<{ error?: string }>(attempt.res);
    if (
      classified.kind === "auth" ||
      classified.kind === "client" ||
      classified.kind === "unknown"
    ) {
      // Surface server message to caller for inline display; no toast.
      throw new Error(
        errJson.error ?? `Request failed (${attempt.res.status})`,
      );
    }
    // Toast-eligible categories.
    emitToast(
      classified,
      () => {
        void clientGetJson<T>(path, options);
      },
      options.silent,
    );
    throw new Error(errJson.error ?? `Request failed (${attempt.res.status})`);
  }

  if (classified) {
    emitToast(
      classified,
      () => {
        void clientGetJson<T>(path, options);
      },
      options.silent,
    );
  }
  throw attempt.thrown ?? new Error("Network error");
})();
```

- [ ] **Step 4: TypeScript compiles**

```bash
cd rawaq-web && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Smoke test — transient error toasts**

```bash
cd rawaq-web && npm run dev
```

In another terminal, kill the dev server. Reload the page in the browser. Expect a toast titled "Something went wrong" with a "Try again" button after a ~1.5s pause (the silent retry).

Restart the dev server. Click the Try-again button on the toast. Expect the page to reload data successfully.

- [ ] **Step 6: Commit**

```bash
cd rawaq-web && git add lib/client-fetch.ts
git commit -m "feat(web): integrate error classifier, retry, timeout, and toast emitter into clientGetJson"
```

---

## Task 8: Add web mutation helpers

**Files:**

- Modify: `rawaq-web/lib/client-fetch.ts`

- [ ] **Step 1: Add the helpers at the bottom of `client-fetch.ts`**

Append to the file:

```typescript
type MutationOptions = {
  signal?: AbortSignal;
  silent?: boolean;
  timeoutMs?: number;
};

async function clientMutation<T>(
  method: "POST" | "PATCH" | "DELETE",
  path: string,
  body: unknown | undefined,
  options: MutationOptions = {},
): Promise<T> {
  if (!isOnline()) {
    const classified: ClassifiedError = { kind: "offline" };
    emitToast(classified, undefined, options.silent);
    throw new Error("offline");
  }

  const init: RequestInit = {
    method,
    credentials: "same-origin",
    headers:
      body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  };

  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const attempt = await fetchWithTimeout(path, init, timeoutMs, options.signal);

  let classified: ClassifiedError | null = null;
  if (attempt.res) classified = classifyResponse(attempt.res);
  else
    classified = classifyThrown(attempt.thrown, {
      isOnline: isOnline(),
      timedOut: attempt.timedOut,
    });

  if (attempt.res && attempt.res.ok) {
    // Invalidate GET cache after mutations.
    clientFetchInvalidateAll();
    return parseJsonSafe<T>(attempt.res);
  }

  if (attempt.res) {
    const errJson = await parseJsonSafe<{ error?: string }>(attempt.res);
    if (
      classified &&
      classified.kind !== "auth" &&
      classified.kind !== "client" &&
      classified.kind !== "unknown"
    ) {
      emitToast(classified, undefined, options.silent); // no retry button on mutations
    }
    throw new Error(errJson.error ?? `Request failed (${attempt.res.status})`);
  }

  if (classified) emitToast(classified, undefined, options.silent);
  throw attempt.thrown ?? new Error("Network error");
}

export function clientPostJson<T = unknown>(
  path: string,
  body?: unknown,
  options?: MutationOptions,
): Promise<T> {
  return clientMutation<T>("POST", path, body, options);
}

export function clientPatchJson<T = unknown>(
  path: string,
  body?: unknown,
  options?: MutationOptions,
): Promise<T> {
  return clientMutation<T>("PATCH", path, body, options);
}

export function clientDeleteJson<T = unknown>(
  path: string,
  options?: MutationOptions,
): Promise<T> {
  return clientMutation<T>("DELETE", path, undefined, options);
}
```

- [ ] **Step 2: TypeScript compiles**

```bash
cd rawaq-web && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd rawaq-web && git add lib/client-fetch.ts
git commit -m "feat(web): add clientPostJson/PatchJson/DeleteJson mutation helpers"
```

---

## Task 9: Migrate critical web mutation call-sites

**Files:**

- Modify: `rawaq-web/app/(app)/bookings/BookingsClient.tsx`
- Modify: `rawaq-web/app/(app)/bookings/[id]/page.tsx`
- Modify: `rawaq-web/app/(auth)/register/page.tsx`
- Modify: `rawaq-web/app/(app)/profile/page.tsx`

**Approach:** for each file, replace raw `fetch(...)` mutation calls with `clientPostJson` / `clientPatchJson` / `clientDeleteJson`. The helper throws on error; existing `try/catch` blocks should call the helper and surface only the _thrown error message_ inline (the toast handles transient/network errors automatically).

- [ ] **Step 1: Migrate `BookingsClient.tsx`**

Open `rawaq-web/app/(app)/bookings/BookingsClient.tsx`. Find each block of the form:

```typescript
const res = await fetch('/api/bookings/...', { method: 'POST', ... })
const json = await res.json()
if (!res.ok) {
  setError(json.error)
  return
}
// success
```

And replace with:

```typescript
import { clientPostJson } from "@/lib/client-fetch"; // add import at top of file

try {
  const json = await clientPostJson<{
    /* response shape */
  }>("/api/bookings/...", {
    /* body */
  });
  // success — use `json`
} catch (err) {
  // err is Error; only surface inline if you want to show the server message
  // Transient/offline/timeout/rate_limited already toasted.
  // For 4xx server messages, optionally:
  setError(err instanceof Error ? err.message : "Failed");
}
```

Apply the pattern to every mutation in the file (booking cancel, refund request).

- [ ] **Step 2: Migrate `bookings/[id]/page.tsx`**

Same pattern. The booking-detail page has refund and ticket-related mutations.

- [ ] **Step 3: Migrate `register/page.tsx`**

The register page has a POST to `/api/auth/...` (verify exact path in file). Migrate.

- [ ] **Step 4: Migrate `profile/page.tsx`**

The profile page has profile update PATCH calls. Migrate.

- [ ] **Step 5: TypeScript compiles**

```bash
cd rawaq-web && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Manual smoke test on each migrated flow**

- Booking refund: open a confirmed booking, click Refund, confirm. Expect existing success/inline-error UX to still work. Stop the dev server mid-click → expect transient toast.
- Profile save: change a field, save. Expect same UX. With server stopped → expect toast.

- [ ] **Step 7: Commit**

```bash
cd rawaq-web && git add app/\(app\)/bookings/BookingsClient.tsx app/\(app\)/bookings/\[id\]/page.tsx app/\(auth\)/register/page.tsx app/\(app\)/profile/page.tsx
git commit -m "feat(web): migrate booking/auth/profile mutations to clientPostJson"
```

---

## Task 10: Migrate remaining web mutation call-sites

**Files:**

- Modify: `rawaq-web/app/(app)/communities/page.tsx`
- Modify: `rawaq-web/app/(app)/communities/[slug]/page.tsx`
- Modify: `rawaq-web/app/(app)/communities/new/page.tsx`
- Modify: `rawaq-web/app/(app)/chat/page.tsx`
- Modify: `rawaq-web/app/(app)/notifications/page.tsx`
- Modify: `rawaq-web/app/(app)/organizer/events/[id]/ticket-types/page.tsx`
- Modify: `rawaq-web/app/(app)/organizer/promo-codes/page.tsx`
- Modify: `rawaq-web/app/(app)/organizer/earnings/page.tsx`
- Modify: `rawaq-web/app/(app)/admin/refunds/page.tsx`
- Modify: `rawaq-web/app/(app)/admin/payouts/page.tsx`
- Modify: `rawaq-web/app/(app)/admin/communities/page.tsx`
- Modify: `rawaq-web/app/(app)/admin/support/page.tsx`
- Modify: `rawaq-web/app/(app)/admin/reports/page.tsx`
- Modify: `rawaq-web/app/(app)/admin/audit-logs/page.tsx`

- [ ] **Step 1: Migrate community pages (3 files)**

In each of `communities/page.tsx`, `communities/[slug]/page.tsx`, `communities/new/page.tsx`, replace raw `fetch` mutations with `clientPostJson` / `clientPatchJson` / `clientDeleteJson` using the same pattern as Task 9.

- [ ] **Step 2: Migrate chat + notifications (2 files)**

`chat/page.tsx`: chat send → `clientPostJson('/api/chat', { content })`.
`notifications/page.tsx`: mark-read mutations.

- [ ] **Step 3: Migrate organizer pages (3 files)**

ticket-types CRUD, promo-codes CRUD, earnings actions.

- [ ] **Step 4: Migrate admin pages (6 files)**

refunds, payouts, communities, support, reports, audit-logs — each contains admin action mutations.

- [ ] **Step 5: TypeScript compiles**

```bash
cd rawaq-web && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Smoke test the high-traffic flows**

Manually exercise: chat send, community join, notification mark-read, organizer ticket creation. Verify inline success behavior is unchanged and that with the dev server stopped, transient toasts appear.

- [ ] **Step 7: Commit**

```bash
cd rawaq-web && git add app/\(app\)/communities app/\(app\)/chat app/\(app\)/notifications app/\(app\)/organizer app/\(app\)/admin
git commit -m "feat(web): migrate remaining mutation call-sites to client-fetch helpers"
```

---

## Task 11: Create mobile error classifier (TDD)

**Files:**

- Create: `rawaq-mobile/lib/error-classifier.ts`
- Create: `rawaq-mobile/lib/error-classifier.test.ts`

The mobile classifier is identical to web in shape and behavior. RN does not have `navigator.onLine`, so `ThrownContext.isOnline` is supplied by the caller — for now, default to `true` (we rely on the thrown-error heuristic + post-fail check). Tests run via the host Node runtime, so the file imports nothing RN-specific.

- [ ] **Step 1: Install tsx in mobile package for tests**

```bash
cd rawaq-mobile && npm install --save-dev tsx
```

- [ ] **Step 2: Write the failing test**

Create `rawaq-mobile/lib/error-classifier.test.ts`:

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyResponse, classifyThrown } from "./error-classifier";

function res(status: number, headers: Record<string, string> = {}): Response {
  return new Response(null, { status, headers });
}

test("429 with Retry-After becomes rate_limited with seconds", () => {
  const out = classifyResponse(res(429, { "Retry-After": "12" }));
  assert.deepEqual(out, { kind: "rate_limited", retryAfterSec: 12 });
});

test("429 without Retry-After becomes rate_limited with null", () => {
  const out = classifyResponse(res(429));
  assert.deepEqual(out, { kind: "rate_limited", retryAfterSec: null });
});

test("500/502/503/504 become transient", () => {
  for (const s of [500, 502, 503, 504]) {
    assert.deepEqual(
      classifyResponse(res(s)),
      { kind: "transient" },
      `status ${s}`,
    );
  }
});

test("401/403 become auth", () => {
  for (const s of [401, 403]) {
    assert.deepEqual(classifyResponse(res(s)), { kind: "auth" }, `status ${s}`);
  }
});

test("400/404/409/422 become client", () => {
  for (const s of [400, 404, 409, 422]) {
    assert.deepEqual(
      classifyResponse(res(s)),
      { kind: "client" },
      `status ${s}`,
    );
  }
});

test("200 returns null (not an error)", () => {
  assert.equal(classifyResponse(res(200)), null);
});

test("AbortError thrown by our timeout becomes timeout", () => {
  const err = new DOMException("aborted", "AbortError");
  assert.deepEqual(classifyThrown(err, { isOnline: true, timedOut: true }), {
    kind: "timeout",
  });
});

test("Network throw with offline flag becomes offline", () => {
  const err = new TypeError("Failed to fetch");
  assert.deepEqual(classifyThrown(err, { isOnline: false, timedOut: false }), {
    kind: "offline",
  });
});

test("Network throw while online becomes transient", () => {
  const err = new TypeError("Failed to fetch");
  assert.deepEqual(classifyThrown(err, { isOnline: true, timedOut: false }), {
    kind: "transient",
  });
});

test("Unknown error type becomes unknown", () => {
  assert.deepEqual(
    classifyThrown("string-error", { isOnline: true, timedOut: false }),
    { kind: "unknown" },
  );
});
```

- [ ] **Step 3: Run the test — verify it fails**

```bash
cd rawaq-mobile && node --import tsx --test lib/error-classifier.test.ts
```

Expected: failure (module missing).

- [ ] **Step 4: Write the implementation**

Create `rawaq-mobile/lib/error-classifier.ts`:

```typescript
export type ClassifiedError =
  | { kind: "rate_limited"; retryAfterSec: number | null }
  | { kind: "transient" }
  | { kind: "offline" }
  | { kind: "timeout" }
  | { kind: "auth" }
  | { kind: "client" }
  | { kind: "unknown" };

export type ThrownContext = {
  isOnline: boolean;
  timedOut: boolean;
};

export function classifyResponse(res: Response): ClassifiedError | null {
  const s = res.status;
  if (s >= 200 && s < 400) return null;
  if (s === 429) {
    const header = res.headers.get("Retry-After");
    const parsed = header ? parseInt(header, 10) : NaN;
    return {
      kind: "rate_limited",
      retryAfterSec: Number.isFinite(parsed) ? parsed : null,
    };
  }
  if (s === 401 || s === 403) return { kind: "auth" };
  if (s >= 500 && s <= 599) return { kind: "transient" };
  if (s >= 400 && s < 500) return { kind: "client" };
  return { kind: "unknown" };
}

export function classifyThrown(
  err: unknown,
  ctx: ThrownContext,
): ClassifiedError {
  if (ctx.timedOut) return { kind: "timeout" };
  if (err instanceof DOMException && err.name === "AbortError") {
    return { kind: "timeout" };
  }
  if (err instanceof TypeError) {
    return ctx.isOnline ? { kind: "transient" } : { kind: "offline" };
  }
  return { kind: "unknown" };
}
```

- [ ] **Step 5: Run the test — verify it passes**

```bash
cd rawaq-mobile && node --import tsx --test lib/error-classifier.test.ts
```

Expected: all 10 tests pass.

- [ ] **Step 6: TypeScript compiles**

```bash
cd rawaq-mobile && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
cd rawaq-mobile && git add lib/error-classifier.ts lib/error-classifier.test.ts package.json package-lock.json
git commit -m "feat(mobile): add error classifier with discriminated-union output"
```

---

## Task 12: Create mobile error emitter

**Files:**

- Create: `rawaq-mobile/lib/error-emitter.ts`

- [ ] **Step 1: Write the file**

Identical to Task 3 Step 1 — same code, just at a different path:

```typescript
import type { ClassifiedError } from "./error-classifier";

export type ErrorEvent = {
  classified: ClassifiedError;
  retry?: () => void;
};

type Listener = (event: ErrorEvent) => void;

const listeners = new Set<Listener>();

export const errorEmitter = {
  emit(event: ErrorEvent): void {
    for (const fn of listeners) {
      try {
        fn(event);
      } catch {
        /* listener errors must not break callers */
      }
    }
  },
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};
```

- [ ] **Step 2: TypeScript compiles**

```bash
cd rawaq-mobile && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd rawaq-mobile && git add lib/error-emitter.ts
git commit -m "feat(mobile): add error event emitter for toast surface"
```

---

## Task 13: Add mobile error locale keys

**Files:**

- Modify: `rawaq-mobile/contexts/locale-context.tsx`

- [ ] **Step 1: Add EN keys**

Open the file. Find the `en: { ... }` block. Insert (anywhere inside, ideally near a logical group end):

```typescript
    'errors.transient.title':    'Something went wrong',
    'errors.transient.body':"We couldn't reach the server. Please try again in a moment.",
    'errors.timeout.title': 'Taking longer than usual',
    'errors.timeout.body':  "Your connection seems slow. We'll wait - you can retry when ready.",
    'errors.offline.title': "You're offline",
    'errors.offline.body':  'Check your connection and try again.',
    'errors.rate_limited.title': 'Slow down a moment',
    'errors.rate_limited.body':  "You've done that a lot in a short time. Try again in {seconds}s.",
    'errors.rate_limited.body_no_seconds': "You've done that a lot in a short time. Please wait a moment.",
    'errors.action.retry':  'Try again',
    'errors.action.dismiss':'Dismiss',
```

- [ ] **Step 2: Add AR keys**

In the `ar: { ... }` block:

```typescript
    'errors.transient.title':    'حدث خطأ ما',
    'errors.transient.body':'تعذّر الوصول إلى الخادم. حاول مرة أخرى بعد لحظات.',
    'errors.timeout.title': 'يستغرق وقتًا أطول من المعتاد',
    'errors.timeout.body':  'يبدو اتصالك بطيئًا. خذ وقتك وأعد المحاولة عندما تكون مستعدًا.',
    'errors.offline.title': 'أنت غير متصل بالإنترنت',
    'errors.offline.body':  'تحقق من اتصالك ثم حاول مرة أخرى.',
    'errors.rate_limited.title': 'تمهّل قليلاً',
    'errors.rate_limited.body':  'لقد قمت بهذا كثيرًا خلال وقت قصير. حاول بعد {seconds} ثانية.',
    'errors.rate_limited.body_no_seconds': 'لقد قمت بهذا كثيرًا خلال وقت قصير. يُرجى الانتظار لحظة.',
    'errors.action.retry':  'حاول مرة أخرى',
    'errors.action.dismiss':'إخفاء',
```

- [ ] **Step 3: TypeScript compiles**

```bash
cd rawaq-mobile && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd rawaq-mobile && git add contexts/locale-context.tsx
git commit -m "feat(mobile): add errors.* locale keys (EN+AR) for friendly error toasts"
```

---

## Task 14: Create mobile ErrorToast component

**Files:**

- Create: `rawaq-mobile/components/feedback/ErrorToast.tsx`

- [ ] **Step 1: Write the component**

```tsx
import { useEffect, useState, useRef, useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Animated,
  Easing,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocale } from "@/contexts/locale-context";
import { errorEmitter, type ErrorEvent } from "@/lib/error-emitter";
import type { ClassifiedError } from "@/lib/error-classifier";

type ToastItem = {
  id: number;
  classified: ClassifiedError;
  retry?: () => void;
  dismissAfterMs: number;
  anim: Animated.Value;
};

const MAX_TOASTS = 3;
const TAB_BAR_OFFSET = 80; // approximate; adjust if your tab bar is taller
let nextId = 1;

function dismissDelayFor(c: ClassifiedError): number {
  if (c.kind === "rate_limited") {
    const sec = c.retryAfterSec ?? 6;
    return Math.min(Math.max(sec, 6), 10) * 1000;
  }
  return 6000;
}

function titleKey(c: ClassifiedError): string {
  switch (c.kind) {
    case "rate_limited":
      return "errors.rate_limited.title";
    case "timeout":
      return "errors.timeout.title";
    case "offline":
      return "errors.offline.title";
    default:
      return "errors.transient.title";
  }
}

function bodyKeyAndVars(c: ClassifiedError): { key: string; seconds?: number } {
  switch (c.kind) {
    case "rate_limited":
      return c.retryAfterSec != null
        ? { key: "errors.rate_limited.body", seconds: c.retryAfterSec }
        : { key: "errors.rate_limited.body_no_seconds" };
    case "timeout":
      return { key: "errors.timeout.body" };
    case "offline":
      return { key: "errors.offline.body" };
    default:
      return { key: "errors.transient.body" };
  }
}

export function ErrorToastHost() {
  const { t, isRTL } = useLocale();
  const insets = useSafeAreaInsets();
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(
    new Map(),
  );

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => {
      const target = prev.find((t) => t.id === id);
      if (target) {
        Animated.timing(target.anim, {
          toValue: 0,
          duration: 200,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }).start();
      }
      return prev.filter((t) => t.id !== id);
    });
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  useEffect(() => {
    const unsub = errorEmitter.subscribe((event: ErrorEvent) => {
      const id = nextId++;
      const dismissAfterMs = dismissDelayFor(event.classified);
      const anim = new Animated.Value(0);
      setToasts((prev) => {
        const next = [
          ...prev,
          {
            id,
            classified: event.classified,
            retry: event.retry,
            dismissAfterMs,
            anim,
          },
        ];
        return next.length > MAX_TOASTS
          ? next.slice(next.length - MAX_TOASTS)
          : next;
      });
      Animated.timing(anim, {
        toValue: 1,
        duration: 300,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
      const timer = setTimeout(() => dismiss(id), dismissAfterMs);
      timersRef.current.set(id, timer);
    });
    return unsub;
  }, [dismiss]);

  useEffect(
    () => () => {
      timersRef.current.forEach((t) => clearTimeout(t));
      timersRef.current.clear();
    },
    [],
  );

  if (toasts.length === 0) return null;

  return (
    <View
      pointerEvents="box-none"
      style={[styles.host, { bottom: insets.bottom + TAB_BAR_OFFSET }]}
    >
      {toasts.map((toast) => {
        const body = bodyKeyAndVars(toast.classified);
        let bodyText = t(body.key);
        if (body.seconds != null)
          bodyText = bodyText.replace("{seconds}", String(body.seconds));
        return (
          <Animated.View
            key={toast.id}
            style={[
              styles.toast,
              isRTL ? styles.toastRTL : styles.toastLTR,
              {
                opacity: toast.anim,
                transform: [
                  {
                    translateY: toast.anim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [20, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            <View style={styles.body}>
              <Text style={styles.title}>{t(titleKey(toast.classified))}</Text>
              <Text style={styles.message}>{bodyText}</Text>
              {toast.retry && (
                <Pressable
                  onPress={() => {
                    toast.retry?.();
                    dismiss(toast.id);
                  }}
                  style={styles.retryBtn}
                  accessibilityRole="button"
                >
                  <Text style={styles.retryText}>
                    {t("errors.action.retry")}
                  </Text>
                </Pressable>
              )}
            </View>
            <Pressable
              onPress={() => dismiss(toast.id)}
              accessibilityLabel={t("errors.action.dismiss")}
              accessibilityRole="button"
              style={styles.closeBtn}
            >
              <Text style={styles.closeText}>×</Text>
            </Pressable>
          </Animated.View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: "absolute",
    left: 12,
    right: 12,
    gap: 8,
  },
  toast: {
    flexDirection: "row",
    backgroundColor: "#1a1410",
    borderRadius: 8,
    padding: 12,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
    alignItems: "flex-start",
  },
  toastLTR: { borderLeftColor: "#d8a23a", borderLeftWidth: 4 },
  toastRTL: { borderRightColor: "#d8a23a", borderRightWidth: 4 },
  body: { flex: 1, minWidth: 0 },
  title: { color: "#fafaf7", fontWeight: "700", fontSize: 14, marginBottom: 2 },
  message: { color: "#fafaf7", opacity: 0.85, fontSize: 13, lineHeight: 18 },
  retryBtn: {
    marginTop: 8,
    alignSelf: "flex-start",
    borderColor: "#d8a23a",
    borderWidth: 1,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 6,
  },
  retryText: { color: "#d8a23a", fontSize: 12, fontWeight: "600" },
  closeBtn: { paddingHorizontal: 6, paddingTop: 0 },
  closeText: { color: "#fafaf7", fontSize: 22, opacity: 0.6, lineHeight: 22 },
});
```

- [ ] **Step 2: TypeScript compiles**

```bash
cd rawaq-mobile && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd rawaq-mobile && git add components/feedback/ErrorToast.tsx
git commit -m "feat(mobile): add ErrorToastHost component for transient errors"
```

---

## Task 15: Mount mobile toast in root layout

**Files:**

- Modify: `rawaq-mobile/app/_layout.tsx`

- [ ] **Step 1: Add the import**

Near the other component imports (after `AnimatedSplash` import at line 18), add:

```typescript
import { ErrorToastHost } from "@/components/feedback/ErrorToast";
```

- [ ] **Step 2: Mount inside the locale provider tree**

In `RootLayout`, wrap the existing `<AppNavigator>` block. Replace this section:

```tsx
<SafeAreaProvider>
  <LocaleProvider>
    <AuthProvider>
      <NotificationProvider>
        <NavigationLoaderProvider>
          <AuthGate>
            <AppNavigator
              splashDone={splashDone}
              onSplashDone={() => setSplashDone(true)}
            />
          </AuthGate>
        </NavigationLoaderProvider>
      </NotificationProvider>
    </AuthProvider>
  </LocaleProvider>
</SafeAreaProvider>
```

with:

```tsx
<SafeAreaProvider>
  <LocaleProvider>
    <AuthProvider>
      <NotificationProvider>
        <NavigationLoaderProvider>
          <AuthGate>
            <AppNavigator
              splashDone={splashDone}
              onSplashDone={() => setSplashDone(true)}
            />
          </AuthGate>
        </NavigationLoaderProvider>
      </NotificationProvider>
    </AuthProvider>
    <ErrorToastHost />
  </LocaleProvider>
</SafeAreaProvider>
```

The host sits as a sibling of `AuthProvider` so it's outside the auth gate but inside locale/safe-area providers.

- [ ] **Step 3: TypeScript compiles**

```bash
cd rawaq-mobile && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Smoke test — app still launches**

```bash
cd rawaq-mobile && npx expo start
```

Open the app on simulator or device. Expected: app boots normally, no Metro errors, all screens render. Toast visual verification happens in Task 16 Step 7 once the fetcher emits real errors.

- [ ] **Step 5: Commit**

```bash
cd rawaq-mobile && git add app/_layout.tsx
git commit -m "feat(mobile): mount ErrorToastHost at root layout"
```

---

## Task 16: Integrate classifier + retry + timeout + emitter into mobile fetcher

**Files:**

- Modify: `rawaq-mobile/lib/api.ts`

- [ ] **Step 1: Add imports and constants**

At the top of `rawaq-mobile/lib/api.ts`, after the existing imports, add:

```typescript
import {
  classifyResponse,
  classifyThrown,
  type ClassifiedError,
} from "./error-classifier";
import { errorEmitter } from "./error-emitter";

const DEFAULT_TIMEOUT_MS = 15_000;
const TRANSIENT_RETRY_DELAY_MS = 1_500;
```

- [ ] **Step 2: Replace `rateLimitMessage` and add helpers**

**Delete** the existing `rateLimitMessage` function (the spec retires the old per-fetcher 429 string).

Add after `parseJsonSafe`:

```typescript
async function fetchWithTimeout(
  input: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<{ res: Response | null; thrown: unknown; timedOut: boolean }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  let timedOut = false;
  controller.signal.addEventListener("abort", () => {
    timedOut = true;
  });

  try {
    const res = await fetch(input, { ...init, signal: controller.signal });
    return { res, thrown: null, timedOut: false };
  } catch (err) {
    return { res: null, thrown: err, timedOut };
  } finally {
    clearTimeout(timeoutId);
  }
}

function emitToast(
  classified: ClassifiedError,
  retry?: () => void,
  silent?: boolean,
) {
  if (silent) return;
  if (
    classified.kind === "auth" ||
    classified.kind === "client" ||
    classified.kind === "unknown"
  )
    return;
  errorEmitter.emit({ classified, retry });
}
```

- [ ] **Step 3: Extend `ApiGetOptions`**

Replace:

```typescript
type ApiGetOptions = {
  ttlMs?: number;
  force?: boolean;
  skipCache?: boolean;
};
```

with:

```typescript
type ApiGetOptions = {
  ttlMs?: number;
  force?: boolean;
  skipCache?: boolean;
  retry?: boolean;
  silent?: boolean;
  timeoutMs?: number;
};

type MutationOptions = {
  silent?: boolean;
  timeoutMs?: number;
};
```

- [ ] **Step 4: Rewrite `apiGet`**

Replace the body of `apiGet` (the inner `request` IIFE) with:

```typescript
const request = (async (): Promise<ApiResult<T>> => {
  const allowRetry = options.retry !== false;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const init: RequestInit = {
    headers: {
      ...(session?.access_token
        ? { Authorization: `Bearer ${session.access_token}` }
        : {}),
    },
  };

  let attempt = await fetchWithTimeout(`${API_URL}${path}`, init, timeoutMs);
  let classified: ClassifiedError | null = null;

  if (attempt.res) classified = classifyResponse(attempt.res);
  else
    classified = classifyThrown(attempt.thrown, {
      isOnline: true,
      timedOut: attempt.timedOut,
    });

  if (allowRetry && classified?.kind === "transient") {
    await new Promise((r) => setTimeout(r, TRANSIENT_RETRY_DELAY_MS));
    attempt = await fetchWithTimeout(`${API_URL}${path}`, init, timeoutMs);
    if (attempt.res) classified = classifyResponse(attempt.res);
    else
      classified = classifyThrown(attempt.thrown, {
        isOnline: true,
        timedOut: attempt.timedOut,
      });
  }

  if (attempt.res && attempt.res.ok) {
    const json = await parseJsonSafe(attempt.res);
    const data = (json.data as T | undefined) ?? null;
    if (!skipCache) {
      const entry = { updatedAt: now, data };
      getCache.set(cacheKey, entry);
      await setPersistentCached(cacheKey, entry);
    }
    return { data, error: null };
  }

  if (attempt.res) {
    const json = await parseJsonSafe(attempt.res);
    if (
      classified &&
      (classified.kind === "auth" ||
        classified.kind === "client" ||
        classified.kind === "unknown")
    ) {
      return {
        data: null,
        error:
          (json.error as string | undefined) ??
          `Request failed (${attempt.res.status})`,
      };
    }
    if (classified)
      emitToast(
        classified,
        () => {
          void apiGet<T>(path, options);
        },
        options.silent,
      );
    return { data: null, error: null };
  }

  if (classified)
    emitToast(
      classified,
      () => {
        void apiGet<T>(path, options);
      },
      options.silent,
    );
  return { data: null, error: null };
})();
```

- [ ] **Step 5: Rewrite `apiPost / apiPatch / apiDelete`**

Replace each helper. Example for `apiPost`:

```typescript
export async function apiPost<T = unknown>(
  path: string,
  body: Record<string, unknown>,
  options: MutationOptions = {},
): Promise<ApiResult<T>> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const attempt = await fetchWithTimeout(
    `${API_URL}${path}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(session?.access_token
          ? { Authorization: `Bearer ${session.access_token}` }
          : {}),
      },
      body: JSON.stringify(body),
    },
    timeoutMs,
  );

  let classified: ClassifiedError | null = null;
  if (attempt.res) classified = classifyResponse(attempt.res);
  else
    classified = classifyThrown(attempt.thrown, {
      isOnline: true,
      timedOut: attempt.timedOut,
    });

  if (attempt.res && attempt.res.ok) {
    const json = await parseJsonSafe(attempt.res);
    apiInvalidateAll();
    return { data: (json.data as T | undefined) ?? null, error: null };
  }

  if (attempt.res) {
    const json = await parseJsonSafe(attempt.res);
    if (
      classified &&
      (classified.kind === "auth" ||
        classified.kind === "client" ||
        classified.kind === "unknown")
    ) {
      return {
        data: null,
        error:
          (json.error as string | undefined) ??
          `Request failed (${attempt.res.status})`,
      };
    }
    if (classified) emitToast(classified, undefined, options.silent); // mutations: no retry button
    return { data: null, error: null };
  }

  if (classified) emitToast(classified, undefined, options.silent);
  return { data: null, error: null };
}
```

Apply the **same shape** to `apiPatch` (change `method: 'POST'` → `'PATCH'`) and `apiDelete` (change to `'DELETE'`, remove body argument and `Content-Type`):

```typescript
export async function apiPatch<T = unknown>(
  path: string,
  body: Record<string, unknown>,
  options: MutationOptions = {},
): Promise<ApiResult<T>> {
  // identical to apiPost but with method: 'PATCH'
}

export async function apiDelete<T = unknown>(
  path: string,
  options: MutationOptions = {},
): Promise<ApiResult<T>> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const attempt = await fetchWithTimeout(
    `${API_URL}${path}`,
    {
      method: "DELETE",
      headers: {
        ...(session?.access_token
          ? { Authorization: `Bearer ${session.access_token}` }
          : {}),
      },
    },
    timeoutMs,
  );

  let classified: ClassifiedError | null = null;
  if (attempt.res) classified = classifyResponse(attempt.res);
  else
    classified = classifyThrown(attempt.thrown, {
      isOnline: true,
      timedOut: attempt.timedOut,
    });

  if (attempt.res && attempt.res.ok) {
    const json = await parseJsonSafe(attempt.res);
    apiInvalidateAll();
    return { data: json.data as T, error: null };
  }

  if (attempt.res) {
    const json = await parseJsonSafe(attempt.res);
    if (
      classified &&
      (classified.kind === "auth" ||
        classified.kind === "client" ||
        classified.kind === "unknown")
    ) {
      return {
        data: null,
        error:
          (json.error as string | undefined) ??
          `Request failed (${attempt.res.status})`,
      };
    }
    if (classified) emitToast(classified, undefined, options.silent);
    return { data: null, error: null };
  }

  if (classified) emitToast(classified, undefined, options.silent);
  return { data: null, error: null };
}
```

- [ ] **Step 6: TypeScript compiles**

```bash
cd rawaq-mobile && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 7: Smoke test on device/simulator**

```bash
cd rawaq-mobile && npx expo start
```

- Stop the API dev server. Open any tab that fetches data. Expect toast "Something went wrong" with Try-again button after a ~1.5s pause.
- Restart API. Tap Try again. Expect data to load.
- Stop the API and tap any action button (e.g., comment, RSVP). Expect toast with no retry button (mutation).
- Toggle airplane mode mid-action. Expect "You're offline" toast.

- [ ] **Step 8: Commit**

```bash
cd rawaq-mobile && git add lib/api.ts
git commit -m "feat(mobile): integrate error classifier, retry, timeout, and toast emitter into apiGet/Post/Patch/Delete"
```

---

## Task 17: Audit mobile inline-error displays for fallout

**Files:**

- (Audit only — modifications limited to call-sites that depend on inline `error` for transient cases)

The mobile fetcher previously returned `{ data: null, error: 'Request failed (504)' }` on transient/network failures. Now it returns `{ data: null, error: null }` for those categories (toast handles them) and only populates `error` for `auth`/`client` cases. Some call-sites may render `error` inline as the only feedback path; those screens will appear silent on transient errors.

- [ ] **Step 1: Find call-sites rendering `result.error` inline**

```bash
cd rawaq-mobile
```

Use Grep to find call-sites:

```
Grep pattern: \.error[^A-Za-z_]
Path: rawaq-mobile/app
```

For each match, read the surrounding code. If the code displays the error string in a `<Text>` and ONLY in that path (no toast, no other feedback), note it.

- [ ] **Step 2: Decide per-screen**

For each affected screen:

- **Server validation errors (4xx with messages)** still flow through `result.error`. The inline display continues to work for those — leave it.
- **Pure transient errors (no inline text + toast handles it)** is fine — no change needed.
- **If the screen had a "loading failed, retry" inline state** that depended on transient-bucket errors, replace it with the toast retry path. The inline UI can show a generic "Couldn't load — pull to refresh" copy or remove the inline branch entirely.

This is a targeted audit, not a sweeping change. Most screens will need no edit.

- [ ] **Step 3: Commit any audit changes**

```bash
cd rawaq-mobile && git add <changed files>
git commit -m "fix(mobile): adjust inline error displays after fetcher behavior change"
```

If no changes are needed, skip the commit and move to Task 18.

---

## Task 18: End-to-end smoke tests (manual, both clients)

- [ ] **Step 1: Web — Rate limit (429)**

```bash
cd rawaq-web && npm run dev
```

Sign in. Open DevTools console. Run a loop hitting a rate-limited endpoint (e.g., chat send) 12 times via the network panel or direct fetch. After 10, expect a toast titled "Slow down a moment" with retry-after seconds visible.

- [ ] **Step 2: Web — Transient 5xx**

Stop the dev server mid-action (refresh a data-loading page). Expect 1.5s pause then "Something went wrong" toast with Try-again button.

- [ ] **Step 3: Web — Timeout**

In DevTools → Network, throttle to "Slow 3G" or set a custom delay > 15s on a specific endpoint. Expect "Taking longer than usual" after 15s.

- [ ] **Step 4: Web — Offline**

DevTools → Network → Offline. Click any action button. Expect "You're offline" toast immediately, no fetch attempted.

- [ ] **Step 5: Web — Auth 401**

Manually expire your session token (DevTools → Application → Cookies, delete supabase auth cookie). Hit a protected endpoint. Expect existing redirect/sign-out behavior — **no toast.**

- [ ] **Step 6: Web — Client 4xx**

Trigger a known 4xx (e.g., book a fully-booked event). Expect inline server message — **no toast.**

- [ ] **Step 7: Web — RTL**

Toggle to Arabic. Repeat steps 1–4. Confirm:

- Toast border appears on the right edge (not left).
- Body text is in Arabic.
- `{seconds}` interpolates correctly in `errors.rate_limited.body`.

- [ ] **Step 8: Mobile — repeat steps 1–7 in the device/simulator**

Use the same scenarios. Airplane mode replaces "DevTools Offline." For 504 simulation, point `EXPO_PUBLIC_API_URL` at a non-existent port to force timeouts/throws.

- [ ] **Step 9: Confirm no regressions**

For each client:

- Sign in still works (auth not toasted).
- Form-validation inline errors (e.g., wrong password) still render inline.
- Successful actions still complete normally.

- [ ] **Step 10: Final type-check**

```bash
cd rawaq-web && npx tsc --noEmit
cd ../rawaq-mobile && npx tsc --noEmit
```

Expected: no errors in either.

- [ ] **Step 11: Final commit (if any audit fixes were made)**

```bash
git status
# if anything is uncommitted from smoke tests, commit it
```

---

## Reference: Behavior Matrix

| Scenario                       | Classification | Toast? | Retry button?  | Auto retry?          |
| ------------------------------ | -------------- | ------ | -------------- | -------------------- |
| GET → 504                      | `transient`    | yes    | yes            | yes (1×)             |
| POST → 504                     | `transient`    | yes    | no             | no                   |
| Any → 429                      | `rate_limited` | yes    | no             | no                   |
| Any → fetch threw, online      | `transient`    | yes    | yes (GET only) | yes (GET only)       |
| Any → fetch threw, offline     | `offline`      | yes    | no             | no                   |
| Any → AbortController fired    | `timeout`      | yes    | yes (GET only) | no                   |
| Any → 401/403                  | `auth`         | **no** | n/a            | no                   |
| Any → 4xx with server message  | `client`       | **no** | n/a            | no                   |
| Background `silent: true` call | any            | **no** | n/a            | yes if GET+transient |
