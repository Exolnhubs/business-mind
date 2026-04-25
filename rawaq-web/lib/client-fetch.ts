'use client'

import { classifyResponse, classifyThrown, type ClassifiedError } from './error-classifier'
import { errorEmitter } from './error-emitter'

const DEFAULT_CLIENT_GET_TTL_MS = 30_000
const PERSISTENT_CACHE_PREFIX = 'p_cache:'
const MAX_PERSISTENT_CACHE_SIZE = 30

type ClientGetOptions = {
  ttlMs?: number
  force?: boolean
  skipCache?: boolean
  scopeKey?: string | null
  signal?: AbortSignal
  retry?: boolean         // default true
  silent?: boolean        // default false; true skips toast emission
  timeoutMs?: number      // default 15_000
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

const DEFAULT_TIMEOUT_MS = 15_000
const TRANSIENT_RETRY_DELAY_MS = 1_500

async function fetchWithTimeout(
  input: RequestInfo,
  init: RequestInit,
  timeoutMs: number,
  externalSignal: AbortSignal | undefined,
): Promise<{ res: Response | null; thrown: unknown; timedOut: boolean }> {
  const controller = new AbortController()
  let timedOut = false
  const timeoutId = setTimeout(() => {
    if (!externalSignal?.aborted) timedOut = true
    controller.abort()
  }, timeoutMs)

  let externalAbortHandler: (() => void) | null = null
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort()
    else {
      externalAbortHandler = () => controller.abort()
      externalSignal.addEventListener('abort', externalAbortHandler)
    }
  }

  try {
    const res = await fetch(input, { ...init, signal: controller.signal })
    return { res, thrown: null, timedOut: false }
  } catch (err) {
    return { res: null, thrown: err, timedOut }
  } finally {
    clearTimeout(timeoutId)
    if (externalSignal && externalAbortHandler) {
      externalSignal.removeEventListener('abort', externalAbortHandler)
    }
  }
}

function isOnline(): boolean {
  return typeof navigator === 'undefined' ? true : navigator.onLine !== false
}

function emitToast(classified: ClassifiedError, retry?: () => void, silent?: boolean) {
  if (silent) return
  if (classified.kind === 'auth' || classified.kind === 'client' || classified.kind === 'unknown') return
  errorEmitter.emit({ classified, retry })
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

  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const allowRetry = options.retry !== false

  const request = (async () => {
    if (!isOnline()) {
      const classified: ClassifiedError = { kind: 'offline' }
      emitToast(classified, () => { void clientGetJson<T>(path, options) }, options.silent)
      throw new Error('offline')
    }

    const init: RequestInit = {
      method: 'GET',
      cache: 'no-store',
      credentials: 'same-origin',
    }

    let attempt = await fetchWithTimeout(path, init, timeoutMs, options.signal)
    let classified: ClassifiedError | null = null

    if (attempt.res) {
      classified = classifyResponse(attempt.res)
    } else {
      classified = classifyThrown(attempt.thrown, { isOnline: isOnline(), timedOut: attempt.timedOut })
    }

    if (allowRetry && classified?.kind === 'transient') {
      await new Promise(r => setTimeout(r, TRANSIENT_RETRY_DELAY_MS))
      attempt = await fetchWithTimeout(path, init, timeoutMs, options.signal)
      if (attempt.res) {
        classified = classifyResponse(attempt.res)
      } else {
        classified = classifyThrown(attempt.thrown, { isOnline: isOnline(), timedOut: attempt.timedOut })
      }
    }

    if (attempt.res && attempt.res.ok) {
      const json = await parseJsonSafe<T>(attempt.res)
      if (!skipCache) {
        const entry = { updatedAt: Date.now(), data: json }
        getCache.set(cacheKey, entry)
        setPersistentCached(cacheKey, entry)
      }
      return json
    }

    if (attempt.res && classified) {
      const errJson = await parseJsonSafe<{ error?: string }>(attempt.res)
      if (classified.kind === 'auth' || classified.kind === 'client' || classified.kind === 'unknown') {
        throw new Error(errJson.error ?? `Request failed (${attempt.res.status})`)
      }
      emitToast(classified, () => { void clientGetJson<T>(path, options) }, options.silent)
      throw new Error(errJson.error ?? `Request failed (${attempt.res.status})`)
    }

    if (classified) {
      emitToast(classified, () => { void clientGetJson<T>(path, options) }, options.silent)
    }
    throw attempt.thrown ?? new Error('Network error')
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

type MutationOptions = {
  signal?: AbortSignal
  silent?: boolean
  timeoutMs?: number
}

async function clientMutation<T>(
  method: 'POST' | 'PATCH' | 'DELETE',
  path: string,
  body: unknown | undefined,
  options: MutationOptions = {},
): Promise<T> {
  if (!isOnline()) {
    const classified: ClassifiedError = { kind: 'offline' }
    emitToast(classified, undefined, options.silent)
    throw new Error('offline')
  }

  const init: RequestInit = {
    method,
    credentials: 'same-origin',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  }

  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const attempt = await fetchWithTimeout(path, init, timeoutMs, options.signal)

  let classified: ClassifiedError | null = null
  if (attempt.res) classified = classifyResponse(attempt.res)
  else classified = classifyThrown(attempt.thrown, { isOnline: isOnline(), timedOut: attempt.timedOut })

  if (attempt.res && attempt.res.ok) {
    clientFetchInvalidateAll()
    return parseJsonSafe<T>(attempt.res)
  }

  if (attempt.res) {
    const errJson = await parseJsonSafe<{ error?: string }>(attempt.res)
    if (classified && classified.kind !== 'auth' && classified.kind !== 'client' && classified.kind !== 'unknown') {
      emitToast(classified, undefined, options.silent)
    }
    throw new Error(errJson.error ?? `Request failed (${attempt.res.status})`)
  }

  if (classified) emitToast(classified, undefined, options.silent)
  throw attempt.thrown ?? new Error('Network error')
}

export function clientPostJson<T = unknown>(path: string, body?: unknown, options?: MutationOptions): Promise<T> {
  return clientMutation<T>('POST', path, body, options)
}

export function clientPatchJson<T = unknown>(path: string, body?: unknown, options?: MutationOptions): Promise<T> {
  return clientMutation<T>('PATCH', path, body, options)
}

export function clientDeleteJson<T = unknown>(path: string, options?: MutationOptions): Promise<T> {
  return clientMutation<T>('DELETE', path, undefined, options)
}
