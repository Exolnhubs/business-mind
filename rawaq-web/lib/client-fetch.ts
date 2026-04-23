'use client'

const DEFAULT_CLIENT_GET_TTL_MS = 30_000
const PERSISTENT_CACHE_PREFIX = 'p_cache:'
const MAX_PERSISTENT_CACHE_SIZE = 30

type ClientGetOptions = {
  ttlMs?: number
  force?: boolean
  skipCache?: boolean
  scopeKey?: string | null
  signal?: AbortSignal
}

type CachedGetEntry = {
  updatedAt: number
  data: unknown
}

const getCache = new Map<string, CachedGetEntry>()
const inflightGets = new Map<string, Promise<unknown>>()

// ── Persistent Cache Functions (localStorage) ───────────────────────────────
function getPersistentCached(key: string): CachedGetEntry | null {
  try {
    const json = localStorage.getItem(PERSISTENT_CACHE_PREFIX + key)
    if (!json) return null
    return JSON.parse(json) as CachedGetEntry
  } catch { return null }
}

function setPersistentCached(key: string, entry: CachedGetEntry): void {
  try {
    const keys = Object.keys(localStorage).filter((k) => k.startsWith(PERSISTENT_CACHE_PREFIX))
    
    if (keys.length >= MAX_PERSISTENT_CACHE_SIZE) {
      let oldestKey = keys[0]
      let oldestTime = Date.now()
      
      for (const k of keys) {
        const cached = getPersistentCached(k.replace(PERSISTENT_CACHE_PREFIX, ''))
        if (cached && cached.updatedAt < oldestTime) {
          oldestTime = cached.updatedAt
          oldestKey = k
        }
      }
      localStorage.removeItem(oldestKey)
    }
    
    localStorage.setItem(PERSISTENT_CACHE_PREFIX + key, JSON.stringify(entry))
  } catch { /* quota exceeded or other error - ignore */ }
}

function clearPersistentCache(prefix?: string): void {
  try {
    if (!prefix) {
      Object.keys(localStorage)
        .filter((k) => k.startsWith(PERSISTENT_CACHE_PREFIX))
        .forEach((k) => localStorage.removeItem(k))
      return
    }
    
    Object.keys(localStorage)
      .filter((k) => k.startsWith(PERSISTENT_CACHE_PREFIX + prefix))
      .forEach((k) => localStorage.removeItem(k))
  } catch { /* ignore */ }
}

function buildCacheKey(path: string, scopeKey?: string | null) {
  return `${scopeKey ?? 'global'}:${path}`
}

async function parseJsonSafe<T>(res: Response): Promise<T> {
  const text = await res.text().catch(() => '')
  if (!text) return {} as T

  try {
    return JSON.parse(text) as T
  } catch {
    return {} as T
  }
}

export function clientFetchInvalidate(pathPrefix?: string, scopeKey?: string | null) {
  if (!pathPrefix && !scopeKey) {
    getCache.clear()
    inflightGets.clear()
    clearPersistentCache()
    return
  }

  const matchesScope = (key: string) => {
    if (!scopeKey) return true
    return key.startsWith(`${scopeKey}:`)
  }

  const matchesPath = (key: string) => {
    if (!pathPrefix) return true
    const [, cachedPath = ''] = key.split(':', 2)
    return cachedPath.startsWith(pathPrefix)
  }

  for (const key of [...getCache.keys()]) {
    if (matchesScope(key) && matchesPath(key)) {
      getCache.delete(key)
    }
  }

  for (const key of [...inflightGets.keys()]) {
    if (matchesScope(key) && matchesPath(key)) {
      inflightGets.delete(key)
    }
  }

  clearPersistentCache(pathPrefix)
}

export function clientFetchInvalidateAll() {
  clientFetchInvalidate()
}

export async function clientGetJson<T>(
  path: string,
  options: ClientGetOptions = {},
): Promise<T> {
  const ttlMs = options.ttlMs ?? DEFAULT_CLIENT_GET_TTL_MS
  const skipCache = options.skipCache === true
  const cacheKey = buildCacheKey(path, options.scopeKey)
  const now = Date.now()

  if (!skipCache && !options.force) {
    // Check memory cache first (fastest)
    const cached = getCache.get(cacheKey)
    if (cached && now - cached.updatedAt < ttlMs) {
      return cached.data as T
    }

    // Check persistent cache as fallback (survives page refresh)
    const persistentCached = getPersistentCached(cacheKey)
    if (persistentCached && now - persistentCached.updatedAt < ttlMs) {
      getCache.set(cacheKey, persistentCached)
      return persistentCached.data as T
    }

    const inflight = inflightGets.get(cacheKey)
    if (inflight) {
      return inflight as Promise<T>
    }
  }

  const request = (async () => {
    const res = await fetch(path, {
      method: 'GET',
      cache: 'no-store',
      credentials: 'same-origin',
      signal: options.signal,
    })

    if (!res.ok) {
      const errJson = await parseJsonSafe<{ error?: string }>(res)
      if (res.status === 429) {
        const retryAfter = res.headers.get('Retry-After')
        const seconds = retryAfter ? parseInt(retryAfter, 10) : null
        throw new Error(
          seconds
            ? `Too many requests — please wait ${seconds}s and try again.`
            : 'Too many requests — please slow down and try again.'
        )
      }
      throw new Error(errJson.error ?? `Request failed (${res.status})`)
    }

    const json = await parseJsonSafe<T>(res)
    if (!skipCache) {
      const entry = { updatedAt: Date.now(), data: json }
      getCache.set(cacheKey, entry)
      setPersistentCached(cacheKey, entry)
    }

    return json
  })()

  if (!skipCache) {
    inflightGets.set(cacheKey, request as Promise<unknown>)
  }

  try {
    return await request
  } finally {
    inflightGets.delete(cacheKey)
  }
}
