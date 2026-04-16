# Group Booking with Dependent Ticket Holders — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow users to buy multiple tickets for the same event occurrence in one transaction, entering holder details (name, DOB, relation) for each extra ticket, while each ticket consumes one capacity spot.

**Architecture:** One `bookings` row per group (with `group_size`), `booking_holders` child rows for dependents. DB triggers updated to increment/decrement by `group_size`. A quantity stepper + holder forms added to `CheckoutForm` and the mobile booking screen. Organizer's event form gains `max_group_size`; attendees page shows group info.

**Tech Stack:** PostgreSQL (triggers), Next.js 14, React 18, TypeScript, Zod, Tailwind CSS, React Native.

---

## File Map

| File | Change |
|------|--------|
| `rawaq-web/supabase/migrations/00068_group_booking.sql` | **CREATE** — adds columns, new table, updates both capacity triggers |
| `rawaq-web/types/database.ts` | **MODIFY** — add `BookingHolder`, `max_group_size` to `Event`, `group_size` to `Booking` |
| `rawaq-mobile/types/database.ts` | **MODIFY** — same additions as web |
| `rawaq-web/lib/validations/bookings.ts` | **MODIFY** — add `group_size` + `holders` to `CreateBookingSchema` |
| `rawaq-web/app/api/payments/initiate/route.ts` | **MODIFY** — group cap, holders count, price, holders insert |
| `rawaq-web/app/api/bookings/route.ts` | **MODIFY** — same logic for free-booking POST |
| `rawaq-web/components/events/CheckoutForm.tsx` | **MODIFY** — quantity stepper, holder forms, updated price breakdown, updated payload |
| `rawaq-web/app/(app)/events/[id]/checkout/page.tsx` | **MODIFY** — pass `maxGroupSize` and `spotsLeft` to `CheckoutForm` |
| `rawaq-web/components/organizer/EventForm.tsx` | **MODIFY** — add `max_group_size` field near `capacity` |
| `rawaq-web/app/(app)/organizer/events/[id]/attendees/page.tsx` | **MODIFY** — fetch group_size + holders, show in table |
| `rawaq-mobile/app/events/[id].tsx` | **MODIFY** — quantity stepper, holder forms, updated payload |

---

### Task 1: DB migration — schema + trigger updates

**Files:**
- Create: `rawaq-web/supabase/migrations/00068_group_booking.sql`

- [ ] **Step 1: Create the migration file**

Create `rawaq-web/supabase/migrations/00068_group_booking.sql` with this exact content:

