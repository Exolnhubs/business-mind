import { redis } from '@/lib/redis'
import type { UserRole } from '@/types/database'

const TTL_SECONDS = 30

export interface CachedProfile {
  role: UserRole
  is_banned: boolean
}

export function profileCacheKey(userId: string): string {
  return `profile:auth:${userId}`
}

function parseCachedProfile(raw: unknown): CachedProfile | null {
  if (!raw) return null
  if (typeof raw === 'string') return JSON.parse(raw) as CachedProfile
  return raw as CachedProfile
}

export async function getCachedProfile(userId: string): Promise<CachedProfile | null> {
  try {
    return parseCachedProfile(await redis.get(profileCacheKey(userId)))
  } catch {
    return null
  }
}

export async function setCachedProfile(userId: string, profile: CachedProfile): Promise<void> {
  try {
    await redis.set(profileCacheKey(userId), JSON.stringify(profile), { ex: TTL_SECONDS })
  } catch {
    // Non-fatal: DB fallback in requireAuth handles Redis outages.
  }
}

export async function delCachedProfile(userId: string): Promise<void> {
  try {
    await redis.del(profileCacheKey(userId))
  } catch {
    // Non-fatal: cache expires quickly via TTL.
  }
}
