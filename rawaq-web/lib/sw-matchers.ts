/// <reference lib="webworker" />

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

  if (url.origin !== self.location.origin) return 'network-only'

  // Sentry tunnel: always pass through.
  if (url.pathname === '/monitoring' || url.pathname.startsWith('/monitoring/')) {
    return 'network-only'
  }

  if (STATIC_PATH_RE.test(url.pathname)) return 'static'

  if (isPublicSwrPath(url.pathname)) {
    if (hasSupabaseAuthCookie(req.headers.get('cookie'))) return 'network-only'
    return 'swr-public'
  }

  if (url.pathname.startsWith('/api/')) return 'network-only'

  const accept = req.headers.get('accept') ?? ''
  if (req.mode === 'navigate' || accept.includes('text/html')) return 'pages'

  return 'static'
}

export const USER_CACHES_PREFIX = ['rawaq-api-public-', 'rawaq-pages-'] as const