```sql
-- ============================================================
-- 00068 · Group booking support
--
-- Adds max_group_size to events, group_size to bookings,
-- and the booking_holders child table.
-- Updates both capacity triggers to use group_size.
-- ============================================================

-- 1. max_group_size on events (NULL = default 5)
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS max_group_size INT CHECK (max_group_size >= 1);

-- 2. group_size on bookings (defaults to 1 — no change to existing rows)
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS group_size INT NOT NULL DEFAULT 1 CHECK (group_size >= 1);

-- 3. booking_holders — one row per dependent (position >= 2)
CREATE TABLE IF NOT EXISTS booking_holders (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id    UUID        NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  full_name     TEXT        NOT NULL CHECK (char_length(full_name) BETWEEN 1 AND 120),
  date_of_birth DATE        NOT NULL,
  relation      TEXT        NOT NULL CHECK (char_length(relation) BETWEEN 1 AND 60),
  position      INT         NOT NULL CHECK (position >= 2),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (booking_id, position)
);

ALTER TABLE booking_holders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "booking_holders_owner_read"
  ON booking_holders FOR SELECT
  USING (
    booking_id IN (SELECT id FROM bookings WHERE user_id = auth.uid())
  );

CREATE INDEX IF NOT EXISTS idx_booking_holders_booking_id
  ON booking_holders(booking_id);

-- 4. Update check_event_capacity BEFORE trigger to use group_size
CREATE OR REPLACE FUNCTION check_event_capacity()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_occurrence_updated INT;
  v_ticket_updated     INT;
  v_group_size         INT;
BEGIN
  IF NEW.status <> 'confirmed' THEN
    RETURN NEW;
  END IF;

  IF NEW.occurrence_id IS NULL THEN
    RAISE EXCEPTION 'Occurrence is required for confirmed bookings'
      USING ERRCODE = 'P0004';
  END IF;

  v_group_size := COALESCE(NEW.group_size, 1);

  -- Atomic capacity guard: increment by group_size, only if enough spots remain
  UPDATE event_occurrences
  SET    bookings_count = bookings_count + v_group_size
  WHERE  id     = NEW.occurrence_id
    AND  status = 'scheduled'
    AND  (capacity IS NULL OR bookings_count + v_group_size <= capacity);

  GET DIAGNOSTICS v_occurrence_updated = ROW_COUNT;

  IF v_occurrence_updated = 0 THEN
    RAISE EXCEPTION 'This event occurrence is fully booked'
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE events
  SET    bookings_count = bookings_count + v_group_size
  WHERE  id = NEW.event_id;

  IF NEW.ticket_type_id IS NOT NULL THEN
    INSERT INTO event_occurrence_ticket_sales (occurrence_id, ticket_type_id, sold_count)
    VALUES (NEW.occurrence_id, NEW.ticket_type_id, v_group_size)
    ON CONFLICT (occurrence_id, ticket_type_id) DO UPDATE
    SET sold_count = event_occurrence_ticket_sales.sold_count + v_group_size,
        updated_at = NOW()
    WHERE EXISTS (
      SELECT 1 FROM ticket_types tt
      WHERE  tt.id = NEW.ticket_type_id
        AND  (tt.capacity IS NULL
              OR event_occurrence_ticket_sales.sold_count + v_group_size <= tt.capacity)
    );

    GET DIAGNOSTICS v_ticket_updated = ROW_COUNT;

    IF v_ticket_updated = 0 THEN
      UPDATE event_occurrences
      SET bookings_count = GREATEST(bookings_count - v_group_size, 0)
      WHERE id = NEW.occurrence_id;

      UPDATE events
      SET bookings_count = GREATEST(bookings_count - v_group_size, 0)
      WHERE id = NEW.event_id;

      RAISE EXCEPTION 'This ticket type is sold out'
        USING ERRCODE = 'P0003';
    END IF;

    UPDATE ticket_types
    SET    sold_count = sold_count + v_group_size
    WHERE  id = NEW.ticket_type_id;
  END IF;

  RETURN NEW;
END;
$$;

-- 5. Update update_event_bookings_count AFTER trigger to decrement by group_size
CREATE OR REPLACE FUNCTION update_event_bookings_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_group_size INT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    NULL; -- BEFORE trigger already incremented atomically

  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.status = 'confirmed' AND (
      NEW.status <> 'confirmed'
      OR NEW.occurrence_id IS DISTINCT FROM OLD.occurrence_id
      OR NEW.ticket_type_id IS DISTINCT FROM OLD.ticket_type_id
    ) THEN
      v_group_size := COALESCE(OLD.group_size, 1);

      UPDATE event_occurrences
      SET bookings_count = GREATEST(bookings_count - v_group_size, 0)
      WHERE id = OLD.occurrence_id;

      UPDATE events
      SET bookings_count = GREATEST(bookings_count - v_group_size, 0)
      WHERE id = OLD.event_id;

      IF OLD.ticket_type_id IS NOT NULL THEN
        UPDATE event_occurrence_ticket_sales
        SET sold_count = GREATEST(sold_count - v_group_size, 0),
            updated_at = NOW()
        WHERE occurrence_id = OLD.occurrence_id
          AND ticket_type_id = OLD.ticket_type_id;

        UPDATE ticket_types
        SET sold_count = GREATEST(sold_count - v_group_size, 0)
        WHERE id = OLD.ticket_type_id;
      END IF;
    END IF;

  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.status = 'confirmed' THEN
      v_group_size := COALESCE(OLD.group_size, 1);

      UPDATE event_occurrences
      SET bookings_count = GREATEST(bookings_count - v_group_size, 0)
      WHERE id = OLD.occurrence_id;

      UPDATE events
      SET bookings_count = GREATEST(bookings_count - v_group_size, 0)
      WHERE id = OLD.event_id;

      IF OLD.ticket_type_id IS NOT NULL THEN
        UPDATE event_occurrence_ticket_sales
        SET sold_count = GREATEST(sold_count - v_group_size, 0),
            updated_at = NOW()
        WHERE occurrence_id = OLD.occurrence_id
          AND ticket_type_id = OLD.ticket_type_id;

        UPDATE ticket_types
        SET sold_count = GREATEST(sold_count - v_group_size, 0)
        WHERE id = OLD.ticket_type_id;
      END IF;
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;
```

- [ ] **Step 2: Verify migration file exists and is valid SQL**

```bash
cd rawaq-web && cat supabase/migrations/00068_group_booking.sql | head -5
```

Expected: first line is the comment header.

- [ ] **Step 3: Commit**

```bash
cd rawaq-web && git add supabase/migrations/00068_group_booking.sql
git commit -m "feat(db): add group booking schema — max_group_size, group_size, booking_holders, updated triggers"
```

---

### Task 2: Update TypeScript types

**Files:**
- Modify: `rawaq-web/types/database.ts`
- Modify: `rawaq-mobile/types/database.ts`

- [ ] **Step 1: Add `max_group_size` to the `Event` interface in web types**

In `rawaq-web/types/database.ts`, find the `Event` interface. After the line `is_cancelled: boolean;`, add:

```ts
  max_group_size: number | null;
```

- [ ] **Step 2: Add `group_size` to the `Booking` interface in web types**

In `rawaq-web/types/database.ts`, find the `Booking` interface. After `platform_fee_amount: number;`, add:

```ts
  group_size: number;
```

