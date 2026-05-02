# AI Chat — Ticket & Event Report Status Lookups

**Date:** 2026-05-02
**Status:** Approved

## Overview

Extend the customer support AI chat (Gemini-powered, `rawaq-mobile`) to allow users to query the status of their support tickets and event incident reports. The AI calls backend tools to fetch live data and responds conversationally in the user's language (Arabic or English).

---

## 1. Database Changes

### `support_tickets` — new column

```sql
ALTER TABLE support_tickets
ADD COLUMN public_response TEXT;
```

- Written by admins specifically for the user to read
- Nullable — null means the team has not yet responded
- Distinct from `admin_notes`, which remains internal-only

### `event_reports` — new column

```sql
ALTER TABLE event_reports
ADD COLUMN public_response TEXT;
```

- Same semantics as above
- Distinct from `resolution_note`, which remains an internal field

---

## 2. Admin API Changes

Both existing admin PATCH endpoints accept the new field alongside existing fields:

**`PATCH /api/admin/support/{id}`**
- Accepts: `status`, `admin_notes`, `public_response`

**`PATCH /api/admin/reports/{id}`**
- Accepts: `action` (`resolve` | `dismiss`), `resolution_note`, `public_response`

---

## 3. New User-Facing API Endpoints

Both endpoints are authenticated. All queries are scoped to `user_id = authenticated user` enforced via Supabase RLS.

### `GET /api/support/tickets/:ticketNumber`

Returns a single ticket by `ticket_number`.

**Success response (200):**
```json
{
  "ticket_number": "TKT-A10783",
  "category": "refund",
  "subject": "Refund request for cancelled event",
  "status": "in_progress",
  "public_response": "We've received your request and are coordinating with the organizer.",
  "created_at": "2026-04-20T10:00:00Z",
  "updated_at": "2026-04-28T14:30:00Z"
}
```

**Not found / wrong user (404):** Both cases return identical 404 — no enumeration risk.

### `GET /api/support/my-reports`

Returns all event reports filed by the authenticated user. No pagination — one report per event by DB constraint means realistically few records.

**Success response (200):**
```json
[
  {
    "id": "uuid",
    "reason": "harassment",
    "status": "resolved",
    "public_response": "The organizer has been warned and the post removed.",
    "created_at": "2026-04-15T08:00:00Z",
    "event": {
      "id": "uuid",
      "title": "Jeddah Music Festival 2025"
    }
  }
]
```

---

## 4. Gemini Function Calling Integration

**File:** `rawaq-web/app/api/support/chat/route.ts`

### Function Declarations

Two functions are declared in the Gemini chat session:

| Function | Parameters | Purpose |
|---|---|---|
| `get_ticket_status` | `ticket_number: string` | Fetch status + public_response for a specific ticket |
| `get_my_event_reports` | _(none)_ | Fetch all event reports filed by the user |

### Request Loop

```
1. User sends message
2. Server sends to Gemini with function declarations
3a. Gemini returns text → return reply (existing flow, unchanged)
3b. Gemini returns functionCall:
      → Server queries Supabase directly using user's JWT (RLS enforces user-scoping)
      → Server sends functionResponse back to Gemini
      → Gemini generates final natural-language reply
      → Server returns { reply }
```

Tool execution uses direct Supabase queries — no internal HTTP round-trips. The user's JWT is passed so RLS is enforced automatically.

### Tool Result Contracts

**`get_ticket_status` results:**

| Scenario | Payload sent to Gemini |
|---|---|
| Ticket found | `{ found: true, ticket_number, status, public_response \| null, updated_at }` |
| Not found / wrong user | `{ found: false }` |

**`get_my_event_reports` results:**

| Scenario | Payload sent to Gemini |
|---|---|
| Reports exist | Array of `{ event_title, reason, status, public_response \| null, created_at }` |
| No reports | `[]` |

### Mobile App

No changes required. The mobile app continues sending `POST /api/support/chat` with `{ messages }` and receiving `{ reply, ticket }`.

---

## 5. System Prompt Updates

### Trigger rules

**Call `get_ticket_status` when:**
- The user mentions a ticket number matching `TKT-[A-Z0-9]{6}` (e.g., *"status of TKT-A10783"*, *"any update on TKT-B22901"*)

**Call `get_my_event_reports` when:**
- The user asks about an event report or incident they filed
- Examples: *"what happened to my report on Jeddah Music Fest"*, *"did anything happen with my complaint about that event"*, *"what's the status of my incident report"*

### Response tone

| Outcome | AI behaviour |
|---|---|
| Ticket found, public_response present | Summarise status and quote the response warmly |
| Ticket found, public_response null | Acknowledge status, reassure: *"still being reviewed, no update from the team yet"* |
| Ticket not found | *"That ticket number doesn't appear to be on your account — please double-check it"* |
| Report found, public_response present | Explain the outcome clearly using the response |
| Report found, public_response null | Reassure: *"your report is still under review"* |
| No reports on file | *"You haven't filed any event reports yet"* |
| Ambiguous event name match | Ask: *"Did you mean 'Jeddah Music Festival 2025'?"* |

Language rule: detect Arabic or English from the user's first message and maintain it throughout — unchanged from current behaviour.

---

## 6. Out of Scope

- Admin dashboard UI changes for setting `public_response` (backend only in this spec; UI is a separate concern)
- Push notifications when a public response is added to a ticket/report
- Pagination on `GET /api/support/my-reports`
- Ticket list lookup (bulk status) — only single-ticket lookup by number

---

## 7. File Change Summary

| File | Change |
|---|---|
| DB migration | Add `public_response` to `support_tickets` |
| DB migration | Add `public_response` to `event_reports` |
| `rawaq-web/app/api/admin/support/[id]/route.ts` | Accept `public_response` in PATCH |
| `rawaq-web/app/api/admin/reports/[id]/route.ts` | Accept `public_response` in PATCH |
| `rawaq-web/app/api/support/tickets/[ticketNumber]/route.ts` | New GET endpoint |
| `rawaq-web/app/api/support/my-reports/route.ts` | New GET endpoint |
| `rawaq-web/app/api/support/chat/route.ts` | Add function declarations + function call loop |
