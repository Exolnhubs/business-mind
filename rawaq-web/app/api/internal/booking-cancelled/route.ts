import { NextRequest } from 'next/server'
import { z } from 'zod'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { sendNotification } from '@/lib/notifications'
import { handleApiError, ok } from '@/lib/errors'

const BodySchema = z.object({
  booking_id: z.string().uuid(),
  user_id:    z.string().uuid(),
  event_id:   z.string().uuid(),
})

// POST /api/internal/booking-cancelled
// Called exclusively by the Supabase pg_net DB trigger — not a public endpoint.
// Protected by x-internal-trigger header matching INTERNAL_TRIGGER_SECRET env var.
export async function POST(req: NextRequest) {
  try {
    const secret = process.env.INTERNAL_TRIGGER_SECRET
    if (!secret || req.headers.get('x-internal-trigger') !== secret) {
      return new Response('Unauthorized', { status: 401 })
    }

    const body = await req.json()
    const { booking_id, user_id, event_id } = BodySchema.parse(body)

    // Fetch event title for the notification payload
    const admin = createSupabaseAdminClient()
    const { data: event } = await admin
      .from('events')
      .select('title')
      .eq('id', event_id)
      .single()

    await sendNotification({
      userId: user_id,
      type: 'booking_cancelled',
      payload: {
        booking_id,
        event_id,
        event_title: event?.title ?? '',
      },
    })

    return ok({ ok: true })
  } catch (err) {
    return handleApiError(err)
  }
}