- [ ] **Step 3: Add `BookingHolder` interface in web types**

In `rawaq-web/types/database.ts`, after the `Booking` interface closing brace, add:

```ts
export interface BookingHolder {
  id: string;
  booking_id: string;
  full_name: string;
  date_of_birth: string;  // ISO date string YYYY-MM-DD
  relation: string;
  position: number;
  created_at: string;
}
```

- [ ] **Step 4: Apply the same three changes to `rawaq-mobile/types/database.ts`**

Repeat steps 1–3 for `rawaq-mobile/types/database.ts` — same field locations, same code.

- [ ] **Step 5: TypeScript check**

```bash
cd rawaq-web && npx tsc --noEmit 2>&1 | head -20
```

Expected: no output.

- [ ] **Step 6: Commit**

```bash
cd rawaq-web && git add types/database.ts
cd rawaq-mobile && git add types/database.ts
cd rawaq-web && git commit -m "feat: add BookingHolder type, group_size to Booking, max_group_size to Event"
```

---

### Task 3: Update booking validation schema

**Files:**
- Modify: `rawaq-web/lib/validations/bookings.ts`

- [ ] **Step 1: Add `group_size` and `holders` to `CreateBookingSchema`**

Replace the entire contents of `rawaq-web/lib/validations/bookings.ts` with:

```ts
import { z } from 'zod'

const HolderSchema = z.object({
  full_name:     z.string().min(1).max(120),
  date_of_birth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD format'),
  relation:      z.string().min(1).max(60),
  position:      z.number().int().min(2),
})

export const CreateBookingSchema = z.object({
  event_id:       z.string().uuid(),
  occurrence_id:  z.string().uuid().optional().nullable(),
  ticket_type_id: z.string().uuid().optional().nullable(),
  promo_code:     z.string().max(32).optional().nullable(),
  notes:          z.string().max(500).optional(),
  group_size:     z.number().int().min(1).max(10).default(1),
  holders:        z.array(HolderSchema).optional().default([]),
})

export const UpdateBookingSchema = z.object({
  status: z.enum(['cancelled', 'confirmed', 'waitlisted']),
})

export type CreateBookingInput = z.infer<typeof CreateBookingSchema>
export type UpdateBookingInput = z.infer<typeof UpdateBookingSchema>
export type HolderInput = z.infer<typeof HolderSchema>
```

- [ ] **Step 2: TypeScript check**

```bash
cd rawaq-web && npx tsc --noEmit 2>&1 | head -20
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
cd rawaq-web && git add lib/validations/bookings.ts
git commit -m "feat: add group_size and holders to CreateBookingSchema"
```

---

### Task 4: Update `/api/payments/initiate` for group bookings

**Files:**
- Modify: `rawaq-web/app/api/payments/initiate/route.ts`

- [ ] **Step 1: Add group size cap validation**

In the route file, find the block that checks `event.gender_restriction`. After the `is_premium_only` check (around line 82), add:

```ts
    // ── Group size cap ─────────────────────────────────────────────────────────
    const maxGroup = (event as any).max_group_size ?? 5
    if (input.group_size > maxGroup) {
      throw new ForbiddenException(`Maximum group size for this event is ${maxGroup}`)
    }
    if (input.holders.length !== input.group_size - 1) {
      throw new ApiException(422, 'Holder details must be provided for each extra ticket')
    }
```

- [ ] **Step 2: Update the occurrence capacity check to use group_size**

Find the occurrence capacity check. It currently reads:
```ts
    if (occurrence.capacity !== null && occurrence.bookings_count >= occurrence.capacity) {
```

Replace with:
```ts
    if (
      occurrence.capacity !== null &&
      occurrence.bookings_count + input.group_size > occurrence.capacity
    ) {
```

- [ ] **Step 3: Update price calculation to account for group_size**

Find the line:
```ts
    const effectivePrice = ticketType
      ? Math.max(0, ticketType.price - discountAmount)
      : event.price
        ? Math.max(0, event.price - discountAmount)
        : 0
    const isFreeBooking = ticketType ? ticketType.is_free || effectivePrice === 0 : event.is_free || effectivePrice === 0
```

Replace with:
```ts
    // Promo discount applies to primary ticket only; extra tickets pay full price
    const primaryPrice = ticketType
      ? Math.max(0, ticketType.price - discountAmount)
      : event.price
        ? Math.max(0, event.price - discountAmount)
        : 0
    const extraPrice   = ticketType
      ? ticketType.price * (input.group_size - 1)
      : (event.price ?? 0) * (input.group_size - 1)
    const effectivePrice = primaryPrice + extraPrice
    const isFreeBooking  = (ticketType ? ticketType.is_free || ticketType.price === 0 : event.is_free || !event.price) && input.group_size === 1
      || effectivePrice === 0
```

- [ ] **Step 4: Store `group_size` on the booking row**

Find the `bookingFields` object construction:
```ts
    const bookingFields = {
      status:              'confirmed',
```

