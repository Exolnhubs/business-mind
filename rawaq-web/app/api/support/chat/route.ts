import { NextRequest } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireAuth } from '@/lib/auth'
import { handleApiError, ok } from '@/lib/errors'
import { z } from 'zod'

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? '')

// ── System prompt ──────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are Rawaq Support, the friendly AI assistant for the Rawaq event discovery platform.

ABOUT RAWAQ:
- Rawaq is an event discovery platform for the Arab world (Saudi Arabia and beyond)
- Users can browse, book, and attend events (free and paid)
- Organizers create and manage events, sell tickets, track attendance with QR codes
- Features: event bookings, QR tickets, notifications, saved events, global chat, organizer dashboard
- Booking: tap an event → select ticket type → confirm. Cancel anytime from My Bookings.
- Profile: set your city (GPS detected), gender, display name, bio
- Notifications: booking confirmations, event updates, organizer news
- Organizer requests: users can apply to become an organizer from the Profile → Organizer section
- QR tickets: show your QR at the venue entrance for check-in
- Saved events: tap the bookmark icon on any event to save it
- Cancel booking: go to My Bookings → tap the booking → Cancel

PERSONALITY: Warm, concise, helpful. 2-3 sentences per reply max. Use 1 emoji per message.

ESCALATION RULES — for these issues you MUST create a support ticket:
1. Sexual harassment, inappropriate behaviour, or threats from another user
2. Refund requests for paid bookings
3. Legal concerns, formal complaints, or data privacy requests
4. Persistent technical issues you cannot resolve by guiding the user

When you decide to escalate, output on its own line:
[TICKET]{"category":"harassment","subject":"Brief subject here","description":"Full description of the issue for the admin team"}[/TICKET]

Then tell the user: "I've escalated your case to our admin team — they will review it and follow up with you shortly."

For general questions: answer directly. Do NOT create a ticket unless truly necessary.
Do NOT ask for personal details like passwords or payment info.`

// ── Types ──────────────────────────────────────────────────────────────────────

interface ChatMessage {
  role: 'user' | 'model'
  parts: [{ text: string }]
}

interface TicketPayload {
  category: 'general' | 'refund' | 'harassment' | 'legal' | 'technical'
  subject: string
  description: string
}

const BodySchema = z.object({
  messages: z.array(
    z.object({
      role: z.enum(['user', 'model']),
      parts: z.tuple([z.object({ text: z.string() })]),
    })
  ).min(1).max(80),
})

// ── POST /api/support/chat ─────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const ctx  = await requireAuth()
    const body = await req.json()
    const { messages } = BodySchema.parse(body)

    const history = messages.slice(0, -1) as ChatMessage[]
    const lastMsg = messages[messages.length - 1]
    if (lastMsg.role !== 'user') {
      return ok({ reply: '', ticket: null })
    }

    const model = genAI.getGenerativeModel({
      model: process.env.GEMINI_MODEL ?? 'gemini-1.5-flash',
      systemInstruction: SYSTEM_PROMPT,
    })

    const chat   = model.startChat({ history })
    const result = await chat.sendMessage(lastMsg.parts[0].text)
    let   reply  = result.response.text().trim()

    // ── Parse ticket escalation ────────────────────────────────────────────────
    let ticket: { ticket_number: string; category: string } | null = null
    const ticketMatch = reply.match(/\[TICKET\]([\s\S]*?)\[\/TICKET\]/)

    if (ticketMatch) {
      reply = reply.replace(/\[TICKET\][\s\S]*?\[\/TICKET\]\n?/, '').trim()

      let ticketCreated = false
      try {
        const payload = JSON.parse(ticketMatch[1]) as TicketPayload
        const admin   = createSupabaseAdminClient()

        // Normalize AI-generated category to our valid enum values
        const VALID_CATEGORIES = ['general', 'refund', 'harassment', 'legal', 'technical'] as const
        type ValidCategory = typeof VALID_CATEGORIES[number]
        const rawCat = (payload.category ?? '').toLowerCase()
        const category: ValidCategory =
          rawCat.includes('refund')     ? 'refund'     :
          rawCat.includes('harass')     ? 'harassment' :
          rawCat.includes('legal')      ? 'legal'      :
          rawCat.includes('tech')       ? 'technical'  :
          VALID_CATEGORIES.includes(rawCat as ValidCategory) ? (rawCat as ValidCategory) : 'general'

        const { data: row, error: dbErr } = await (admin as any)
          .from('support_tickets')
          .insert({
            user_id:     ctx.userId,
            category,
            subject:     (payload.subject  ?? 'Support request').slice(0, 200),
            description: (payload.description ?? '').slice(0, 2000),
            status:      'open',
          })
          .select('ticket_number, category')
          .single()

        if (dbErr) {
          // Log so Vercel function logs surface the real error
          console.error('[support/chat] ticket insert error:', dbErr)
        }

        if (row) {
          ticket        = { ticket_number: row.ticket_number, category: row.category }
          ticketCreated = true
          // Append ticket number to reply
          reply += `\n\nYour ticket number is **${row.ticket_number}**. Keep this for reference.`
        }
      } catch (err) {
        console.error('[support/chat] ticket creation exception:', err)
      }

      // If creation failed, be honest — don't leave the user expecting a ticket number
      if (!ticketCreated) {
        reply += '\n\n(I wasn\'t able to open a ticket right now — please try again in a moment or contact us directly.)'
      }
    }

    return ok({ reply, ticket })
  } catch (err) {
    return handleApiError(err)
  }
}
