/**
 * Centralized environment-variable validation.
 *
 * `validateEnv()` is invoked once on cold start (see `instrumentation.ts`) so a
 * misconfigured deployment fails fast and loudly instead of throwing deep inside
 * a request handler. Infrastructure-critical vars (Supabase, app URL, Upstash
 * Redis, internal secrets) are hard-required; feature vars (payments, email, AI,
 * Sentry) are validated at their point of use via `requireEnv` so a single
 * missing optional key never takes the whole app down.
 */

import { z } from 'zod'

// ── Hard-required infrastructure vars ─────────────────────────────────────────
// Missing any of these means the app cannot function at all.
const requiredEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL:      z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY:     z.string().min(1),
  NEXT_PUBLIC_APP_URL:           z.string().url(),
  UPSTASH_REDIS_REST_URL:        z.string().url(),
  UPSTASH_REDIS_REST_TOKEN:      z.string().min(1),
  CRON_SECRET:                   z.string().min(1),
  INTERNAL_TRIGGER_SECRET:       z.string().min(1),
})

export type RequiredEnv = z.infer<typeof requiredEnvSchema>

let cached: RequiredEnv | null = null

/**
 * Parse and validate the hard-required env vars. Throws a single aggregated
 * error listing every missing/invalid var. Result is cached after first call.
 */
export function validateEnv(): RequiredEnv {
  if (cached) return cached

  const parsed = requiredEnvSchema.safeParse(process.env)
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n')
    throw new Error(
      `Environment validation failed. Fix these vars before the app can start:\n${issues}`,
    )
  }

  cached = parsed.data
  return cached
}

/**
 * Read a single required env var by name, throwing a clear error if missing.
 * Use for feature-specific / conditionally-required vars (payment integration
 * IDs, gateway keys) that are not part of the hard-required cold-start schema.
 */
export function requireEnv(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`Missing env var: ${name}`)
  return v
}