Add `group_size` to it:
```ts
    const bookingFields = {
      status:              'confirmed',
      group_size:          input.group_size,
```

- [ ] **Step 5: Insert `booking_holders` after booking is created**

Find the block after `let booking` is assigned (after the insert/update of the booking row). Add immediately after:

```ts
    // Insert dependent holder rows (position 2+)
    if (input.holders.length > 0) {
      const holderRows = input.holders.map((h) => ({
        booking_id:    booking.id,
        full_name:     h.full_name,
        date_of_birth: h.date_of_birth,
        relation:      h.relation,
        position:      h.position,
      }))
      const { error: holderErr } = await admin.from('booking_holders').insert(holderRows as never)
      if (holderErr) throw holderErr
    }
```

- [ ] **Step 6: TypeScript check**

```bash
cd rawaq-web && npx tsc --noEmit 2>&1 | head -20
```

Expected: no output.

- [ ] **Step 7: Commit**

```bash
cd rawaq-web && git add "app/api/payments/initiate/route.ts"
git commit -m "feat(api): support group_size and holders in payments/initiate"
```

---

### Task 5: Update `POST /api/bookings` for free group bookings

**Files:**
- Modify: `rawaq-web/app/api/bookings/route.ts`

- [ ] **Step 1: Add group size cap + holders count validation**

In the POST handler, find the `is_premium_only` check. After it, add:

```ts
    const maxGroup = (event as any).max_group_size ?? 5
    if (input.group_size > maxGroup) {
      throw new ForbiddenException(`Maximum group size for this event is ${maxGroup}`)
    }
    if (input.holders.length !== input.group_size - 1) {
      throw new ForbiddenException('Holder details must be provided for each extra ticket')
    }
```

- [ ] **Step 2: Update occurrence capacity check**

Find:
```ts
    if (occurrence.capacity !== null && occurrence.bookings_count >= occurrence.capacity) {
```

This check doesn't exist in the bookings route (capacity is enforced by the DB trigger). Skip this step — the DB trigger handles it atomically.

- [ ] **Step 3: Store `group_size` on booking and insert holders**

Find the `bookingFields` object. Add `group_size`:

```ts
    const bookingFields = {
      status:              'confirmed',
      notes:               input.notes ?? null,
      ticket_type_id:      input.ticket_type_id ?? null,
      promo_code_id:       promoCodeId,
      discount_amount:     discountAmount,
      platform_fee_pct:    platformFeePct,
      platform_fee_amount: platformFeeAmount,
      group_size:          input.group_size,
    }
```

After `booking` is assigned (after the insert/update), add:

```ts
    if (input.holders.length > 0) {
      const holderRows = input.holders.map((h) => ({
        booking_id:    booking.id,
        full_name:     h.full_name,
        date_of_birth: h.date_of_birth,
        relation:      h.relation,
        position:      h.position,
      }))
      const { error: holderErr } = await supabase.from('booking_holders').insert(holderRows as never)
      if (holderErr) throw holderErr
    }
```

- [ ] **Step 4: TypeScript check**

```bash
cd rawaq-web && npx tsc --noEmit 2>&1 | head -20
```

Expected: no output.

- [ ] **Step 5: Commit**

```bash
cd rawaq-web && git add "app/api/bookings/route.ts"
git commit -m "feat(api): support group_size and holders in free bookings POST"
```

---

### Task 6: Update `CheckoutForm.tsx` — stepper, holder forms, price, payload

**Files:**
- Modify: `rawaq-web/components/events/CheckoutForm.tsx`

- [ ] **Step 1: Add new props to `CheckoutFormProps`**

Find the `CheckoutFormProps` interface. Add two new props:

```ts
interface CheckoutFormProps {
  eventId: string
  eventTitle: string
  occurrenceId: string | null
  currency: string
  ticketTypes: TicketType[]
  preSelectedTypeId: string | null
  isFree: boolean
  eventPrice: number | null
  isLoggedIn: boolean
  maxGroupSize: number      // ← new
  spotsLeft: number | null  // ← new
}
```

Add them to the destructured parameters in `export function CheckoutForm({`:

```ts
export function CheckoutForm({
  ...existingProps,
  maxGroupSize,
  spotsLeft,
}: CheckoutFormProps) {
```

- [ ] **Step 2: Add group size state**

After the existing state declarations (`const [booked, setBooked]` etc.), add:

```ts
  const [groupSize, setGroupSize] = useState(1)
  const [holders,   setHolders]   = useState<{ full_name: string; date_of_birth: string; relation: string }[]>([])

  function changeGroupSize(newSize: number) {
    const clamped = Math.min(Math.max(1, newSize), effectiveMax)
    setGroupSize(clamped)
    setHolders((prev) => {
      const needed = clamped - 1
      if (needed > prev.length) {
        return [
          ...prev,
          ...Array.from({ length: needed - prev.length }, () => ({
            full_name: '', date_of_birth: '', relation: '',
          })),
        ]
      }
      return prev.slice(0, needed)
    })
  }

  const effectiveMax = Math.min(maxGroupSize, spotsLeft ?? maxGroupSize)
```

