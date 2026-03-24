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

// Persist notification in DB + deliver via push and email (both fire-and-forget)
export async function sendNotification({ userId, type, payload }: SendNotificationParams) {
  const admin = createSupabaseAdminClient()

  // 1. Persist in DB (always)
  await admin.from('notifications').insert({ user_id: userId, type, payload })

  // 2. Push + email (parallel, non-blocking)
  Promise.all([
    pushExpoNotification({ userId, type, payload }),
    getUserInfo(userId).then((info) => {
      if (!info) return
      return sendNotificationEmail({ type, payload, toEmail: info.email, toName: info.name })
    }),
  ]).catch((err) => console.error('[Notification] Delivery failed:', err))
}

// Send to multiple users (e.g. event cancellation to all attendees)
export async function sendNotifications(notifications: SendNotificationParams[]) {
  await Promise.all(notifications.map(sendNotification))
}

// ─── Expo Push ───────────────────────────────────────────────────────────────

async function pushExpoNotification({ userId, type, payload }: SendNotificationParams) {
  const admin = createSupabaseAdminClient()

  const { data: tokens } = await admin
    .from('device_tokens')
    .select('token')
    .eq('user_id', userId)
    .eq('is_active', true)

  if (!tokens?.length) return

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
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(messages.slice(i, i + 100)),
    })
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
  }
  return titles[type] ?? 'Rawaq Notification'
}

function getPushBody(type: NotificationType, payload: Record<string, unknown>): string {
  const str = (k: string) => String(payload[k] ?? '')
  switch (type) {
    case 'booking_confirmed':   return `Your booking for "${str('event_title')}" is confirmed`
    case 'booking_cancelled':   return `Your booking for "${str('event_title')}" has been cancelled`
    case 'event_reminder':      return `"${str('event_title')}" starts in 1 hour`
    case 'comment_reply':       return `${str('actor_name')} replied to your comment`
    case 'mention':             return `${str('actor_name')} mentioned you in a comment`
    case 'organizer_approved':  return 'Your organizer account has been approved'
    case 'organizer_rejected':  return 'Your organizer application was not approved'
    case 'organizer_suspended': return 'Your organizer account has been suspended'
    case 'tip_received':        return `You received a ${str('amount')} ${str('currency')} tip for "${str('event_title')}"`
    case 'event_cancelled':     return `"${str('event_title')}" has been cancelled`
    default:                    return 'You have a new notification'
  }
}
