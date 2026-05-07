import { NextRequest } from 'next/server'
import { ok, handleApiError } from '@/lib/errors'

// Endpoints to warm — these are the most-hit public routes that suffer most
// from cold starts. Fired concurrently so total latency is the slowest one.
const WARM_PATHS = [
  '/api/events/featured',
  '/api/events',
  '/api/categories',
]

export async function GET(req: NextRequest) {
  try {
    const auth = req.headers.get('authorization') ?? ''
    const secret = process.env.CRON_SECRET
    if (!secret || auth !== `Bearer ${secret}`) {
      return new Response('Unauthorized', { status: 401 })
    }

    const base = process.env.NEXT_PUBLIC_APP_URL
    if (!base) return ok({ warmed: [], skipped: 'NEXT_PUBLIC_APP_URL not set' })

    const results = await Promise.allSettled(
      WARM_PATHS.map((path) =>
        fetch(`${base}${path}`, { method: 'GET' }).then((r) => ({
          path,
          status: r.status,
        })),
      ),
    )

    const warmed = results.map((r, i) =>
      r.status === 'fulfilled'
        ? { path: WARM_PATHS[i], status: r.value.status }
        : { path: WARM_PATHS[i], error: String((r as PromiseRejectedResult).reason) },
    )

    return ok({ warmed })
  } catch (err) {
    return handleApiError(err)
  }
}