- [ ] **Step 3: Update price calculation for group size**

Find:
```ts
  const basePrice     = selectedType ? selectedType.price  : (eventPrice ?? 0)
  const isFreeTicket  = selectedType ? selectedType.is_free : isFree
  const discountAmt   = promo?.discount_amount ?? 0
  const total         = Math.max(0, basePrice - discountAmt)
  const isPaid        = !isFreeTicket && total > 0
```

Replace with:
```ts
  const basePrice    = selectedType ? selectedType.price : (eventPrice ?? 0)
  const isFreeTicket = selectedType ? selectedType.is_free : isFree
  const discountAmt  = promo?.discount_amount ?? 0
  // Promo applies to primary ticket only; extra tickets pay full price
  const primaryTotal = Math.max(0, basePrice - discountAmt)
  const total        = primaryTotal + basePrice * (groupSize - 1)
  const isPaid       = !isFreeTicket && total > 0
```

- [ ] **Step 4: Update `confirmBooking` payload**

Find `body: JSON.stringify({` inside `confirmBooking`. Add `group_size` and `holders`:

```ts
      body: JSON.stringify({
        event_id:          eventId,
        occurrence_id:     occurrenceId,
        ticket_type_id:    selectedTypeId ?? null,
        promo_code:        promo?.valid ? promo.code : null,
        payment_option_id: selectedOptionId ?? 'simulated',
        group_size:        groupSize,
        holders:           holders.map((h, i) => ({ ...h, position: i + 2 })),
      }),
```

- [ ] **Step 5: Update `PriceBreakdown` to show group pricing**

Find the `PriceBreakdown` function. Replace its entire implementation with:

```tsx
function PriceBreakdown({
  basePrice,
  discountAmount,
  groupSize,
  currency,
  promoCode,
}: {
  basePrice: number
  discountAmount: number
  groupSize: number
  currency: string
  promoCode?: string | null
}) {
  const primaryTotal = Math.max(0, basePrice - discountAmount)
  const total = primaryTotal + basePrice * (groupSize - 1)

  return (
    <div className="bg-gray-50 rounded-xl p-4 space-y-2 text-sm">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Price breakdown</p>
      <div className="flex justify-between text-gray-700">
        <span>
          Ticket price{groupSize > 1 ? ` × ${groupSize}` : ''}
        </span>
        <span>{basePrice === 0 ? 'Free' : `${formatCurrency(basePrice * groupSize, currency)}`}</span>
      </div>
      {discountAmount > 0 && (
        <div className="flex justify-between text-green-600 font-medium">
          <span>Promo{promoCode ? ` (${promoCode})` : ''}{groupSize > 1 ? ' — primary ticket' : ''}</span>
          <span>−{formatCurrency(discountAmount, currency)}</span>
        </div>
      )}
      <div className="flex justify-between text-gray-500">
        <span>Platform fee</span>
        <span>Free</span>
      </div>
      <div className="border-t border-gray-200 pt-2 flex justify-between font-bold text-gray-900 text-base">
        <span>Total</span>
        <span className={total === 0 ? 'text-green-600' : 'text-gray-900'}>
          {total === 0 ? 'Free' : formatCurrency(total, currency)}
        </span>
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Add quantity stepper JSX and holder forms to the render**

In the main `return (` block, find the `{/* Ticket selector */}` comment. **After** the ticket selector `</div>` closing tag and **before** the `{/* Promo code */}` comment, insert:

```tsx
      {/* Quantity stepper */}
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
          Number of tickets
        </p>
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => changeGroupSize(groupSize - 1)}
            disabled={groupSize <= 1}
            className="w-9 h-9 rounded-full border border-gray-300 flex items-center justify-center text-lg font-bold text-gray-700 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            −
          </button>
          <span className="text-sm font-semibold w-6 text-center">{groupSize}</span>
          <button
            type="button"
            onClick={() => changeGroupSize(groupSize + 1)}
            disabled={groupSize >= effectiveMax}
            className="w-9 h-9 rounded-full border border-gray-300 flex items-center justify-center text-lg font-bold text-gray-700 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            +
          </button>
          <span className="text-xs text-gray-400">Max {effectiveMax}</span>
        </div>
      </div>

      {/* Dependent holder forms */}
      {groupSize >= 2 && (
        <div className="space-y-4">
          {holders.map((holder, idx) => (
            <div key={idx} className="card p-4 space-y-3">
              <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
                Ticket {idx + 2} — Attendee details
              </p>
              <div>
                <label className="label">Full Name *</label>
                <input
                  type="text"
                  required
                  maxLength={120}
                  value={holder.full_name}
                  onChange={(e) => {
                    const updated = [...holders]
                    updated[idx] = { ...updated[idx], full_name: e.target.value }
                    setHolders(updated)
                  }}
                  className="input"
                  placeholder="Full name of attendee"
                />
              </div>
              <div>
                <label className="label">Date of Birth *</label>
                <input
                  type="date"
                  required
                  value={holder.date_of_birth}
                  onChange={(e) => {
                    const updated = [...holders]
                    updated[idx] = { ...updated[idx], date_of_birth: e.target.value }
                    setHolders(updated)
                  }}
                  className="input"
                />
              </div>
              <div>
                <label className="label">Relation *</label>
                <input
                  type="text"
                  required
                  maxLength={60}
                  value={holder.relation}
                  onChange={(e) => {
                    const updated = [...holders]
                    updated[idx] = { ...updated[idx], relation: e.target.value }
                    setHolders(updated)
                  }}
                  className="input"
                  placeholder="e.g. son, wife, friend"
                />
              </div>
            </div>
          ))}
        </div>
      )}
