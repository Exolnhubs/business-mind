# AI Chat — Ticket & Event Report Status Lookups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the Gemini-powered support AI the ability to look up a user's support ticket status and event report status via function calling, returning admin-written public responses when available.

**Architecture:** Two Gemini function declarations (`get_ticket_status`, `get_my_event_reports`) are added to the chat route. When Gemini returns a `functionCall` response, the server executes the appropriate Supabase query using the user's admin client scoped to the authenticated user, sends the result back as a `functionResponse`, then Gemini generates the final reply. The mobile app is unchanged.

**Tech Stack:** Next.js 14 App Router, `@google/generative-ai` SDK (Gemini function calling), Supabase (PostgreSQL + admin client), Zod, TypeScript.

**Spec:** `docs/superpowers/specs/2026-05-02-ai-chat-ticket-report-status-design.md`

---

## File Map

| Action | Path | Responsibility |
|---|---|---|
| Create | `rawaq-web/supabase/migrations/00077_support_ticket_public_response.sql` | Add `public_response` to `support_tickets` |
| Create | `rawaq-web/supabase/migrations/00078_event_report_public_response.sql` | Add `public_response` to `event_reports` |
| Modify | `rawaq-web/app/api/admin/support/[id]/route.ts` | Accept `public_response` in PATCH |
| Modify | `rawaq-web/app/api/admin/reports/[id]/route.ts` | Accept `public_response` in PATCH |
| Create | `rawaq-web/app/api/support/tickets/[ticketNumber]/route.ts` | GET single ticket by number (user-scoped) |
| Create | `rawaq-web/app/api/support/my-reports/route.ts` | GET all user event reports |
| Modify | `rawaq-web/app/api/support/chat/route.ts` | Add function declarations + function call loop |

---

## Task 1: Migration — add `public_response` to `support_tickets`

**Files:**
- Create: `rawaq-web/supabase/migrations/00077_support_ticket_public_response.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- 00077_support_ticket_public_response.sql
-- Adds a public-facing response field for admins to communicate ticket outcomes to users.
-- Distinct from admin_notes (internal only).

ALTER TABLE support_tickets
  ADD COLUMN public_response TEXT;
```

- [ ] **Step 2: Apply the migration**

```bash
cd rawaq-web
npx supabase db push
```

Expected: migration applied with no errors.

- [ ] **Step 3: Commit**

```bash
git add rawaq-web/supabase/migrations/00077_support_ticket_public_response.sql
git commit -m "feat(db): add public_response to support_tickets"
```

---

## Task 2: Migration — add `public_response` to `event_reports`

**Files:**
- Create: `rawaq-web/supabase/migrations/00078_event_report_public_response.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- 00078_event_report_public_response.sql
-- Adds a public-facing response field for admins to communicate report outcomes to users.
-- Distinct from resolution_note (internal only).

ALTER TABLE event_reports
  ADD COLUMN public_response TEXT;
```

- [ ] **Step 2: Apply the migration**

```bash
cd rawaq-web
npx supabase db push
```

Expected: migration applied with no errors.

- [ ] **Step 3: Commit**

```bash
git add rawaq-web/supabase/migrations/00078_event_report_public_response.sql
git commit -m "feat(db): add public_response to event_reports"
```

---

## Task 3: Admin API — accept `public_response` on ticket PATCH

**Files:**
- Modify: `rawaq-web/app/api/admin/support/[id]/route.ts`

- [ ] **Step 1: Update the Zod schema and handler**

Replace the entire file content with:

```typescript
import { NextRequest } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/auth'
import { handleApiError, ok, NotFoundException } from '@/lib/errors'
import { z } from 'zod'

const UpdateSchema = z.object({
  status:          z.enum(['open', 'in_progress', 'resolved', 'closed']).optional(),
  admin_notes:     z.string().max(2000).optional(),
  public_response: z.string().max(2000).optional(),
})

// PATCH /api/admin/support/:id
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const ctx    = await requireAdmin()
    const body   = await req.json()
    const input  = UpdateSchema.parse(body)
    const admin  = createSupabaseAdminClient()

    const updates: Record<string, unknown> = { ...input }
    if (input.status === 'resolved' || input.status === 'closed') {
      updates.resolved_by = ctx.userId
      updates.resolved_at = new Date().toISOString()
    }

    const { data, error } = await (admin as any)
      .from('support_tickets')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error || !data) throw new NotFoundException('Ticket')
    return ok(data)
  } catch (err) {
    return handleApiError(err)
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd rawaq-web
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add rawaq-web/app/api/admin/support/[id]/route.ts
git commit -m "feat(admin): accept public_response on ticket PATCH"
```

