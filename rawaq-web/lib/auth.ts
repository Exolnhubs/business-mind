import { NextRequest } from 'next/server'
import { headers } from 'next/headers'
import { createSupabaseServerClient } from './supabase/server'
import { createClient } from '@supabase/supabase-js'
import { UnauthorizedException, ForbiddenException } from './errors'
import type { AuthContext } from '@/types/api'
import type { UserRole, Database } from '@/types/database'

// Resolve the authenticated user from the current request context.
// Supports both cookie-based (web) and Bearer token (mobile) auth.
// Throws UnauthorizedException if not signed in.
export async function requireAuth(): Promise<AuthContext> {
  const headerStore = await headers()
  const authorization = headerStore.get('authorization')
  const bearerToken = authorization?.startsWith('Bearer ') ? authorization.slice(7) : null

  let user: { id: string } | null = null

  if (bearerToken) {
    // Mobile clients send a Bearer token — validate it directly
    const supabase = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${bearerToken}` } } }
    )
    const { data, error } = await supabase.auth.getUser(bearerToken)
    if (error || !data.user) throw new UnauthorizedException()
    user = data.user
  } else {
    // Web clients use cookie-based sessions
    const supabase = await createSupabaseServerClient()
    const { data, error } = await supabase.auth.getUser()
    if (error || !data.user) throw new UnauthorizedException()
    user = data.user
  }

  const supabase = await createSupabaseServerClient()
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, is_banned')
    .eq('id', user.id)
    .single()

  if (!profile) throw new UnauthorizedException()
  if (profile.is_banned) throw new ForbiddenException('Your account has been suspended')

  return { userId: user.id, role: profile.role as UserRole }
}

// Require a specific role (or one of several roles)
export async function requireRole(...roles: UserRole[]): Promise<AuthContext> {
  const ctx = await requireAuth()
  if (!roles.includes(ctx.role)) {
    throw new ForbiddenException(`Requires role: ${roles.join(' or ')}`)
  }
  return ctx
}

export async function requireAdmin(): Promise<AuthContext> {
  return requireRole('admin')
}

export async function requireOrganizer(): Promise<AuthContext> {
  return requireRole('organizer', 'admin')
}

// Try to get auth context — returns null if unauthenticated (for public endpoints)
export async function optionalAuth(): Promise<AuthContext | null> {
  try {
    return await requireAuth()
  } catch {
    return null
  }
}

// Verify that the organizer owns the given event
export async function requireEventOwnership(eventId: string, ctx: AuthContext): Promise<void> {
  if (ctx.role === 'admin') return // admins bypass ownership check

  const supabase = await createSupabaseServerClient()
  const { data } = await supabase
    .from('events')
    .select('organizer_id')
    .eq('id', eventId)
    .single()

  if (!data || data.organizer_id !== ctx.userId) {
    throw new ForbiddenException('You do not own this event')
  }
}

// Extract Bearer token from request (for mobile clients)
export function extractBearerToken(req: NextRequest): string | null {
  const auth = req.headers.get('authorization')
  if (!auth?.startsWith('Bearer ')) return null
  return auth.slice(7)
}
