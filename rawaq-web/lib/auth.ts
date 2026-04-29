import { NextRequest } from 'next/server'
import { headers } from 'next/headers'
import { createSupabaseServerClient } from './supabase/server'
import { createSupabaseAdminClient } from './supabase/admin'
import { getCachedProfile, setCachedProfile } from './supabase/profile-cache'
import { UnauthorizedException, ForbiddenException } from './errors'
import type { AuthContext } from '@/types/api'
import type { UserRole } from '@/types/database'

export async function requireAuth(): Promise<AuthContext> {
  const headerStore = await headers()
  const authorization = headerStore.get('authorization')
  const bearerToken = authorization?.startsWith('Bearer ') ? authorization.slice(7) : null

  const admin = createSupabaseAdminClient()
  let userId: string

  if (bearerToken) {
    const { data, error } = await admin.auth.getUser(bearerToken)
    if (error || !data.user) throw new UnauthorizedException()
    userId = data.user.id
  } else {
    const supabase = await createSupabaseServerClient()
    const { data, error } = await supabase.auth.getUser()
    if (error || !data.user) throw new UnauthorizedException()
    userId = data.user.id
  }

  const cached = await getCachedProfile(userId)
  if (cached) {
    if (cached.is_banned) throw new ForbiddenException('Your account has been suspended')
    return { userId, role: cached.role }
  }

  const { data: profile } = await admin
    .from('profiles')
    .select('role, is_banned')
    .eq('id', userId)
    .single()

  if (!profile) throw new UnauthorizedException()
  if (profile.is_banned) throw new ForbiddenException('Your account has been suspended')

  await setCachedProfile(userId, { role: profile.role as UserRole, is_banned: profile.is_banned })

  return { userId, role: profile.role as UserRole }
}

export async function requireRole(...roles: UserRole[]): Promise<AuthContext> {
  const ctx = await requireAuth()
  if (!roles.includes(ctx.role)) {
    throw new ForbiddenException(`Requires role: ${roles.join(' or ')}`)
  }
  return ctx
}

// Owner-only: the highest privilege level
export async function requireOwner(): Promise<AuthContext> {
  return requireRole('owner')
}

// Admin OR owner (owners can do everything admins can)
export async function requireAdmin(): Promise<AuthContext> {
  return requireRole('admin', 'owner')
}

// Organizer OR admin OR owner
export async function requireOrganizer(): Promise<AuthContext> {
  return requireRole('organizer', 'admin', 'owner')
}

export async function optionalAuth(): Promise<AuthContext | null> {
  try {
    return await requireAuth()
  } catch {
    return null
  }
}

export async function requireEventOwnership(eventId: string, ctx: AuthContext): Promise<void> {
  // Admins and owners bypass ownership check
  if (ctx.role === 'admin' || ctx.role === 'owner') return

  const admin = createSupabaseAdminClient()
  const { data } = await admin
    .from('events')
    .select('organizer_id')
    .eq('id', eventId)
    .single()

  if (!data || data.organizer_id !== ctx.userId) {
    throw new ForbiddenException('You do not own this event')
  }
}

export function extractBearerToken(req: NextRequest): string | null {
  const auth = req.headers.get('authorization')
  if (!auth?.startsWith('Bearer ')) return null
  return auth.slice(7)
}