---

## Task 4: Admin API — accept `public_response` on report PATCH

**Files:**
- Modify: `rawaq-web/app/api/admin/reports/[id]/route.ts`

- [ ] **Step 1: Update the Zod schema and handler**

Replace the entire file content with:

```typescript
import { NextRequest } from 'next/server'
import { z } from 'zod'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth'
import { handleApiError, ok, NotFoundException } from '@/lib/errors'

const ResolveSchema = z.object({
  action:          z.enum(['resolve', 'dismiss']),
  resolution_note: z.string().max(500).optional(),
  public_response: z.string().max(2000).optional(),
})

// PATCH /api/admin/reports/:id — resolve or dismiss an event report
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const ctx    = await requireAdmin()
    const body   = await req.json()
    const input  = ResolveSchema.parse(body)

    const supabase = await createSupabaseServerClient()

    const { data: report } = await supabase
      .from('event_reports').select('id, event_id, reason').eq('id', id).single()
    if (!report) throw new NotFoundException('Report')

    const newStatus = input.action === 'resolve' ? 'resolved' : 'dismissed'

    const { data, error } = await supabase
      .from('event_reports')
      .update({
        status:          newStatus,
        resolved_by:     ctx.userId,
        resolved_at:     new Date().toISOString(),
        resolution_note: input.resolution_note ?? null,
        public_response: input.public_response ?? null,
      })
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    // Write to audit_log
    await supabase.from('audit_logs').insert({
      admin_id:    ctx.userId,
      action:      input.action === 'resolve' ? 'resolve_report' : 'dismiss_report',
      target_type: 'report',
      target_id:   id,
      meta:        { event_id: report.event_id, reason: report.reason, resolution_note: input.resolution_note },
    } as any)

    return ok(data)
  } catch (err) {
    return handleApiError(err)
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd rawaq-web
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add rawaq-web/app/api/admin/reports/[id]/route.ts
git commit -m "feat(admin): accept public_response on report PATCH"
```

---

## Task 5: New endpoint — GET single ticket by ticket number

**Files:**
- Create: `rawaq-web/app/api/support/tickets/[ticketNumber]/route.ts`

- [ ] **Step 1: Create the file**

```typescript
import { NextRequest } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireAuth } from '@/lib/auth'
import { handleApiError, ok, NotFoundException } from '@/lib/errors'

// GET /api/support/tickets/:ticketNumber
// Returns a single ticket scoped to the authenticated user.
// Both "not found" and "belongs to another user" return 404 — no enumeration risk.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ ticketNumber: string }> }
) {
  try {
    const { ticketNumber } = await params
    const ctx   = await requireAuth()
    const admin = createSupabaseAdminClient()

    const { data } = await (admin as any)
      .from('support_tickets')
      .select('ticket_number, category, subject, status, public_response, created_at, updated_at')
      .eq('ticket_number', ticketNumber)
      .eq('user_id', ctx.userId)
      .single()

    if (!data) throw new NotFoundException('Ticket')
    return ok(data)
  } catch (err) {
    return handleApiError(err)
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd rawaq-web
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Smoke-test the route manually**

Start the dev server (`npm run dev` in `rawaq-web`), then with a valid user session:

```bash
curl -H "Cookie: <your-session-cookie>" \
  http://localhost:3000/api/support/tickets/TKT-XXXXXX
```

Expected for a valid ticket: `{ ticket_number, category, subject, status, public_response, created_at, updated_at }`
Expected for unknown/other-user ticket: `{ error: "Ticket not found" }` with status 404.

- [ ] **Step 4: Commit**

```bash
git add rawaq-web/app/api/support/tickets/[ticketNumber]/route.ts
git commit -m "feat(api): GET /api/support/tickets/:ticketNumber — user-scoped lookup"
```

---

## Task 6: New endpoint — GET user's event reports

**Files:**
- Create: `rawaq-web/app/api/support/my-reports/route.ts`

- [ ] **Step 1: Create the file**

```typescript
import { requireAuth } from '@/lib/auth'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { handleApiError, ok } from '@/lib/errors'

