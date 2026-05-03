import { NextRequest, NextResponse } from 'next/server'

// Block private/loopback ranges to prevent SSRF
const BLOCKED_HOSTNAMES = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1|0\.0\.0\.0)/

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get('url')

  if (!raw) {
    return new NextResponse('Missing url', { status: 400 })
  }

  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    return new NextResponse('Invalid url', { status: 400 })
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return new NextResponse('Forbidden protocol', { status: 403 })
  }

  if (BLOCKED_HOSTNAMES.test(parsed.hostname)) {
    return new NextResponse('Forbidden host', { status: 403 })
  }

  let upstream: Response
  try {
    upstream = await fetch(raw, {
      headers: { Accept: 'image/*,*/*;q=0.8' },
      // Don't follow redirects to private IPs
      redirect: 'follow',
    })
  } catch {
    return new NextResponse('Failed to fetch image', { status: 502 })
  }

  if (!upstream.ok) {
    return new NextResponse('Upstream error', { status: upstream.status })
  }

  const contentType = upstream.headers.get('content-type') ?? 'image/jpeg'
  if (!contentType.startsWith('image/')) {
    return new NextResponse('Not an image', { status: 415 })
  }

  const body = await upstream.arrayBuffer()

  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
    },
  })
}
