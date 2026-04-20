import { NextRequest } from 'next/server'
import { Redis } from '@upstash/redis'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireAuth } from '@/lib/auth'
import { handleApiError, ok, BadRequestException, RateLimitException } from '@/lib/errors'
import { sendNotification } from '@/lib/notifications'

const redis = Redis.fromEnv()

// POST /api/users/:id/say-hi — rate limited to 1 per viewer per target per 24h
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: targetId } = await params
    const ctx = await requireAuth()

    if (ctx.userId === targetId) throw new BadRequestException('Cannot say hi to yourself')

    const key = `say-hi:${ctx.userId}:${targetId}`
    const already = await redis.exists(key)
    if (already) throw new RateLimitException(86400)

    await redis.setex(key, 86400, '1')

    const admin = createSupabaseAdminClient()
    const { data: actor } = await admin.from('profiles').select('display_name').eq('id', ctx.userId).single()

    await sendNotification({
      userId:  targetId,
      type:    'say_hi',
      payload: { actor_id: ctx.userId, actor_name: actor?.display_name ?? 'Someone' },
    })

    return ok({ sent: true })
  } catch (err) {
    return handleApiError(err)
  }
}
