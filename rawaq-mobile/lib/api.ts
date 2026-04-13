import { supabase } from './supabase'

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000'
const DEFAULT_API_GET_TTL_MS = 30_000

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

async function parseJsonSafe(res: Response) {
  const text = await res.text().catch(() => '')
  if (!text) return {}
  try {
    return JSON.parse(text) as Record<string, unknown>
  } catch {
    return {}
  }
}

function buildCacheKey(path: string, userId: string | null | undefined) {
  return `${userId ?? 'anon'}:${path}`
}

export function apiInvalidate(pathPrefix?: string) {
  if (!pathPrefix) {
    getCache.clear()
    inflightGets.clear()
    return
  }

  for (const key of [...getCache.keys()]) {
    const [, cachedPath = ''] = key.split(':', 2)
    if (cachedPath.startsWith(pathPrefix)) {
      getCache.delete(key)
    }
  }

  for (const key of [...inflightGets.keys()]) {
    const [, cachedPath = ''] = key.split(':', 2)
    if (cachedPath.startsWith(pathPrefix)) {
      inflightGets.delete(key)
    }
  }
}

export function apiInvalidateAll() {
  apiInvalidate()
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
    const cached = getCache.get(cacheKey)
    if (cached && now - cached.updatedAt < ttlMs) {
      return { data: cached.data as T, error: null }
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
      return { data: null, error: (json.error as string | undefined) ?? `Request failed (${res.status})` }
    }
    const data = (json.data as T | undefined) ?? null
    if (!skipCache) {
      getCache.set(cacheKey, { updatedAt: now, data })
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
  if (!res.ok) return { data: null, error: (json.error as string | undefined) ?? `Request failed (${res.status})` }
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
  if (!res.ok) return { data: null, error: (json.error as string | undefined) ?? `Request failed (${res.status})` }
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
  if (!res.ok) return { data: null, error: (json.error as string | undefined) ?? `Request failed (${res.status})` }
  apiInvalidateAll()
  return { data: json.data as T, error: null }
}
