import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { limiters } from '@/lib/rate-limit'

export async function middleware(request: NextRequest) {
  const isApiRoute = request.nextUrl.pathname.startsWith('/api/')

  // ── Global IP rate limit (300 req/min) — API routes only ─────────────────
  if (isApiRoute) {
    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      'anonymous'

    try {
      const { success, reset } = await limiters.globalIp.limit(ip)
      if (!success) {
        return NextResponse.json(
          { error: 'Too many requests. Please try again later.', code: 'RATE_LIMITED' },
          {
            status: 429,
            headers: { 'Retry-After': String(Math.ceil((reset - Date.now()) / 1000)) },
          },
        )
      }
    } catch (err) {
      // Upstash unavailable — fail open so API routes still work
      console.error('[middleware] rate limiter unavailable:', err)
    }

    // Skip session refresh for API routes — they authenticate independently
    return NextResponse.next({ request })
  }

  // ── Supabase session refresh — page routes only (keeps cookies fresh) ─────
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options as Parameters<typeof supabaseResponse.cookies.set>[2])
          )
        },
      },
    }
  )

  // Refresh session — required for page routes only
  await supabase.auth.getUser()

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
