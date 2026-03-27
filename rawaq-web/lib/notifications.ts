import { createSupabaseAdminClient } from './supabase/admin'
import { sendNotificationEmail } from './email'
import type { NotificationType } from '@/types/database'

interface SendNotificationParams {
  userId: string
  type: NotificationType
  payload: Record<string, unknown>
}

// Fetch auth email + display name for a user via admin client
async function getUserInfo(userId: string): Promise<{ email: string; name: string } | null> {
  const admin = createSupabaseAdminClient()
  const [{ data: authUser }, { data: profile }] = await Promise.all([
    admin.auth.admin.getUserById(userId),
    admin.from('profiles').select('display_name').eq('id', userId).single(),
  ])
  const email = authUser.user?.email
  if (!email) return null
  return { email, name: profile?.display_name ?? email.split('@')[0] }
}

// Persist notification in DB + deliver via push and email (fully independent, fire-and-forget)
export async function sendNotification({ userId, type, payload }: SendNotificationParams) {
  const admin = createSupabaseAdminClient()

  // 1. Persist in DB (always, awaited)
  const { error: dbErr } = await admin
    .from('notifications')
    .insert({ user_id: userId, type, payload } as any)
  if (dbErr) console.error('[Notification] DB insert failed:', type, userId, dbErr.message)

  // 2. Push — independent, never blocked by email
  pushExpoNotification({ userId, type, payload }).catch((err) =>
    console.error('[Push] Delivery failed:', type, userId, err?.message ?? err)
  )

  // 3. Email — independent, never blocks push
  getUserInfo(userId)
    .then((info) => {
      if (!info) return
      return sendNotificationEmail({ type, payload, toEmail: info.email, toName: info.name })
    })
    .catch((err) =>
      console.error('[Email] Delivery failed:', type, userId, err?.message ?? err)
    )
}

// Send to multiple users (e.g. event cancellation to all attendees)
export async function sendNotifications(notifications: SendNotificationParams[]) {
  await Promise.all(notifications.map(sendNotification))
}

// ─── Expo Push ───────────────────────────────────────────────────────────────

async function pushExpoNotification({ userId, type, payload }: SendNotificationParams) {
  const admin = createSupabaseAdminClient()

  const { data: tokens, error: tokenErr } = await admin
    .from('device_tokens')
    .select('token')
    .eq('user_id', userId)
    .eq('is_active', true)

  if (tokenErr) {
    console.error('[Push] Failed to fetch tokens:', type, userId, tokenErr.message)
    return
  }
  if (!tokens?.length) {
    console.log(`[Push] No device tokens for user ${userId} (${type}) — skipping`)
    return
  }
  console.log(`[Push] Sending "${type}" to user ${userId} (${tokens.length} token(s))`)

  const title = getPushTitle(type)
  const body  = getPushBody(type, payload)

  const messages = tokens.map((t) => ({
    to: t.token,
    title,
    body,
    sound: 'default',
    data: { type, ...Object.fromEntries(Object.entries(payload).map(([k, v]) => [k, String(v)])) },
    priority: 'high',
  }))

  for (let i = 0; i < messages.length; i += 100) {
    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(messages.slice(i, i + 100)),
    })
    const json = await res.json().catch(() => null)
    if (!res.ok || json?.errors?.length) {
      console.error('[Push] Expo API error:', JSON.stringify(json))
    } else {
      const tickets: Array<{ status: string; id?: string; message?: string }> = json?.data ?? []
      const failed = tickets.filter((t) => t.status !== 'ok')
      if (failed.length) console.warn('[Push] Some tickets failed:', JSON.stringify(failed))
      else console.log(`[Push] "${type}" delivered OK (${tickets.length} ticket(s))`)
    }
  }
}

// ─── Copy ────────────────────────────────────────────────────────────────────

function getPushTitle(type: NotificationType): string {
  const titles: Record<NotificationType, string> = {
    booking_confirmed:   'Booking Confirmed ✅',
    booking_cancelled:   'Booking Cancelled',
    event_reminder:      'Event Reminder ⏰',
    comment_reply:       'New Reply 💬',
    mention:             'You were mentioned 👋',
    organizer_approved:  'Account Approved 🎉',
    organizer_rejected:  'Application Update',
    organizer_suspended: 'Account Suspended',
    event_cancelled:     'Event Cancelled',
    tip_received:        'You received a tip 💰',
    waitlist_promoted:   'You\'re In! 🎉',
    new_follower:        'New Follower 👤',
    new_review:          'New Review ⭐',
    new_attendee:        'New Attendee 🎟️',
    new_comment:         'New Comment 💬',
    event_updated:       'Event Updated 📝',
    new_event_published: 'New Event 🎉',
    event_sold_out:      'Sold Out 🎊',
  }
  return titles[type] ?? 'Rawaq Notification'
}

function getPushBody(type: NotificationType, payload: Record<string, unknown>): string {
  const str = (k: string) => String(payload[k] ?? '')
  switch (type) {
    case 'booking_confirmed':   return `Your booking for "${str('event_title')}" is confirmed`
    case 'booking_cancelled':   return `Your booking for "${str('event_title')}" has been cancelled`
    case 'event_reminder':      return `"${str('event_title')}" starts in ${str('reminder') || '1 hour'}`
    case 'comment_reply':       return `${str('actor_name')} replied to your comment`
    case 'mention':             return `${str('actor_name')} mentioned you in a comment`
    case 'organizer_approved':  return 'Your organizer account has been approved'
    case 'organizer_rejected':  return 'Your organizer application was not approved'
    case 'organizer_suspended': return 'Your organizer account has been suspended'
    case 'tip_received':        return `You received a ${str('amount')} ${str('currency')} tip for "${str('event_title')}"`
    case 'event_cancelled':     return `"${str('event_title')}" has been cancelled`
    case 'waitlist_promoted':   return `You've been moved off the waitlist for "${str('event_title')}"`
    case 'new_follower':        return `${str('actor_name')} started following you`
    case 'new_review':          return `${str('actor_name')} left you a ${str('rating')}★ review`
    case 'new_attendee':        return `${str('actor_name')} just booked "${str('event_title')}"`
    case 'new_comment':         return `${str('actor_name')} commented on "${str('event_title')}"`
    case 'event_updated':       return `"${str('event_title')}" has been updated — check the new details`
    case 'new_event_published': return `${str('organizer_name')} just published "${str('event_title')}"`
    case 'event_sold_out':      return `Your event "${str('event_title')}" just sold out! 🎊`
    default:                    return 'You have a new notification'
  }
}
