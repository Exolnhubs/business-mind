import { NextRequest } from 'next/server'
import { GoogleGenerativeAI, Tool, FunctionDeclaration, SchemaType } from '@google/generative-ai'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireAuth } from '@/lib/auth'
import { handleApiError, ok, ApiException } from '@/lib/errors'
import { z } from 'zod'
import { limiters, checkRateLimit } from '@/lib/rate-limit'
import { isTransientGeminiError, runGeminiWithFallback } from '@/lib/gemini'

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? '')

// ── System prompt ─────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are Rawaq Support, the friendly AI assistant for the Rawaq event discovery platform.

LANGUAGE: Detect the language of the user's first message and reply in that same language for the entire conversation. If the user writes in Arabic, all your replies must be in Arabic. If they write in English, reply in English. Never switch languages unless the user does. The technical escalation block [TICKET]...[/TICKET] must always be written in English (the server parses it), but every user-visible sentence must be in the user's language.

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

TOOLS YOU CAN CALL:
- get_ticket_status: call this when the user mentions a support ticket number (format TKT-XXXXXX). Extract the ticket number from their message and pass it as ticket_number.
- get_my_event_reports: call this when the user asks about an event report or incident they filed (e.g. "what happened to my report on Event X", "status of my complaint about that event"). After receiving the list, match the event name contextually. If the name is ambiguous, ask the user to confirm (e.g. "Did you mean 'Jeddah Music Festival 2025'?").

TOOL RESPONSE HANDLING:
- Ticket found, public_response present: summarise the status and warmly share the response from the team.
- Ticket found, public_response null: acknowledge the status and reassure ("still being reviewed, no update from the team yet").
- Ticket not found (found: false): tell the user that ticket number doesn't appear to be on their account and ask them to double-check it.
- Reports list non-empty: find the event the user is asking about and share its status + public_response if available, otherwise reassure it's under review.
- Reports list empty: tell the user they haven't filed any event reports yet.

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

// ── Gemini function declarations ──────────────────────────────────────────────

const SUPPORT_TOOLS: Tool[] = [
  {
    functionDeclarations: [
      {
        name: 'get_ticket_status',
        description: 'Fetches the status and public response for a support ticket belonging to the authenticated user.',
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            ticket_number: {
              type: SchemaType.STRING,
              description: 'The ticket number, e.g. TKT-A10783',
            },
          },
          required: ['ticket_number'],
        },
      } as FunctionDeclaration,
      {
        name: 'get_my_event_reports',
        description: 'Returns all event reports filed by the authenticated user, including event title and resolution status.',
        parameters: {
          type: SchemaType.OBJECT,
          properties: {},
        },
      } as FunctionDeclaration,
    ],
  },
]

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

// ── Tool execution ─────────────────────────────────────────────────────────────

async function executeToolCall(
  name: string,
  args: Record<string, unknown>,
  userId: string
): Promise<unknown> {
  const admin = createSupabaseAdminClient()

  if (name === 'get_ticket_status') {
    const ticketNumber = args.ticket_number as string
    const { data } = await (admin as any)
      .from('support_tickets')
      .select('ticket_number, category, subject, status, public_response, updated_at')
      .eq('ticket_number', ticketNumber)
      .eq('user_id', userId)
      .single()

    if (!data) return { found: false }
    return { found: true, ...data }
  }

  if (name === 'get_my_event_reports') {
    const { data } = await (admin as any)
      .from('event_reports')
      .select('id, reason, status, public_response, created_at, events ( id, title )')
      .eq('reporter_id', userId)
      .order('created_at', { ascending: false })

    return { reports: data ?? [] }
  }

  return { error: 'Unknown tool' }
}

