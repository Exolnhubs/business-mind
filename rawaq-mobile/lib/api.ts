import { supabase } from './supabase'

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000'

async function parseJsonSafe(res: Response) {
  const text = await res.text().catch(() => '')
  if (!text) return {}
  try {
    return JSON.parse(text) as Record<string, unknown>
  } catch {
    return {}
  }
}

/**
 * Authenticated GET from the web API.
 */
export async function apiGet<T = unknown>(
  path: string,
): Promise<{ data: T | null; error: string | null }> {
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch(`${API_URL}${path}`, {
    headers: {
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) return { data: null, error: json.error ?? `Request failed (${res.status})` }
  return { data: json.data as T, error: null }
}

/**
 * Authenticated POST to the web API.
 * Attaches the current session Bearer token automatically.
 */
export async function apiPost<T = unknown>(
  path: string,
  body: Record<string, unknown>,
): Promise<{ data: T | null; error: string | null }> {
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
  return { data: (json.data as T | undefined) ?? null, error: null }
}

/**
 * Authenticated PATCH to the web API.
 */
export async function apiPatch<T = unknown>(
  path: string,
  body: Record<string, unknown>,
): Promise<{ data: T | null; error: string | null }> {
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
  return { data: (json.data as T | undefined) ?? null, error: null }
}

/**
 * Authenticated DELETE to the web API.
 */
export async function apiDelete<T = unknown>(
  path: string,
): Promise<{ data: T | null; error: string | null }> {
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch(`${API_URL}${path}`, {
    method: 'DELETE',
    headers: {
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) return { data: null, error: json.error ?? `Request failed (${res.status})` }
  return { data: json.data as T, error: null }
}
