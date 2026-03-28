import { supabase } from './supabase'

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000'

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
  const json = await res.json()
  if (!res.ok) return { data: null, error: json.error ?? `Request failed (${res.status})` }
  return { data: json.data as T, error: null }
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
  const json = await res.json()
  if (!res.ok) return { data: null, error: json.error ?? `Request failed (${res.status})` }
  return { data: json.data as T, error: null }
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