// ── POST /api/support/chat ─────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const ctx  = await requireAuth()
    await checkRateLimit(limiters.supportChat, ctx.userId)
    const body = await req.json()
    const { messages } = BodySchema.parse(body)

    const history = messages.slice(0, -1) as ChatMessage[]
    const lastMsg = messages[messages.length - 1]
    if (lastMsg.role !== 'user') {
      return ok({ reply: '', ticket: null })
    }

    let reply = await runGeminiWithFallback(async (modelName) => {
      const model = genAI.getGenerativeModel({
        model: modelName,
        systemInstruction: SYSTEM_PROMPT,
        tools: SUPPORT_TOOLS,
      })
      const chat = model.startChat({ history })
      let result = await chat.sendMessage(lastMsg.parts[0].text)

      // Handle function call loop — Gemini may request one tool call per turn
      const candidate = result.response.candidates?.[0]
      const fnCall = candidate?.content?.parts?.find(p => p.functionCall)?.functionCall

      if (fnCall) {
        const toolResult = await executeToolCall(fnCall.name, fnCall.args as Record<string, unknown>, ctx.userId)
        result = await chat.sendMessage([
          {
            functionResponse: {
              name: fnCall.name,
              response: toolResult as object,
            },
          },
        ])
      }

      return result.response.text().trim()
    }, { route: 'support/chat', operation: 'reply' })

    // ── Parse ticket escalation ────────────────────────────────────────────────
    let ticket: { ticket_number: string; category: string } | null = null
    const ticketMatch = reply.match(/\[TICKET\]([\s\S]*?)\[\/TICKET\]/)

    if (ticketMatch) {
      reply = reply.replace(/\[TICKET\][\s\S]*?\[\/TICKET\]\n?/, '').trim()

      let ticketCreated = false
      try {
        const payload = JSON.parse(ticketMatch[1]) as TicketPayload
        const admin   = createSupabaseAdminClient()

        const VALID_CATEGORIES = ['general', 'refund', 'harassment', 'legal', 'technical'] as const
        type ValidCategory = typeof VALID_CATEGORIES[number]

        const classifyPrompt =
          `Classify this support issue into exactly one of these categories: general, refund, harassment, legal, technical.\n` +
          `Harassment covers: sexual assault, inappropriate behaviour, threats, bullying, stalking, abuse.\n` +
          `Refund covers: payment disputes, overcharging, money back requests.\n` +
          `Legal covers: formal complaints, data privacy, GDPR, lawsuits.\n` +
          `Technical covers: app bugs, crashes, login issues.\n` +
          `General covers: everything else.\n\n` +
          `Issue: "${payload.subject} — ${payload.description}"\n\n` +
          `Reply with ONLY the single category word, nothing else.`
        let category: ValidCategory = 'general'
        try {
          const rawCat = await runGeminiWithFallback(async (modelName) => {
            const classifyModel = genAI.getGenerativeModel({ model: modelName })
            const classifyResult = await classifyModel.generateContent(classifyPrompt)
            return classifyResult.response.text().trim().toLowerCase()
          }, { route: 'support/chat', operation: 'ticket_category' })
          category = (VALID_CATEGORIES as readonly string[]).includes(rawCat)
            ? (rawCat as ValidCategory)
            : 'general'
        } catch (err) {
          console.warn('[support/chat] ticket category fallback:', err)
        }

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
          console.error('[support/chat] ticket insert error:', dbErr)
        }

        if (row) {
          ticket        = { ticket_number: row.ticket_number, category: row.category }
          ticketCreated = true
          reply += `\n\nYour ticket number is **${row.ticket_number}**. Keep this for reference.`
        }
      } catch (err) {
        console.error('[support/chat] ticket creation exception:', err)
      }

      if (!ticketCreated) {
        reply += '\n\n(I wasn\'t able to open a ticket right now — please try again in a moment or contact us directly.)'
      }
    }

    return ok({ reply, ticket })
  } catch (err) {
    if (!(err instanceof ApiException) && isTransientGeminiError(err)) {
      return ok({
        reply: 'The support assistant is busy right now. Please try again in a moment.',
        ticket: null,
        temporaryUnavailable: true,
      })
    }
    return handleApiError(err)
  }
}
