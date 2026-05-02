# Ticket Management on Mobile + Hot Offers

**Date:** 2026-04-16

## Problem

The mobile organizer dashboard has no way to manage ticket types for an existing event. Edit mode on `event-form.tsx` only exposes a single price/free toggle. The web client has a full ticket CRUD page (`/organizer/events/[id]/ticket-types`). Additionally, neither client supports "hot offers" — time-limited promotional prices on a ticket type.

## Goals

1. Port the web ticket-type management UI to the mobile organizer flow.
2. Add hot offer support (promotional price + expiry date) to the ticket edition widget on both web and mobile.

---

## 1. Database Migration (`00069_ticket_hot_offer.sql`)

Add three columns to `ticket_types`:

| Column | Type | Default | Constraint |
|---|---|---|---|
| `is_hot_offer` | `boolean` | `false` | NOT NULL |
| `hot_offer_price` | `numeric(10,2)` | NULL | `>= 0` |
| `hot_offer_ends_at` | `timestamptz` | NULL | — |

**Integrity constraint:** `CHECK (NOT is_hot_offer OR (hot_offer_price IS NOT NULL AND hot_offer_price >= 0 AND hot_offer_ends_at IS NOT NULL))`

**Effective price logic (app-side):** `is_hot_offer = true AND hot_offer_ends_at > NOW()` → use `hot_offer_price`; otherwise use `price`. No DB trigger needed.

---

## 2. TypeScript Types (both clients)

Add to `TicketType` interface in `rawaq-web/types/database.ts` and `rawaq-mobile/types/database.ts`:

```ts
is_hot_offer:      boolean
hot_offer_price:   number | null
hot_offer_ends_at: string | null
```

---

## 3. Web API Routes

**Files:** `app/api/events/[id]/ticket-types/route.ts` and `.../[typeId]/route.ts`

Extend both Zod schemas with:
```ts
is_hot_offer:      z.boolean().default(false)
hot_offer_price:   z.number().min(0).optional().nullable()
hot_offer_ends_at: z.string().datetime().optional().nullable()
```

The INSERT/PATCH spreads the full validated input, so new fields flow through automatically.

---

## 4. Web Ticket-Types Page

**File:** `rawaq-web/app/(app)/organizer/events/[id]/ticket-types/page.tsx`

**Form changes:**
- Add `is_hot_offer`, `hot_offer_price`, `hot_offer_ends_at` to `EMPTY_FORM`
- Below the price/capacity row: add a "Hot Offer" section
  - Checkbox `🔥 Hot Offer`
  - When checked: show `Hot offer price` (number input) + `Offer ends at` (datetime-local)
  - When unchecked: both fields hidden and sent as `null`
- `openEdit()` maps the new fields from the existing ticket

**List changes:**
- Show `🔥` badge + strikethrough original price + hot price when `is_hot_offer && new Date(hot_offer_ends_at) > new Date()`
- Show `Expired` label when `is_hot_offer && hot_offer_ends_at` is in the past

---

## 5. Mobile Ticket-Types Screen (new file)

**File:** `rawaq-mobile/app/organizer/ticket-types.tsx`

A standalone screen accessible via route `/organizer/ticket-types?eventId=<id>&title=<title>`.

**Features (mirrors web page):**
- Load ticket types via `GET /api/events/[eventId]/ticket-types` (includes inactive for organizer — need to fetch all, not just active)
- List with per-item Edit / Delete buttons
- Inline form (toggled open) for create/edit with all fields:
  - Name, Name (Arabic), Description
  - Price + Free toggle
  - Capacity, Sort order
  - Sale starts / Sale ends (date-time pickers using existing DateTimePicker pattern)
  - Hot Offer toggle + hot price + offer ends at
- `POST` to create, `PATCH` to update, `DELETE` to soft-delete
- UI styled with existing `Colors`, `Spacing`, `Radius`, `FontSize` theme tokens
- Uses `apiPost`, `apiPatch`, `apiDelete` from `@/lib/api` (same auth pattern as event-form)

**Note on GET:** The current GET endpoint filters `is_active = true`. For the organizer management screen, we need all tickets. Options:
- Pass `?all=true` query param and handle it in the route, OR
- Use the Supabase client directly with the user's session (organizer-authenticated)
- **Decision:** Add `?organizer=1` query param support to the GET route so organizer can see inactive tickets too; auth-guard it.

---

## 6. Mobile Event-Form — Edit Mode

**File:** `rawaq-mobile/app/organizer/event-form.tsx`

In edit mode (`isEdit = true`), replace the existing "Pricing" `Field` (single price/free toggle) with a navigation row:

```tsx
<Field label="Ticket Types">
  <TouchableOpacity style={styles.navRow} onPress={() =>
    router.push(`/organizer/ticket-types?eventId=${id}&title=${encodeURIComponent(title)}`)
  }>
    <Text style={styles.navRowText}>Manage Ticket Types</Text>
    <Text style={styles.navRowArrow}>›</Text>
  </TouchableOpacity>
</Field>
```

The single price/free toggle becomes irrelevant for ticket-managed events and is removed from edit mode.

---

## Out of Scope

- End-user booking flow showing hot offer strikethrough pricing (separate task)
- Auto-disabling expired hot offers via DB trigger

---

## Implementation Order

1. DB migration
2. Update `TicketType` types in both clients
3. Update web API Zod schemas
4. Update web ticket-types page (hot offer fields)
5. New mobile `ticket-types.tsx` screen
6. Update mobile `event-form.tsx` edit mode nav row
