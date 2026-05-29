import { NextRequest, NextResponse } from 'next/server'

// Block loopback, private, link-local, CGNAT, and IPv6 ULA / link-local ranges
// to prevent SSRF (incl. AWS / Azure / GCP metadata endpoints which live on
// 169.254.169.254 in the link-local range).
const BLOCKED_HOSTNAMES =
  /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|0\.0\.0\.0|::1|fc|fd|fe80)/i

const MAX_REDIRECTS = 3
const MAX_BYTES = 10 * 1024 * 1024 // 10 MB cap

function isAllowedUrl(parsed: URL): { ok: true } | { ok: false; reason: string; status: number } {
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return { ok: false, reason: 'Forbidden protocol', status: 403 }
  }
  if (BLOCKED_HOSTNAMES.test(parsed.hostname)) {
    return { ok: false, reason: 'Forbidden host', status: 403 }
  }
  return { ok: true }
}

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get('url')

  if (!raw) {
    return new NextResponse('Missing url', { status: 400 })
  }

  let currentUrl: URL
  try {
    currentUrl = new URL(raw)
  } catch {
    return new NextResponse('Invalid url', { status: 400 })
  }

  const initialCheck = isAllowedUrl(currentUrl)
  if (!initialCheck.ok) {
    return new NextResponse(initialCheck.reason, { status: initialCheck.status })
  }

  // ── Walk the redirect chain manually, re-validating each hop ───────────────
  let upstream: Response | null = null

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    try {
      upstream = await fetch(currentUrl.toString(), {
        headers: { Accept: 'image/*,*/*;q=0.8' },
        redirect: 'manual',
      })
    } catch {
      return new NextResponse('Failed to fetch image', { status: 502 })
    }

    // 3xx with a Location header — re-validate and continue.
    if (upstream.status >= 300 && upstream.status < 400) {
      const location = upstream.headers.get('location')
      if (!location) {
        return new NextResponse('Upstream redirect missing location', { status: 502 })
      }

      let nextUrl: URL
      try {
        nextUrl = new URL(location, currentUrl)
      } catch {
        return new NextResponse('Invalid redirect target', { status: 502 })
      }

      const check = isAllowedUrl(nextUrl)
      if (!check.ok) {
        return new NextResponse('Redirect to forbidden host blocked', { status: 403 })
      }

      currentUrl = nextUrl
      continue
    }

    // 2xx (or any non-redirect, non-error 4xx/5xx) — break out and handle.
    break
  }

  if (!upstream) {
    return new NextResponse('Failed to fetch image', { status: 502 })
  }

  if (upstream.status >= 300 && upstream.status < 400) {
    return new NextResponse('Too many redirects', { status: 508 })
  }

  if (!upstream.ok) {
    return new NextResponse('Upstream error', { status: upstream.status })
  }

  // ── Content-Length cap to prevent memory blowup ─────────────────────────────
  const contentLengthRaw = upstream.headers.get('content-length')
  if (contentLengthRaw) {
    const contentLength = Number(contentLengthRaw)
    if (Number.isFinite(contentLength) && contentLength > MAX_BYTES) {
      return new NextResponse('Image too large', { status: 413 })
    }
  }

  const contentType = upstream.headers.get('content-type') ?? 'image/jpeg'
  if (!contentType.startsWith('image/')) {
    return new NextResponse('Not an image', { status: 415 })
  }

  const body = await upstream.arrayBuffer()
  if (body.byteLength > MAX_BYTES) {
    return new NextResponse('Image too large', { status: 413 })
  }

  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
    },
  })
}
