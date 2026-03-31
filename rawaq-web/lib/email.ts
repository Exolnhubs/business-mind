import { Resend } from 'resend'
import type { NotificationType } from '@/types/database'
import { generateTicketQR } from './qr'

const resend = new Resend(process.env.RESEND_API_KEY)

const FROM = process.env.RESEND_FROM_EMAIL ?? 'Rawaq <notifications@rawaq.app>'
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://rawaq.app'

// ─── Base layout ────────────────────────────────────────────────────────────

function layout(content: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Rawaq</title></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:40px 16px">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
        <!-- Header -->
        <tr><td style="background:#f59e0b;border-radius:12px 12px 0 0;padding:24px 32px">
          <p style="margin:0;font-size:22px;font-weight:700;color:#fff;letter-spacing:-0.3px">Rawaq 🌟</p>
        </td></tr>
        <!-- Body -->
        <tr><td style="background:#fff;padding:32px;border-radius:0 0 12px 12px;border:1px solid #e5e7eb;border-top:none">
          ${content}
          <hr style="border:none;border-top:1px solid #f3f4f6;margin:28px 0">
          <p style="margin:0;font-size:12px;color:#9ca3af;line-height:1.6">
            You received this email because you have an account on <a href="${APP_URL}" style="color:#f59e0b;text-decoration:none">Rawaq</a>.
            Manage your notification preferences in your profile settings.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

function btn(href: string, label: string): string {
  return `<a href="${href}" style="display:inline-block;background:#f59e0b;color:#fff;font-weight:600;font-size:14px;padding:12px 24px;border-radius:8px;text-decoration:none;margin-top:20px">${label}</a>`
}

function h1(text: string): string {
  return `<h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#111827">${text}</h1>`
}

function p(text: string): string {
  return `<p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.6">${text}</p>`
}

// ─── Templates ───────────────────────────────────────────────────────────────

async function bookingConfirmed(
  eventTitle: string, eventId: string,
  bookingId?: string, ticketId?: string,
): Promise<string> {
  const ticketUrl = bookingId ? `${APP_URL}/bookings/${bookingId}/ticket` : null
  let qrBlock = ''
  if (ticketId) {
    const qrDataUrl = await generateTicketQR(ticketId)
    qrBlock = `
      <div style="margin:24px 0;text-align:center">
        <div style="display:inline-block;background:#fff;border:2px solid #f3f4f6;border-radius:16px;padding:12px">
          <img src="${qrDataUrl}" alt="Ticket QR Code" width="200" height="200" style="display:block" />
        </div>
        <p style="margin:12px 0 0;font-size:14px;font-weight:700;color:#111827;letter-spacing:0.12em;font-family:monospace">${ticketId}</p>
        <p style="margin:4px 0 0;font-size:12px;color:#9ca3af">Present this QR code at the venue entrance</p>
        ${ticketUrl ? `<div style="margin-top:16px">${btn(ticketUrl, '🎟️ View & Download Ticket')}</div>` : ''}
      </div>`
  }
  return layout(`
    ${h1('Booking Confirmed ✅')}
    ${p(`Your spot for <strong>${eventTitle}</strong> is confirmed. We'll see you there!`)}
    ${qrBlock}
    ${!ticketUrl ? btn(`${APP_URL}/events/${eventId}`, 'View Event') : ''}
  `)
}

function bookingCancelled(eventTitle: string, eventId: string): string {
  return layout(`
    ${h1('Booking Cancelled')}
    ${p(`Your booking for <strong>${eventTitle}</strong> has been cancelled.`)}
    ${p('If you didn\'t request this cancellation, please contact support.')}
    ${btn(`${APP_URL}/events`, 'Browse Events')}
  `)
}

function organizerApproved(note?: string): string {
  return layout(`
    ${h1('Your Organizer Account is Approved 🎉')}
    ${p('Congratulations! Your organizer application has been reviewed and approved. You can now create and publish events on Rawaq.')}
    ${note ? p(`<em>Note from the team: ${note}</em>`) : ''}
    ${btn(`${APP_URL}/organizer`, 'Go to Dashboard')}
  `)
}

function organizerRejected(note?: string): string {
  return layout(`
    ${h1('Organizer Application Update')}
    ${p('Thank you for applying to become an organizer on Rawaq. After review, we\'re unable to approve your application at this time.')}
    ${note ? p(`<em>Reason: ${note}</em>`) : ''}
    ${p('You\'re welcome to reapply after addressing any concerns. If you have questions, please reach out to our support team.')}
    ${btn(`${APP_URL}/profile`, 'View Your Profile')}
  `)
}

function organizerSuspended(note?: string): string {
  return layout(`
    ${h1('Account Suspended')}
    ${p('Your organizer account has been suspended. Your events have been unpublished while this is in effect.')}
    ${note ? p(`<em>Reason: ${note}</em>`) : ''}
    ${p('Please contact support if you believe this is a mistake.')}
  `)
}

function eventCancelled(eventTitle: string, eventId: string): string {
  return layout(`
    ${h1('Event Cancelled')}
    ${p(`We\'re sorry to let you know that <strong>${eventTitle}</strong> has been cancelled by the organizer.`)}
    ${p('Any payments made will be refunded according to the organizer\'s refund policy.')}
    ${btn(`${APP_URL}/events`, 'Discover Other Events')}
  `)
}

function eventReminder(eventTitle: string, eventId: string, startAt: string): string {
  const date = new Date(startAt).toLocaleString('en-SA', {
    weekday: 'long', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
  return layout(`
    ${h1('Your Event Starts Soon ⏰')}
    ${p(`<strong>${eventTitle}</strong> is starting in about 1 hour.`)}
    ${p(`<strong>When:</strong> ${date}`)}
    ${btn(`${APP_URL}/events/${eventId}`, 'View Event Details')}
  `)
}

function tipReceived(amount: number, currency: string, eventTitle: string): string {
  return layout(`
    ${h1('You Received a Donation 💰')}
    ${p(`Someone appreciated your event <strong>${eventTitle}</strong> and sent you a donation of <strong>${amount} ${currency}</strong>.`)}
    ${btn(`${APP_URL}/organizer`, 'View Dashboard')}
  `)
}

function commentReply(actorName: string, eventId: string): string {
  return layout(`
    ${h1('New Reply to Your Comment 💬')}
    ${p(`<strong>${actorName}</strong> replied to your comment.`)}
    ${btn(`${APP_URL}/events/${eventId}`, 'View Thread')}
  `)
}

function mention(actorName: string, eventId: string): string {
  return layout(`
    ${h1('You Were Mentioned 👋')}
    ${p(`<strong>${actorName}</strong> mentioned you in a comment.`)}
    ${btn(`${APP_URL}/events/${eventId}`, 'See the Comment')}
  `)
}

// ─── Dispatcher ──────────────────────────────────────────────────────────────

interface EmailParams {
  type: NotificationType
  payload: Record<string, unknown>
  toEmail: string
  toName: string
}

async function buildEmail(type: NotificationType, payload: Record<string, unknown>): Promise<{ subject: string; html: string } | null> {
  const str = (k: string) => String(payload[k] ?? '')
  const num = (k: string) => Number(payload[k] ?? 0)

  switch (type) {
    case 'booking_confirmed':
      return {
        subject: `Booking confirmed: ${str('event_title')}`,
        html: await bookingConfirmed(
          str('event_title'), str('event_id'),
          payload.booking_id ? str('booking_id') : undefined,
          payload.ticket_id ? str('ticket_id') : undefined,
        ),
      }
    case 'booking_cancelled':
      return { subject: `Booking cancelled: ${str('event_title')}`, html: bookingCancelled(str('event_title'), str('event_id')) }
    case 'organizer_approved':
      return { subject: 'Your organizer account has been approved 🎉', html: organizerApproved(str('note')) }
    case 'organizer_rejected':
      return { subject: 'Update on your organizer application', html: organizerRejected(str('note')) }
    case 'organizer_suspended':
      return { subject: 'Your organizer account has been suspended', html: organizerSuspended(str('note')) }
    case 'event_cancelled':
      return { subject: `Event cancelled: ${str('event_title')}`, html: eventCancelled(str('event_title'), str('event_id')) }
    case 'event_reminder':
      return { subject: `Reminder: ${str('event_title')} starts in 1 hour`, html: eventReminder(str('event_title'), str('event_id'), str('start_at')) }
    case 'tip_received':
      return { subject: `You received a ${str('amount')} ${str('currency')} donation!`, html: tipReceived(num('amount'), str('currency'), str('event_title')) }
    case 'comment_reply':
      return { subject: `${str('actor_name')} replied to your comment`, html: commentReply(str('actor_name'), str('event_id')) }
    case 'mention':
      return { subject: `${str('actor_name')} mentioned you`, html: mention(str('actor_name'), str('event_id')) }
    default:
      return null
  }
}

export async function sendNotificationEmail({ type, payload, toEmail, toName }: EmailParams) {
  if (!process.env.RESEND_API_KEY) return  // graceful no-op in dev without key

  const email = await buildEmail(type, payload)
  if (!email) return

  await resend.emails.send({
    from: FROM,
    to: [toEmail],
    subject: email.subject,
    html: email.html,
  })
}