```

- [ ] **Step 7: Pass `groupSize` to `PriceBreakdown`**

Find the `<PriceBreakdown` usage and add the `groupSize` prop:

```tsx
        <PriceBreakdown
          basePrice={isFreeTicket ? 0 : basePrice}
          discountAmount={discountAmt}
          groupSize={groupSize}
          currency={currency}
          promoCode={promo?.valid ? promo.code : null}
        />
```

- [ ] **Step 8: Disable confirm button when holder forms are incomplete**

Find the confirm button's `disabled` prop:
```tsx
        disabled={loading || (hasTypes && !selectedTypeId)}
```

Replace with:
```tsx
        disabled={
          loading ||
          (hasTypes && !selectedTypeId) ||
          holders.some((h) => !h.full_name.trim() || !h.date_of_birth || !h.relation.trim())
        }
```

- [ ] **Step 9: Update confirm button label to show ticket count**

Find the button label logic:
```tsx
        ) : !hasTypes || isFreeTicket || total === 0 ? (
          'Confirm Booking — Free'
        ) : (
          `Pay ${formatCurrency(total, currency)}`
        )}
```

Replace with:
```tsx
        ) : !hasTypes || isFreeTicket || total === 0 ? (
          groupSize > 1 ? `Confirm Booking — Free (${groupSize} tickets)` : 'Confirm Booking — Free'
        ) : (
          groupSize > 1
            ? `Pay ${formatCurrency(total, currency)} (${groupSize} tickets)`
            : `Pay ${formatCurrency(total, currency)}`
        )}
```

- [ ] **Step 10: TypeScript check**

```bash
cd rawaq-web && npx tsc --noEmit 2>&1 | head -20
```

Expected: no output.

- [ ] **Step 11: Commit**

```bash
cd rawaq-web && git add components/events/CheckoutForm.tsx
git commit -m "feat(web): add quantity stepper and holder forms to CheckoutForm"
```

---

### Task 7: Update checkout page — pass new props

**Files:**
- Modify: `rawaq-web/app/(app)/events/[id]/checkout/page.tsx`

- [ ] **Step 1: Add `max_group_size` to the event select**

Find:
```ts
    .select('id, title, start_at, end_at, event_frequency, venue_name, city, country, cover_image_url, is_free, price, currency, is_cancelled, is_published, capacity, bookings_count')
```

Replace with:
```ts
    .select('id, title, start_at, end_at, event_frequency, venue_name, city, country, cover_image_url, is_free, price, currency, is_cancelled, is_published, capacity, bookings_count, max_group_size')
```

- [ ] **Step 2: Pass `maxGroupSize` and `spotsLeft` to `CheckoutForm`**

Find the `<CheckoutForm` JSX. Add the two new props:

```tsx
        <CheckoutForm
          eventId={id}
          eventTitle={event.title}
          occurrenceId={selectedOccurrence?.id ?? null}
          currency={event.currency ?? 'SAR'}
          ticketTypes={ticketTypes}
          preSelectedTypeId={validPreselect}
          isFree={event.is_free}
          eventPrice={event.price}
          isLoggedIn={!!user}
          maxGroupSize={(event as any).max_group_size ?? 5}
          spotsLeft={spotsLeft}
        />
```

- [ ] **Step 3: TypeScript check**

```bash
cd rawaq-web && npx tsc --noEmit 2>&1 | head -20
```

Expected: no output.

- [ ] **Step 4: Commit**

```bash
cd rawaq-web && git add "app/(app)/events/[id]/checkout/page.tsx"
git commit -m "feat(web): pass maxGroupSize and spotsLeft to CheckoutForm"
```

---

### Task 8: Update EventForm — add `max_group_size` field

**Files:**
- Modify: `rawaq-web/components/organizer/EventForm.tsx`

- [ ] **Step 1: Add `max_group_size` to the form state initializer**

In `EventForm.tsx`, find the form state object. It has a field for `capacity`. Find the form initial state (where `capacity` is set, around line 120) and add:

```ts
    max_group_size: event?.max_group_size?.toString() ?? '',
