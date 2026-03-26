import { supabase } from './supabase'

export type UploadType = 'avatar' | 'event-cover' | 'comment-media'

const MIME_MAP: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
}

/**
 * Upload a local file URI to the server via /api/upload.
 * Uses Bearer token so the server-side admin client handles the upload,
 * bypassing Storage RLS entirely.
 *
 * Requires EXPO_PUBLIC_API_URL to be set (e.g. https://your-app.vercel.app
 * or http://192.168.x.x:3000 for local dev).
 */
export async function uploadViaApi(uri: string, type: UploadType): Promise<string> {
  const apiUrl = process.env.EXPO_PUBLIC_API_URL
  if (!apiUrl) throw new Error('EXPO_PUBLIC_API_URL is not set in your .env file')

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Not authenticated')

  const ext = (uri.split('.').pop() ?? 'jpg').toLowerCase()
  const mimeType = MIME_MAP[ext] ?? 'image/jpeg'

  // React Native FormData uses { uri, type, name } objects — do NOT set
  // Content-Type manually; fetch auto-sets multipart/form-data with boundary.
  const formData = new FormData()
  formData.append('file', { uri, type: mimeType, name: `upload.${ext}` } as unknown as Blob)
  formData.append('type', type)

  const res = await fetch(`${apiUrl}/api/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${session.access_token}` },
    body: formData,
  })

  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json?.error ?? `Upload failed (${res.status})`)

  return json.data.url as string
}
