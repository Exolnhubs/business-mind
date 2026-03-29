import { supabase } from './supabase'

export type UploadType = 'avatar' | 'event-cover' | 'comment-media'

// Max dimensions for resizing before upload
const MAX_DIMENSIONS: Record<UploadType, number> = {
  'avatar':        400,
  'event-cover':   1920,
  'comment-media': 1280,
}

/**
 * Resize an image URI to fit within the max dimension for the given upload
 * type. Falls back to the original URI if expo-image-manipulator is not
 * available or if the file is not an image.
 */
async function resizeIfNeeded(uri: string, type: UploadType): Promise<string> {
  const ext = (uri.split('.').pop() ?? '').toLowerCase()
  const isVideo = ['mp4', 'mov', 'webm'].includes(ext)
  if (isVideo) return uri

  try {
    const ImageManipulator = require('expo-image-manipulator')
    const manipulate = ImageManipulator.manipulateAsync ?? ImageManipulator.default?.manipulateAsync
    if (!manipulate) return uri

    const maxSize = MAX_DIMENSIONS[type]
    const SaveFormat = ImageManipulator.SaveFormat
    const result = await manipulate(
      uri,
      [{ resize: { width: maxSize } }],
      { compress: 0.85, format: SaveFormat?.JPEG ?? 'jpeg' }
    )
    return result.uri
  } catch {
    return uri
  }
}

const MIME_MAP: Record<string, string> = {
  jpg:  'image/jpeg',
  jpeg: 'image/jpeg',
  png:  'image/png',
  webp: 'image/webp',
  gif:  'image/gif',
  mp4:  'video/mp4',
  mov:  'video/quicktime',
  webm: 'video/webm',
}

/**
 * Upload a local file URI to Supabase Storage via a two-step flow:
 *
 *  1. Call /api/upload/sign (tiny JSON request, no file bytes) to get a
 *     Supabase signed upload URL and the final public URL. This step
 *     handles auth, rate limiting, and returns a signed URL.
 *
 *  2. PUT the file bytes directly to Supabase Storage using the signed
 *     URL. The file never passes through the Next.js / Vercel server,
 *     so there is no 4.5 MB body-size limit.
 *
 * Requires EXPO_PUBLIC_API_URL to be set (e.g. https://your-app.vercel.app).
 */
export async function uploadViaApi(uri: string, type: UploadType): Promise<string> {
  const apiUrl = process.env.EXPO_PUBLIC_API_URL
  if (!apiUrl) throw new Error('EXPO_PUBLIC_API_URL is not set in your .env file')

  // Validate session (also refreshes if expired)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Not authenticated')

  // Resize image before uploading (no-op for videos or if manipulator unavailable)
  const processedUri = await resizeIfNeeded(uri, type)

  const ext      = (processedUri.split('.').pop() ?? 'jpg').toLowerCase()
  const mimeType = MIME_MAP[ext] ?? 'image/jpeg'

  // ── Step 1: get a signed upload URL from the API ──────────────────────────
  const signRes = await fetch(`${apiUrl}/api/upload/sign`, {
    method:  'POST',
    headers: {
      Authorization:  `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ type, mimeType }),
  })

  const signJson = await signRes.json().catch(() => ({}))
  if (!signRes.ok) throw new Error(signJson?.error ?? `Sign request failed (${signRes.status})`)

  const { signedUrl, publicUrl } = signJson.data as { signedUrl: string; publicUrl: string }

  // ── Step 2: upload the file directly to Supabase Storage ──────────────────
  // Fetch the local file URI as a Blob, then PUT it to the signed URL.
  // This request goes directly from the device to Supabase — no Vercel limit.
  const fileResponse = await fetch(processedUri)
  const blob         = await fileResponse.blob()

  const uploadRes = await fetch(signedUrl, {
    method:  'PUT',
    headers: { 'Content-Type': mimeType },
    body:    blob,
  })

  if (!uploadRes.ok) {
    const text = await uploadRes.text().catch(() => '')
    throw new Error(`Storage upload failed (${uploadRes.status})${text ? `: ${text}` : ''}`)
  }

  return publicUrl
}
