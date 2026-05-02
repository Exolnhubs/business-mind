import { NextRequest } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireAuth, extractBearerToken } from '@/lib/auth'
import { handleApiError, ok, ForbiddenException, UnauthorizedException } from '@/lib/errors'

// ── Per-bucket config ─────────────────────────────────────────────────────────
const BUCKET_CONFIG = {
  avatar: {
    bucket:           'avatars',
    maxBytes:         5 * 1024 * 1024,
    allowedTypes:     ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
    fileSizeLimit:    5 * 1024 * 1024,
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
    ratePerMin:       5,
    ratePerHour:      15,
  },
  'event-cover': {
    bucket:           'event-covers',
    maxBytes:         50 * 1024 * 1024,
    allowedTypes:     ['image/jpeg', 'image/png', 'image/webp', 'image/gif',
                       'video/mp4', 'video/quicktime', 'video/webm'],
    fileSizeLimit:    52428800,
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif',
                       'video/mp4', 'video/quicktime', 'video/webm'],
    ratePerMin:       3,
    ratePerHour:      10,
  },
  'comment-media': {
    bucket:           'comment-media',
    maxBytes:         10 * 1024 * 1024,
    allowedTypes:     ['image/jpeg', 'image/png', 'image/webp', 'image/gif',
                       'video/mp4', 'video/quicktime', 'video/webm'],
    fileSizeLimit:    10485760,
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif',
                       'video/mp4', 'video/quicktime', 'video/webm'],
    ratePerMin:       5,
    ratePerHour:      20,
  },
} as const

type UploadType = keyof typeof BUCKET_CONFIG

async function ensureBucket(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  cfg: typeof BUCKET_CONFIG[UploadType],
) {
  const { error } = await admin.storage.createBucket(cfg.bucket, {
    public:           true,
    fileSizeLimit:    cfg.fileSizeLimit,
    allowedMimeTypes: [...cfg.allowedMimeTypes],
  })
  if (error && !error.message.includes('already exists') && !error.message.includes('23505')) {
    throw error
  }
}

const EXT_MAP: Record<string, string> = {
  'image/jpeg':      'jpg',
  'image/png':       'png',
  'image/webp':      'webp',
  'image/gif':       'gif',
  'video/mp4':       'mp4',
  'video/quicktime': 'mov',
  'video/webm':      'webm',
}

// POST /api/upload
// Body: FormData — file (File), type (avatar | event-cover | comment-media)
// Auth: session cookie (web) OR Authorization: Bearer <token> (mobile)
export async function POST(req: NextRequest) {
  try {
    const admin = createSupabaseAdminClient()

    // ── Resolve user — cookie auth (web) or Bearer token (mobile) ─────────────
    let userId: string

    const bearerToken = extractBearerToken(req)
    if (bearerToken) {
      const { data: { user }, error } = await admin.auth.getUser(bearerToken)
      if (error || !user) throw new UnauthorizedException()
      const { data: profile } = await admin
        .from('profiles')
        .select('is_banned')
        .eq('id', user.id)
        .single()
      if (!profile) throw new UnauthorizedException()
      if (profile.is_banned) throw new ForbiddenException('Your account has been suspended')
      userId = user.id
    } else {
      const ctx = await requireAuth()
      userId = ctx.userId
    }

    const formData = await req.formData()
    const file     = formData.get('file') as File | null
    const type     = formData.get('type') as string | null

    if (!file) throw new ForbiddenException('No file provided')
    if (!type || !(type in BUCKET_CONFIG)) {
      throw new ForbiddenException('Invalid upload type')
    }

    const cfg = BUCKET_CONFIG[type as UploadType]

    // ── Validate MIME type ────────────────────────────────────────────────────
    if (!cfg.allowedTypes.includes(file.type as never)) {
      throw new ForbiddenException(
        `File type ${file.type} not allowed for ${type}. Allowed: ${cfg.allowedTypes.join(', ')}`
      )
    }

    // ── Validate file size ────────────────────────────────────────────────────
    if (file.size > cfg.maxBytes) {
      const mb = (cfg.maxBytes / 1024 / 1024).toFixed(0)
      throw new ForbiddenException(`File too large. Maximum size for ${type} is ${mb} MB`)
    }

    // ── Rate limiting via media_uploads (admin client reads, bypasses RLS) ────
    const now        = new Date()
    const oneMinAgo  = new Date(now.getTime() - 60_000).toISOString()
    const oneHourAgo = new Date(now.getTime() - 3_600_000).toISOString()

    const [{ count: perMin }, { count: perHour }] = await Promise.all([
      admin.from('media_uploads').select('*', { count: 'exact', head: true })
        .eq('user_id', userId).eq('bucket', cfg.bucket).gte('created_at', oneMinAgo),
      admin.from('media_uploads').select('*', { count: 'exact', head: true })
        .eq('user_id', userId).eq('bucket', cfg.bucket).gte('created_at', oneHourAgo),
    ])

    if ((perMin ?? 0) >= cfg.ratePerMin) {
      throw new ForbiddenException('Too many uploads. Please wait before uploading again.')
    }
    if ((perHour ?? 0) >= cfg.ratePerHour) {
      throw new ForbiddenException('Hourly upload limit reached. Try again later.')
    }

    // ── Upload to Supabase Storage via admin client (bypasses RLS) ────────────
    const ext    = EXT_MAP[file.type] ?? 'bin'
    const path   = `${userId}/${Date.now()}.${ext}`
    const buffer = Buffer.from(await file.arrayBuffer())

    await ensureBucket(admin, cfg)

    const { error: uploadErr } = await admin.storage
      .from(cfg.bucket)
      .upload(path, buffer, { contentType: file.type, upsert: false })

    if (uploadErr) throw uploadErr

    const { data: { publicUrl } } = admin.storage.from(cfg.bucket).getPublicUrl(path)

    // ── Track for rate limiting ────────────────────────────────────────────────
    await admin.from('media_uploads').insert({
      user_id:    userId,
      bucket:     cfg.bucket,
      path,
      size_bytes: file.size,
      mime_type:  file.type,
    } as never)

    return ok({ url: publicUrl, path, bucket: cfg.bucket, mime_type: file.type })
  } catch (err) {
    return handleApiError(err)
  }
}