```

- [ ] **Step 2: Add `max_group_size` to the submit payload**

Find the two submit blocks (create + update) that send the form data. Both have a `capacity` field. After `capacity:` in each, add:

```ts
        max_group_size: form.max_group_size ? Number(form.max_group_size) : null,
```

- [ ] **Step 3: Add the input field to the form JSX**

Find the capacity input in the JSX:
```tsx
<input type="number" min={1} value={form.capacity} onChange={set('capacity')} className="input" placeholder="Unlimited" />
```

After the capacity input's wrapping `<div>`, add a new field:

```tsx
<div>
  <label className="label">Max tickets per booking</label>
  <input
    type="number"
    min={1}
    max={20}
    value={form.max_group_size}
    onChange={set('max_group_size')}
    className="input"
    placeholder="Default: 5"
  />
  <p className="text-xs text-gray-400 mt-1">
    Maximum number of tickets a single user can purchase per booking. Leave blank for the default of 5.
  </p>
</div>
```

Note: there are two separate form sections in `EventForm.tsx` (a two-step wizard). Repeat this addition in both JSX sections where `capacity` appears.

- [ ] **Step 4: TypeScript check**

```bash
cd rawaq-web && npx tsc --noEmit 2>&1 | head -20
```

Expected: no output.

- [ ] **Step 5: Commit**

```bash
cd rawaq-web && git add components/organizer/EventForm.tsx
git commit -m "feat(web): add max_group_size field to organizer EventForm"
```

---

### Task 9: Update organizer attendees page — show group info and holders

**Files:**
- Modify: `rawaq-web/app/(app)/organizer/events/[id]/attendees/page.tsx`

- [ ] **Step 1: Update the `AttendeeRow` type to include `group_size` and `holders`**

Find the `AttendeeRow` interface. Replace it with:

```ts
interface AttendeeRow {
  id: string
  status: string
  created_at: string
  group_size: number
  user: {
    display_name: string
    avatar_url: string | null
    city: string | null
  } | null
  holders: {
    id: string
    full_name: string
    date_of_birth: string
    relation: string
    position: number
  }[]
}
```

- [ ] **Step 2: Update the bookings query to fetch `group_size` and `booking_holders`**

Find:
```ts
  const { data: bookings } = await supabase
    .from('bookings')
    .select('id, status, created_at, user:profiles!user_id(display_name, avatar_url, city)')
    .eq('event_id', id)
    .order('created_at', { ascending: true })
```

Replace with:
```ts
  const { data: bookings } = await supabase
    .from('bookings')
    .select(`
      id, status, created_at, group_size,
      user:profiles!user_id(display_name, avatar_url, city),
      holders:booking_holders(id, full_name, date_of_birth, relation, position)
    `)
    .eq('event_id', id)
    .order('created_at', { ascending: true })
```

- [ ] **Step 3: Update the confirmed attendees table to show group badge**

Find the table row where `user?.display_name` is rendered. After the name cell, add a group size badge when `b.group_size > 1`:

```tsx
<td className="px-4 py-3 text-sm text-gray-900">
  <div>
    <p className="font-medium">{b.user?.display_name ?? '—'}</p>
    {b.group_size > 1 && (
      <p className="text-xs text-brand-600 font-medium mt-0.5">
        👥 +{b.group_size - 1} guest{b.group_size > 2 ? 's' : ''}
      </p>
    )}
    {b.holders.map((h) => (
      <p key={h.id} className="text-xs text-gray-500 mt-0.5">
        {h.position}. {h.full_name} · {h.relation} · {h.date_of_birth}
      </p>
    ))}
  </div>
</td>
```

- [ ] **Step 4: TypeScript check**

```bash
cd rawaq-web && npx tsc --noEmit 2>&1 | head -20
```

Expected: no output.

- [ ] **Step 5: Commit**

```bash
cd rawaq-web && git add "app/(app)/organizer/events/[id]/attendees/page.tsx"
git commit -m "feat(web): show group size and dependent holders in organizer attendees list"
```

---

### Task 10: Update mobile booking screen

**Files:**
- Modify: `rawaq-mobile/app/events/[id].tsx`

- [ ] **Step 1: Add group size state**

In `rawaq-mobile/app/events/[id].tsx`, find the booking-related state declarations. Add:

```ts
  const [groupSize, setGroupSize]   = useState(1)
  const [holders, setHolders]       = useState<{ full_name: string; date_of_birth: string; relation: string }[]>([])

  const maxGroup = (event?.max_group_size ?? 5)
  const spotsLeftOccurrence = selectedOccurrence
    ? (selectedOccurrence.capacity !== null ? selectedOccurrence.capacity - selectedOccurrence.bookings_count : null)
    : null
  const effectiveMax = Math.min(maxGroup, spotsLeftOccurrence ?? maxGroup)

  function changeGroupSize(newSize: number) {
    const clamped = Math.min(Math.max(1, newSize), effectiveMax)
    setGroupSize(clamped)
    setHolders((prev) => {
      const needed = clamped - 1
      if (needed > prev.length) {
        return [
          ...prev,
          ...Array.from({ length: needed - prev.length }, () => ({
            full_name: '', date_of_birth: '', relation: '',
          })),
        ]
      }
      return prev.slice(0, needed)
    })
  }