// GET /api/support/my-reports
// Returns all event reports filed by the authenticated user,
// including event title for AI-side name matching.
export async function GET() {
  try {
    const ctx   = await requireAuth()
    const admin = createSupabaseAdminClient()

    const { data } = await (admin as any)
      .from('event_reports')
      .select(`
        id,
        reason,
        status,
        public_response,
        created_at,
        events ( id, title )
      `)
      .eq('reporter_id', ctx.userId)
      .order('created_at', { ascending: false })

    return ok(data ?? [])
  } catch (err) {
    return handleApiError(err)
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd rawaq-web
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Smoke-test the route manually**

With a valid user session:

```bash
curl -H "Cookie: <your-session-cookie>" \
  http://localhost:3000/api/support/my-reports
```

Expected: array of reports, each with `{ id, reason, status, public_response, created_at, events: { id, title } }`.
Expected when user has no reports: `[]`.

- [ ] **Step 4: Commit**

```bash
git add rawaq-web/app/api/support/my-reports/route.ts
git commit -m "feat(api): GET /api/support/my-reports — user's event reports"
```

---

## Task 7: Support chat — Gemini function calling

This is the core task. It modifies `rawaq-web/app/api/support/chat/route.ts` to add function declarations and handle the function call loop.

**Files:**
- Modify: `rawaq-web/app/api/support/chat/route.ts`

- [ ] **Step 1: Replace the entire file with the updated version**

```typescript
import { NextRequest } from 'next/server'
import { GoogleGenerativeAI, Tool, FunctionDeclaration, SchemaType } from '@google/generative-ai'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireAuth } from '@/lib/auth'
import { handleApiError, ok, ApiException } from '@/lib/errors'
import { z } from 'zod'
import { limiters, checkRateLimit } from '@/lib/rate-limit'
import { isTransientGeminiError, runGeminiWithFallback } from '@/lib/gemini'

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? '')

// ── System prompt ──────────────────────────────────────────────────────────────

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

// ── Gemini function declarations ───────────────────────────────────────────────

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

    return data ?? []
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
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd rawaq-web
npx tsc --noEmit
```

Expected: no errors. If you see `FunctionDeclaration` or `Tool` import errors, check the installed version of `@google/generative-ai` — the types above are correct for `^0.21.0`. Run `npm list @google/generative-ai` to confirm the version.

- [ ] **Step 3: Manual smoke test — ticket lookup**

Start the dev server. Open the support chat in the mobile app (or use a REST client with a valid session cookie). Send the message:

> "What's the status of TKT-XXXXXX" (use a real ticket number from your account)

Expected: Gemini calls `get_ticket_status`, the server fetches the ticket, and the reply includes the ticket status. If `public_response` is null, the reply should say something like *"Your ticket is still being reviewed, no update from the team yet."*

- [ ] **Step 4: Manual smoke test — event report lookup**

Send the message:

> "What happened to my report on [an event you have reported]?"

Expected: Gemini calls `get_my_event_reports`, the server returns the list, and Gemini matches and summarises the correct report.

- [ ] **Step 5: Manual smoke test — no tool call (regression)**

Send a general question:

> "How do I cancel my booking?"

Expected: Gemini answers directly without calling any tool. The `[TICKET]` escalation flow for a real issue should still work as before.

- [ ] **Step 6: Commit**

```bash
git add rawaq-web/app/api/support/chat/route.ts
git commit -m "feat(ai): add Gemini function calling for ticket and report status lookups"
```

---

## Task 8: End-to-end verification

- [ ] **Step 1: Verify admin can set `public_response` on a ticket**

Using a REST client or admin UI, send:

```bash
PATCH /api/admin/support/<ticket-id>
Content-Type: application/json

{ "public_response": "We have reviewed your request and processed a full refund. Please allow 3-5 business days." }
```

Expected: 200 with updated ticket record including `public_response`.

- [ ] **Step 2: Verify the chat reflects the public response**

In the support chat, ask about the ticket number you just updated.

Expected: the AI response includes the public_response text you set, along with the ticket status.

- [ ] **Step 3: Verify admin can set `public_response` on a report**

```bash
PATCH /api/admin/reports/<report-id>
Content-Type: application/json

{ "action": "resolve", "resolution_note": "Internal: warned organizer", "public_response": "We have reviewed your report and taken appropriate action with the organizer." }
```

Expected: 200 with updated report record including `public_response`.

- [ ] **Step 4: Verify the chat reflects the report public response**

In the support chat, ask about the event report you just updated.

Expected: the AI response includes the public_response text, along with the resolved status.

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "chore: verify e2e ticket and report status lookups via AI chat"
```
