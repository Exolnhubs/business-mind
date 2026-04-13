'use client'

const DEFAULT_CLIENT_GET_TTL_MS = 30_000

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
    const cached = getCache.get(cacheKey)
    if (cached && now - cached.updatedAt < ttlMs) {
      return cached.data as T
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
      throw new Error(`Request failed (${res.status})`)
    }

    const json = await parseJsonSafe<T>(res)
    if (!skipCache) {
      getCache.set(cacheKey, { updatedAt: Date.now(), data: json })
    }

    return json
  })()

  if (!skipCache) {
    inflightGets.set(cacheKey, request)
  }

  try {
    return await request
  } finally {
    inflightGets.delete(cacheKey)
  }
}
