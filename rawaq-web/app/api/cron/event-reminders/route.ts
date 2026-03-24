import { NextRequest } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { sendNotifications } from '@/lib/notifications'
import { ok, handleApiError } from '@/lib/errors'

// GET /api/cron/event-reminders
// Called every minute by your cron scheduler (Vercel Cron, cron-job.org, etc.)
// Protected by CRON_SECRET — set this env var and pass it as Bearer token.
//
// Vercel cron config (vercel.json):
// {
//   "crons": [{ "path": "/api/cron/event-reminders", "schedule": "* * * * *" }]
// }
//
// cron-job.org: set URL to https://yourapp.com/api/cron/event-reminders
// with header Authorization: Bearer <CRON_SECRET> — every 1 minute.

export async function GET(req: NextRequest) {
  try {
    // Verify cron secret
    const auth = req.headers.get('authorization') ?? ''
    const secret = process.env.CRON_SECRET
    if (secret && auth !== `Bearer ${secret}`) {
      return new Response('Unauthorized', { status: 401 })
    }

    const supabase = createSupabaseAdminClient()
    const now = new Date()

    // Window: events starting 55–65 minutes from now (10-min window prevents
    // duplicate sends if the job runs slightly late)
    const from = new Date(now.getTime() + 55 * 60 * 1000).toISOString()
    const to   = new Date(now.getTime() + 65 * 60 * 1000).toISOString()

    const { data: events } = await supabase
      .from('events')
      .select('id, title, start_at')
      .eq('is_published', true)
      .eq('is_cancelled', false)
      .gte('start_at', from)
      .lte('start_at', to)

    if (!events?.length) return ok({ sent: 0 })

    let sent = 0

    for (const event of events) {
      // Fetch all confirmed attendees
      const { data: bookings } = await supabase
        .from('bookings')
        .select('user_id')
        .eq('event_id', event.id)
        .eq('status', 'confirmed')

      if (!bookings?.length) continue

      await sendNotifications(
        bookings.map((b) => ({
          userId: b.user_id,
          type: 'event_reminder' as const,
          payload: {
            event_id: event.id,
            event_title: event.title,
            start_at: event.start_at,
          },
        }))
      )

      sent += bookings.length
    }

    return ok({ sent, events: events.length })
  } catch (err) {
    return handleApiError(err)
  }
}
