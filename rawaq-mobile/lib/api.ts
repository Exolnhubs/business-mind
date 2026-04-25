import AsyncStorage from '@react-native-async-storage/async-storage'
import { classifyResponse, classifyThrown, type ClassifiedError } from './error-classifier'
import { errorEmitter } from './error-emitter'
import { supabase } from './supabase'

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000'
const DEFAULT_API_GET_TTL_MS = 30_000
const PERSISTENT_CACHE_PREFIX = 'api_cache:'
const MAX_PERSISTENT_CACHE_SIZE = 50
const DEFAULT_TIMEOUT_MS = 15_000
const TRANSIENT_RETRY_DELAY_MS = 1_500

type ApiResult<T> = { data: T | null; error: string | null }

type ApiGetOptions = {
  ttlMs?: number
  force?: boolean
  skipCache?: boolean
  retry?: boolean
  silent?: boolean
  timeoutMs?: number
}

type MutationOptions = {
  silent?: boolean
  timeoutMs?: number
}

type CachedGetEntry = {
  updatedAt: number
  data: unknown
}

const getCache = new Map<string, CachedGetEntry>()
const inflightGets = new Map<string, Promise<ApiResult<unknown>>>()

async function getPersistentCached(key: string): Promise<CachedGetEntry | null> {
  try {
    const json = await AsyncStorage.getItem(PERSISTENT_CACHE_PREFIX + key)
    if (!json) return null
    return JSON.parse(json) as CachedGetEntry
  } catch {
    return null
  }
}

async function setPersistentCached(key: string, entry: CachedGetEntry): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys()
      .then((allKeys) => allKeys.filter((k) => k.startsWith(PERSISTENT_CACHE_PREFIX)))

    if (keys.length >= MAX_PERSISTENT_CACHE_SIZE) {
      const entries = await AsyncStorage.multiGet(keys)
      let oldestKey = keys[0]
      let oldestTime = Number.MAX_SAFE_INTEGER

      for (const [storedKey, value] of entries) {
        try {
          const parsed = JSON.parse(value ?? '')
          if (parsed.updatedAt < oldestTime) {
            oldestTime = parsed.updatedAt
            oldestKey = storedKey
          }
        } catch {
          // Ignore malformed cache records.
        }
      }

      await AsyncStorage.removeItem(oldestKey)
    }

    await AsyncStorage.setItem(PERSISTENT_CACHE_PREFIX + key, JSON.stringify(entry))
  } catch {
    // Ignore storage errors.
  }
}

async function clearPersistentCache(prefix?: string): Promise<void> {
  try {
    const allKeys = await AsyncStorage.getAllKeys()
    const toRemove = allKeys.filter((key) =>
      key.startsWith(prefix ? PERSISTENT_CACHE_PREFIX + prefix : PERSISTENT_CACHE_PREFIX),
    )
    if (toRemove.length > 0) await AsyncStorage.multiRemove(toRemove)
  } catch {
    // Ignore storage errors.
  }
}

async function parseJsonSafe(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text().catch(() => '')
  if (!text) return {}

  try {
    return JSON.parse(text) as Record<string, unknown>
  } catch {
    return {}
  }
}

async function fetchWithTimeout(
  input: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<{ res: Response | null; thrown: unknown; timedOut: boolean }> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
  let timedOut = false

  controller.signal.addEventListener('abort', () => {
    timedOut = true
  })

  try {
    const res = await fetch(input, { ...init, signal: controller.signal })
    return { res, thrown: null, timedOut: false }
  } catch (err) {
    return { res: null, thrown: err, timedOut }
  } finally {
    clearTimeout(timeoutId)
  }
}

function inferIsOnline(): boolean {
  if (typeof navigator !== 'undefined' && 'onLine' in navigator) {
    return navigator.onLine !== false
  }
  return true
}

function emitToast(classified: ClassifiedError, retry?: () => void, silent?: boolean) {
  if (silent) return
  if (classified.kind === 'auth' || classified.kind === 'client' || classified.kind === 'unknown') return
  errorEmitter.emit({ classified, retry })
}

function buildCacheKey(path: string, userId: string | null | undefined) {
  return `${userId ?? 'anon'}:${path}`
}

export async function apiInvalidate(pathPrefix?: string) {
  if (!pathPrefix) {
    getCache.clear()
    inflightGets.clear()
  } else {
    for (const key of [...getCache.keys()]) {
      const [, cachedPath = ''] = key.split(':', 2)
      if (cachedPath.startsWith(pathPrefix)) getCache.delete(key)
    }

    for (const key of [...inflightGets.keys()]) {
      const [, cachedPath = ''] = key.split(':', 2)
      if (cachedPath.startsWith(pathPrefix)) inflightGets.delete(key)
    }
  }

  await clearPersistentCache(pathPrefix)
}