```

- [ ] **Step 2: Add `group_size` and `holders` to the payment initiation call**

Find the `fetch('/api/payments/initiate'` or equivalent call in the mobile booking flow. Add to the body:

```ts
          group_size: groupSize,
          holders:    holders.map((h, i) => ({ ...h, position: i + 2 })),
```

- [ ] **Step 3: Add quantity stepper JSX**

In the booking section of the mobile event screen, find where the ticket type selector or the confirm button is rendered. Before the confirm button, add:

```tsx
      {/* Quantity stepper */}
      <View style={{ marginBottom: Spacing.md }}>
        <Text style={[styles.sectionLabel, { marginBottom: Spacing.sm }]}>
          Number of tickets
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.md }}>
          <TouchableOpacity
            onPress={() => changeGroupSize(groupSize - 1)}
            disabled={groupSize <= 1}
            style={[styles.stepperBtn, groupSize <= 1 && styles.stepperBtnDisabled]}
          >
            <Text style={styles.stepperBtnText}>−</Text>
          </TouchableOpacity>
          <Text style={styles.stepperCount}>{groupSize}</Text>
          <TouchableOpacity
            onPress={() => changeGroupSize(groupSize + 1)}
            disabled={groupSize >= effectiveMax}
            style={[styles.stepperBtn, groupSize >= effectiveMax && styles.stepperBtnDisabled]}
          >
            <Text style={styles.stepperBtnText}>+</Text>
          </TouchableOpacity>
          <Text style={styles.stepperMax}>Max {effectiveMax}</Text>
        </View>
      </View>
```

Add these styles to the `StyleSheet.create({})` at the bottom of the file:

```ts
  stepperBtn: {
    width: 36, height: 36, borderRadius: 18,
    borderWidth: 1, borderColor: Colors.gray[300],
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.white,
  },
  stepperBtnDisabled: { opacity: 0.4 },
  stepperBtnText: { fontSize: 20, fontWeight: FontWeight.bold, color: Colors.gray[700] },
  stepperCount: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, minWidth: 24, textAlign: 'center' },
  stepperMax: { fontSize: FontSize.xs, color: Colors.gray[400] },
  stepperLabel: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, color: Colors.gray[500], textTransform: 'uppercase', letterSpacing: 0.5 },
```

- [ ] **Step 4: Add dependent holder forms JSX**

After the stepper, add:

```tsx
      {/* Dependent holder forms */}
      {holders.map((holder, idx) => (
        <View key={idx} style={[styles.card, { marginBottom: Spacing.md, padding: Spacing.md }]}>
          <Text style={[styles.sectionLabel, { marginBottom: Spacing.sm }]}>
            Ticket {idx + 2} — Attendee details
          </Text>
          <Text style={styles.fieldLabel}>Full Name *</Text>
          <TextInput
            style={styles.input}
            value={holder.full_name}
            onChangeText={(text) => {
              const updated = [...holders]
              updated[idx] = { ...updated[idx], full_name: text }
              setHolders(updated)
            }}
            placeholder="Full name of attendee"
            placeholderTextColor={Colors.gray[400]}
            maxLength={120}
          />
          <Text style={[styles.fieldLabel, { marginTop: Spacing.sm }]}>Date of Birth * (YYYY-MM-DD)</Text>
          <TextInput
            style={styles.input}
            value={holder.date_of_birth}
            onChangeText={(text) => {
              const updated = [...holders]
              updated[idx] = { ...updated[idx], date_of_birth: text }
              setHolders(updated)
            }}
            placeholder="1990-01-31"
            placeholderTextColor={Colors.gray[400]}
            keyboardType="numbers-and-punctuation"
            maxLength={10}
          />
          <Text style={[styles.fieldLabel, { marginTop: Spacing.sm }]}>Relation *</Text>
          <TextInput
            style={styles.input}
            value={holder.relation}
            onChangeText={(text) => {
              const updated = [...holders]
              updated[idx] = { ...updated[idx], relation: text }
              setHolders(updated)
            }}
            placeholder="e.g. son, wife, friend"
            placeholderTextColor={Colors.gray[400]}
            maxLength={60}
          />
        </View>
      ))}
```

- [ ] **Step 5: Disable confirm button when holders are incomplete**

Find the confirm/pay button's `disabled` prop. Add:

```ts
          || holders.some((h) => !h.full_name.trim() || !h.date_of_birth || !h.relation.trim())
```

- [ ] **Step 6: TypeScript check**

```bash
cd rawaq-mobile && npx tsc --noEmit 2>&1 | grep -v node_modules | head -20
```

Expected: no output.

- [ ] **Step 7: Commit**

```bash
cd rawaq-mobile && git add "app/events/[id].tsx"
git commit -m "feat(mobile): add group size stepper and dependent holder forms to event booking"
```
