import { supabase } from './supabase'
import AsyncStorage from '@react-native-async-storage/async-storage'

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000'
const DEFAULT_API_GET_TTL_MS = 30_000
const PERSISTENT_CACHE_PREFIX = 'api_cache:'
const MAX_PERSISTENT_CACHE_SIZE = 50 // entries

type ApiResult<T> = { data: T | null; error: string | null }
type ApiGetOptions = {
  ttlMs?: number
  force?: boolean
  skipCache?: boolean
}

type CachedGetEntry = {
  updatedAt: number
  data: unknown
}

const getCache = new Map<string, CachedGetEntry>()
const inflightGets = new Map<string, Promise<ApiResult<unknown>>>()

// ── Persistent Cache Functions ────────────────────────────────────
async function getPersistentCached(key: string): Promise<CachedGetEntry | null> {
  try {
    const json = await AsyncStorage.getItem(PERSISTENT_CACHE_PREFIX + key)
    if (!json) return null
    return JSON.parse(json) as CachedGetEntry
  } catch { return null }
}

async function setPersistentCached(key: string, entry: CachedGetEntry): Promise<void> {
  try {
    // First, check cache size and evict oldest if needed
    const keys = await AsyncStorage.getAllKeys()
      .then((allKeys) => allKeys.filter((k) => k.startsWith(PERSISTENT_CACHE_PREFIX)))
    
    if (keys.length >= MAX_PERSISTENT_CACHE_SIZE) {
      // Get all cache entries, find oldest, remove it
      const entries = await AsyncStorage.multiGet(keys)
      let oldestKey = keys[0]
      let oldestTime = Number.MAX_SAFE_INTEGER
      
      for (const [k, v] of entries) {
        try {
          const parsed = JSON.parse(v ?? '')
          if (parsed.updatedAt < oldestTime) {
            oldestTime = parsed.updatedAt
            oldestKey = k
          }
        } catch { /* skip invalid */ }
      }
      
      await AsyncStorage.removeItem(oldestKey)
    }
    
    await AsyncStorage.setItem(PERSISTENT_CACHE_PREFIX + key, JSON.stringify(entry))
  } catch { /* ignore storage errors */ }
}

async function clearPersistentCache(prefix?: string): Promise<void> {
  try {
    if (!prefix) {
      await AsyncStorage.clear()
      return
    }
    
    const keys = await AsyncStorage.getAllKeys()
    const toRemove = keys.filter((k) => k.startsWith(PERSISTENT_CACHE_PREFIX + prefix))
    await AsyncStorage.multiRemove(toRemove)
  } catch { /* ignore */ }
}

async function parseJsonSafe(res: Response) {
  const text = await res.text().catch(() => '')
  if (!text) return {}
  try {
    return JSON.parse(text) as Record<string, unknown>
  } catch {
    return {}
  }
}

function rateLimitMessage(res: Response): string | null {
  if (res.status !== 429) return null
  const retryAfter = res.headers.get('Retry-After')
  const seconds = retryAfter ? parseInt(retryAfter, 10) : null
  return seconds
    ? `You're doing that too fast. Please wait ${seconds} seconds and try again.`
    : "You're doing that too fast. Please slow down and try again."
}

function buildCacheKey(path: string, userId: string | null | undefined) {
  return `${userId ?? 'anon'}:${path}`
}

export async function apiInvalidate(pathPrefix?: string) {
  getCache.clear()
  inflightGets.clear()
  await clearPersistentCache(pathPrefix)
}

export async function apiInvalidateAll() {
  await apiInvalidate()
}

/**
 * Authenticated GET from the web API.
 */
export async function apiGet<T = unknown>(
  path: string,
  options: ApiGetOptions = {},
): Promise<ApiResult<T>> {
  const { data: { session } } = await supabase.auth.getSession()
  const ttlMs = options.ttlMs ?? DEFAULT_API_GET_TTL_MS
  const skipCache = options.skipCache === true
  const cacheKey = buildCacheKey(path, session?.user?.id)
  const now = Date.now()

  if (!skipCache && !options.force) {
    // Check memory cache first (fastest)
    const cached = getCache.get(cacheKey)
    if (cached && now - cached.updatedAt < ttlMs) {
      return { data: cached.data as T, error: null }
    }

    // Check persistent cache as fallback
    const persistentCached = await getPersistentCached(cacheKey)
    if (persistentCached && now - persistentCached.updatedAt < ttlMs) {
      getCache.set(cacheKey, persistentCached)
      return { data: persistentCached.data as T, error: null }
    }

    const inflight = inflightGets.get(cacheKey)
    if (inflight) {
      return inflight as Promise<ApiResult<T>>
    }
  }

  const request = (async (): Promise<ApiResult<T>> => {
    const res = await fetch(`${API_URL}${path}`, {
      headers: {
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      },
    })
    const json = await parseJsonSafe(res)
    if (!res.ok) {
      return { data: null, error: rateLimitMessage(res) ?? (json.error as string | undefined) ?? `Request failed (${res.status})` }
    }
    const data = (json.data as T | undefined) ?? null
    if (!skipCache) {
      const entry = { updatedAt: now, data }
      getCache.set(cacheKey, entry)
      // Persist to AsyncStorage for app restarts
      await setPersistentCached(cacheKey, entry)
    }
    return { data, error: null }
  })()

  if (!skipCache) {
    inflightGets.set(cacheKey, request as Promise<ApiResult<unknown>>)
  }

  try {
    return await request
  } finally {
    inflightGets.delete(cacheKey)
  }
}

/**
 * Authenticated POST to the web API.
 * Attaches the current session Bearer token automatically.
 */
export async function apiPost<T = unknown>(
  path: string,
  body: Record<string, unknown>,
): Promise<ApiResult<T>> {
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
    body: JSON.stringify(body),
  })
  const json = await parseJsonSafe(res)
  if (!res.ok) return { data: null, error: rateLimitMessage(res) ?? (json.error as string | undefined) ?? `Request failed (${res.status})` }
  apiInvalidateAll()
  return { data: (json.data as T | undefined) ?? null, error: null }
}

/**
 * Authenticated PATCH to the web API.
 */
export async function apiPatch<T = unknown>(
  path: string,
  body: Record<string, unknown>,
): Promise<ApiResult<T>> {
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch(`${API_URL}${path}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
    body: JSON.stringify(body),
  })
  const json = await parseJsonSafe(res)
  if (!res.ok) return { data: null, error: rateLimitMessage(res) ?? (json.error as string | undefined) ?? `Request failed (${res.status})` }
  apiInvalidateAll()
  return { data: (json.data as T | undefined) ?? null, error: null }
}

/**
 * Authenticated DELETE to the web API.
 */
export async function apiDelete<T = unknown>(
  path: string,
): Promise<ApiResult<T>> {
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch(`${API_URL}${path}`, {
    method: 'DELETE',
    headers: {
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
  })
  const json = await parseJsonSafe(res)
  if (!res.ok) return { data: null, error: rateLimitMessage(res) ?? (json.error as string | undefined) ?? `Request failed (${res.status})` }
  apiInvalidateAll()
  return { data: json.data as T, error: null }
}