export async function apiInvalidateAll() {
  await apiInvalidate()
}

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
    const allowRetry = options.retry !== false
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS

    const init: RequestInit = {
      headers: {
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      },
    }

    let attempt = await fetchWithTimeout(`${API_URL}${path}`, init, timeoutMs)
    let classified: ClassifiedError | null = null

    if (attempt.res) classified = classifyResponse(attempt.res)
    else classified = classifyThrown(attempt.thrown, { isOnline: inferIsOnline(), timedOut: attempt.timedOut })

    if (allowRetry && classified?.kind === 'transient') {
      await new Promise((resolve) => setTimeout(resolve, TRANSIENT_RETRY_DELAY_MS))
      attempt = await fetchWithTimeout(`${API_URL}${path}`, init, timeoutMs)
      if (attempt.res) classified = classifyResponse(attempt.res)
      else classified = classifyThrown(attempt.thrown, { isOnline: inferIsOnline(), timedOut: attempt.timedOut })
    }

    if (attempt.res && attempt.res.ok) {
      const json = await parseJsonSafe(attempt.res)
      const data = (json.data as T | undefined) ?? null

      if (!skipCache) {
        const entry = { updatedAt: now, data }
        getCache.set(cacheKey, entry)
        await setPersistentCached(cacheKey, entry)
      }

      return { data, error: null }
    }

    if (attempt.res) {
      const json = await parseJsonSafe(attempt.res)
      if (classified && (classified.kind === 'auth' || classified.kind === 'client' || classified.kind === 'unknown')) {
        return { data: null, error: (json.error as string | undefined) ?? `Request failed (${attempt.res.status})` }
      }

      if (classified) {
        emitToast(classified, () => { void apiGet<T>(path, options) }, options.silent)
      }
      return { data: null, error: null }
    }

    if (classified) {
      emitToast(classified, () => { void apiGet<T>(path, options) }, options.silent)
    }
    return { data: null, error: null }
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

export async function apiPost<T = unknown>(
  path: string,
  body: Record<string, unknown>,
  options: MutationOptions = {},
): Promise<ApiResult<T>> {
  const { data: { session } } = await supabase.auth.getSession()
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS

  const attempt = await fetchWithTimeout(`${API_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
    body: JSON.stringify(body),
  }, timeoutMs)

  let classified: ClassifiedError | null = null
  if (attempt.res) classified = classifyResponse(attempt.res)
  else classified = classifyThrown(attempt.thrown, { isOnline: inferIsOnline(), timedOut: attempt.timedOut })

  if (attempt.res && attempt.res.ok) {
    const json = await parseJsonSafe(attempt.res)
    await apiInvalidateAll()
    return { data: (json.data as T | undefined) ?? null, error: null }
  }

  if (attempt.res) {
    const json = await parseJsonSafe(attempt.res)
    if (classified && (classified.kind === 'auth' || classified.kind === 'client' || classified.kind === 'unknown')) {
      return { data: null, error: (json.error as string | undefined) ?? `Request failed (${attempt.res.status})` }
    }

    if (classified) emitToast(classified, undefined, options.silent)
    return { data: null, error: null }
  }

  if (classified) emitToast(classified, undefined, options.silent)
  return { data: null, error: null }
}

export async function apiPatch<T = unknown>(
  path: string,
  body: Record<string, unknown>,
  options: MutationOptions = {},
): Promise<ApiResult<T>> {
  const { data: { session } } = await supabase.auth.getSession()
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS

  const attempt = await fetchWithTimeout(`${API_URL}${path}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
    body: JSON.stringify(body),
  }, timeoutMs)

  let classified: ClassifiedError | null = null
  if (attempt.res) classified = classifyResponse(attempt.res)
  else classified = classifyThrown(attempt.thrown, { isOnline: inferIsOnline(), timedOut: attempt.timedOut })

  if (attempt.res && attempt.res.ok) {
    const json = await parseJsonSafe(attempt.res)
    await apiInvalidateAll()
    return { data: (json.data as T | undefined) ?? null, error: null }
  }

  if (attempt.res) {
    const json = await parseJsonSafe(attempt.res)
    if (classified && (classified.kind === 'auth' || classified.kind === 'client' || classified.kind === 'unknown')) {
      return { data: null, error: (json.error as string | undefined) ?? `Request failed (${attempt.res.status})` }
    }

    if (classified) emitToast(classified, undefined, options.silent)
    return { data: null, error: null }
  }

  if (classified) emitToast(classified, undefined, options.silent)
  return { data: null, error: null }
}

export async function apiDelete<T = unknown>(
  path: string,
  options: MutationOptions = {},
): Promise<ApiResult<T>> {
  const { data: { session } } = await supabase.auth.getSession()
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS

  const attempt = await fetchWithTimeout(`${API_URL}${path}`, {
    method: 'DELETE',
    headers: {
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
  }, timeoutMs)

  let classified: ClassifiedError | null = null
  if (attempt.res) classified = classifyResponse(attempt.res)
  else classified = classifyThrown(attempt.thrown, { isOnline: inferIsOnline(), timedOut: attempt.timedOut })

  if (attempt.res && attempt.res.ok) {
    const json = await parseJsonSafe(attempt.res)
    await apiInvalidateAll()
    return { data: (json.data as T | undefined) ?? null, error: null }
  }

  if (attempt.res) {
    const json = await parseJsonSafe(attempt.res)
    if (classified && (classified.kind === 'auth' || classified.kind === 'client' || classified.kind === 'unknown')) {
      return { data: null, error: (json.error as string | undefined) ?? `Request failed (${attempt.res.status})` }
    }

    if (classified) emitToast(classified, undefined, options.silent)
    return { data: null, error: null }
  }

  if (classified) emitToast(classified, undefined, options.silent)
  return { data: null, error: null }
}
