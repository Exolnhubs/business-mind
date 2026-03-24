import { createSupabaseAdminClient } from './supabase/admin'
import type { NotificationType } from '@/types/database'

interface SendNotificationParams {
  userId: string
  type: NotificationType
  payload: Record<string, unknown>
}

// Store notification in DB + push via FCM if device token exists
export async function sendNotification({ userId, type, payload }: SendNotificationParams) {
  const admin = createSupabaseAdminClient()

  // 1. Persist in DB
  await admin.from('notifications').insert({ user_id: userId, type, payload })

  // 2. Push via FCM (fire-and-forget — don't block response)
  pushFcmNotification({ userId, type, payload }).catch((err) =>
    console.error('[FCM] Push failed:', err)
  )
}

// Send to multiple users (e.g. mention in comment)
export async function sendNotifications(notifications: SendNotificationParams[]) {
  await Promise.all(notifications.map(sendNotification))
}

async function pushFcmNotification({ userId, type, payload }: SendNotificationParams) {
  const admin = createSupabaseAdminClient()

  // Fetch active Expo push tokens
  const { data: tokens } = await admin
    .from('device_tokens')
    .select('token')
    .eq('user_id', userId)
    .eq('is_active', true)

  if (!tokens?.length) return

  const title = getFcmTitle(type)
  const body = getFcmBody(type, payload)

  // Expo Push Service — accepts ExponentPushToken[...] values directly,
  // handles both FCM (Android) and APNs (iOS) transparently.
  // Docs: https://docs.expo.dev/push-notifications/sending-notifications/
  const messages = tokens.map((t) => ({
    to: t.token,
    title,
    body,
    sound: 'default',
    data: { type, ...Object.fromEntries(Object.entries(payload).map(([k, v]) => [k, String(v)])) },
    priority: 'high',
  }))

  // Expo accepts up to 100 messages per request; chunk just in case
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

function getFcmTitle(type: NotificationType): string {
  const titles: Record<NotificationType, string> = {
    booking_confirmed: 'Booking Confirmed ✅',
    booking_cancelled: 'Booking Cancelled',
    event_reminder: 'Event Reminder ⏰',
    comment_reply: 'New Reply 💬',
    mention: 'You were mentioned 👋',
    organizer_approved: 'Account Approved 🎉',
    event_cancelled: 'Event Cancelled',
    tip_received: 'You received a tip 💰',
  }
  return titles[type] ?? 'Rawaq Notification'
}

function getFcmBody(type: NotificationType, payload: Record<string, unknown>): string {
  switch (type) {
    case 'booking_confirmed':
      return `Your booking for "${payload.event_title}" is confirmed`
    case 'event_reminder':
      return `"${payload.event_title}" starts in 1 hour`
    case 'comment_reply':
      return `${payload.actor_name} replied to your comment`
    case 'mention':
      return `${payload.actor_name} mentioned you in a comment`
    case 'organizer_approved':
      return 'Your organizer account has been approved'
    case 'tip_received':
      return `You received a ${payload.amount} ${payload.currency} tip`
    case 'event_cancelled':
      return `"${payload.event_title}" has been cancelled`
    default:
      return 'You have a new notification'
  }
}
