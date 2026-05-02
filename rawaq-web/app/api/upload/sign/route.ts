import { NextRequest } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireAuth, extractBearerToken } from '@/lib/auth'
import { handleApiError, ok, ForbiddenException, UnauthorizedException, BadRequestException } from '@/lib/errors'

// Mirrors the bucket config in /api/upload/route.ts
const BUCKET_CONFIG = {
  avatar: {
    bucket:      'avatars',
    maxBytes:    5 * 1024 * 1024,
    ratePerMin:  5,
    ratePerHour: 15,
  },
  'event-cover': {
    bucket:      'event-covers',
    maxBytes:    50 * 1024 * 1024,
    ratePerMin:  3,
    ratePerHour: 10,
  },
  'comment-media': {
    bucket:      'comment-media',
    maxBytes:    10 * 1024 * 1024,
    ratePerMin:  5,
    ratePerHour: 20,
  },
} as const

type UploadType = keyof typeof BUCKET_CONFIG

const EXT_MAP: Record<string, string> = {
  'image/jpeg':      'jpg',
  'image/png':       'png',
  'image/webp':      'webp',
  'image/gif':       'gif',
  'video/mp4':       'mp4',
  'video/quicktime': 'mov',
  'video/webm':      'webm',
}

const ALLOWED_MIME: Record<UploadType, string[]> = {
  avatar:         ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
  'event-cover':  ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/quicktime', 'video/webm'],
  'comment-media':['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/quicktime', 'video/webm'],
}

// POST /api/upload/sign
// Issues a Supabase signed upload URL so the mobile client can upload
// directly to Supabase Storage, bypassing Vercel's 4.5 MB body limit.
// Body: { type, mimeType, fileSize? }
// Auth: Bearer token (mobile) or session cookie (web)
export async function POST(req: NextRequest) {
  try {
    const admin = createSupabaseAdminClient()

    let userId: string
    const bearerToken = extractBearerToken(req)
    if (bearerToken) {
      const { data: { user }, error } = await admin.auth.getUser(bearerToken)
      if (error || !user) throw new UnauthorizedException()
      const { data: profile } = await admin.from('profiles').select('is_banned').eq('id', user.id).single()
      if (!profile) throw new UnauthorizedException()
      if (profile.is_banned) throw new ForbiddenException('Your account has been suspended')
      userId = user.id
    } else {
      const ctx = await requireAuth()
      userId = ctx.userId
    }

    const body = await req.json()
    const { type, mimeType, fileSize } = body as { type?: string; mimeType?: string; fileSize?: number }

    if (!type || !(type in BUCKET_CONFIG)) throw new BadRequestException('Invalid upload type')
    if (!mimeType) throw new BadRequestException('mimeType is required')

    const cfg = BUCKET_CONFIG[type as UploadType]

    if (!ALLOWED_MIME[type as UploadType].includes(mimeType)) {
      throw new ForbiddenException(`File type ${mimeType} not allowed for ${type}`)
    }

    if (fileSize && fileSize > cfg.maxBytes) {
      const mb = (cfg.maxBytes / 1024 / 1024).toFixed(0)
      throw new ForbiddenException(`File too large. Max ${mb} MB for ${type}`)
    }

    // Rate limiting
    const now        = new Date()
    const oneMinAgo  = new Date(now.getTime() - 60_000).toISOString()
    const oneHourAgo = new Date(now.getTime() - 3_600_000).toISOString()

    const [{ count: perMin }, { count: perHour }] = await Promise.all([
      admin.from('media_uploads').select('*', { count: 'exact', head: true })
        .eq('user_id', userId).eq('bucket', cfg.bucket).gte('created_at', oneMinAgo),
      admin.from('media_uploads').select('*', { count: 'exact', head: true })
        .eq('user_id', userId).eq('bucket', cfg.bucket).gte('created_at', oneHourAgo),
    ])
    if ((perMin  ?? 0) >= cfg.ratePerMin)  throw new ForbiddenException('Too many uploads. Please wait.')
    if ((perHour ?? 0) >= cfg.ratePerHour) throw new ForbiddenException('Hourly upload limit reached.')

    const ext  = EXT_MAP[mimeType] ?? 'bin'
    const path = `${userId}/${Date.now()}.${ext}`

    // Ensure bucket exists (public)
    const { error: bucketErr } = await admin.storage.createBucket(cfg.bucket, {
      public:        true,
      fileSizeLimit: cfg.maxBytes,
    })
    if (bucketErr && !bucketErr.message.includes('already exists') && !bucketErr.message.includes('23505')) {
      throw bucketErr
    }

    const { data: signData, error: signErr } = await admin.storage
      .from(cfg.bucket)
      .createSignedUploadUrl(path)

    if (signErr || !signData) throw signErr ?? new Error('Failed to create signed URL')

    const { data: { publicUrl } } = admin.storage.from(cfg.bucket).getPublicUrl(path)

    // Track for rate limiting
    await admin.from('media_uploads').insert({
      user_id:    userId,
      bucket:     cfg.bucket,
      path,
      size_bytes: fileSize ?? 0,
      mime_type:  mimeType,
    } as never)

    return ok({ signedUrl: signData.signedUrl, publicUrl, path, bucket: cfg.bucket })
  } catch (err) {
    return handleApiError(err)
  }
}
