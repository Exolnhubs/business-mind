'use client'

import {
  IMAGE_MAX_BYTES,
  VIDEO_MAX_BYTES,
  VIDEO_MAX_SECONDS,
} from '@/lib/validations/blog'

export type BlogUploadKind = 'image' | 'video'

export type BlogUploadError =
  | 'image_too_large'
  | 'video_too_large'
  | 'video_too_long'
  | 'upload_failed'

export class BlogUploadException extends Error {
  code: BlogUploadError
  constructor(code: BlogUploadError) {
    super(code)
    this.code = code
    this.name = 'BlogUploadException'
  }
}

/** Read a video file's duration (seconds) via a temporary <video> element. */
function readVideoDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url)
      resolve(video.duration)
    }
    video.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new BlogUploadException('upload_failed'))
    }
    video.src = url
  })
}

/**
 * Enforce client-side caps BEFORE uploading:
 *  - images must be <= IMAGE_MAX_BYTES
 *  - videos must be <= VIDEO_MAX_BYTES and <= VIDEO_MAX_SECONDS long
 * Throws BlogUploadException with a code the caller maps to an i18n message.
 */
export async function validateBlogMedia(file: File, kind: BlogUploadKind): Promise<void> {
  if (kind === 'image') {
    if (file.size > IMAGE_MAX_BYTES) throw new BlogUploadException('image_too_large')
    return
  }
  // video
  if (file.size > VIDEO_MAX_BYTES) throw new BlogUploadException('video_too_large')
  const duration = await readVideoDuration(file)
  if (Number.isFinite(duration) && duration > VIDEO_MAX_SECONDS) {
    throw new BlogUploadException('video_too_long')
  }
}

type SignResponse = { data: { signedUrl: string; publicUrl: string } }

/**
 * Two-step signed upload (mirrors rawaq-mobile/lib/upload.ts):
 *  1. POST /api/upload/sign (tiny JSON, cookie-authenticated for web) to get a
 *     Supabase signed upload URL + the final public URL.
 *  2. PUT the file bytes directly to the signed URL — bytes never pass through
 *     the Next.js/Vercel server, so the 4.5 MB body limit does not apply.
 *
 * Caps are validated first; on any failure a BlogUploadException is thrown.
 * Returns the public URL of the uploaded file.
 */
export async function uploadBlogMedia(file: File, kind: BlogUploadKind): Promise<string> {
  await validateBlogMedia(file, kind)

  // Step 1 — sign
  const signRes = await fetch('/api/upload/sign', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'blog-media', mimeType: file.type, fileSize: file.size }),
  })
  if (!signRes.ok) throw new BlogUploadException('upload_failed')
  const signJson = (await signRes.json().catch(() => null)) as SignResponse | null
  const signedUrl = signJson?.data?.signedUrl
  const publicUrl = signJson?.data?.publicUrl
  if (!signedUrl || !publicUrl) throw new BlogUploadException('upload_failed')

  // Step 2 — upload bytes directly to Supabase Storage
  const uploadRes = await fetch(signedUrl, {
    method: 'PUT',
    headers: { 'Content-Type': file.type },
    body: file,
  })
  if (!uploadRes.ok) throw new BlogUploadException('upload_failed')

  return publicUrl
}
