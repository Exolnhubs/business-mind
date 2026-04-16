# Group Booking with Dependent Ticket Holders — Design Spec

**Date:** 2026-04-16
**Status:** Approved

---

## Goal

Allow a logged-in user to purchase multiple tickets for the same event occurrence in a single transaction. Tickets 2+ require the buyer to enter dependent holder details (full name, date of birth, relation). The primary ticket holder is implicit from the logged-in profile. One payment transaction covers the whole group.

---

## Constraints

- Each ticket in the group consumes one capacity spot on the occurrence.
- Group size is bounded by `events.max_group_size` (organizer-configured, default 5 when null).
- Promo code discount applies to the primary ticket only (ticket 1). Extra tickets pay full price.
- Primary holder info comes from the authenticated user's profile — no form required.
- Dependent holder forms (tickets 2+) must all be filled before payment can proceed.

---

## Section 1: Database

### 1a. `events` table — new column

```sql
ALTER TABLE events
  ADD COLUMN max_group_size INT NULL;
-- NULL means use the system default of 5.
```

### 1b. `bookings` table — new column

```sql
ALTER TABLE bookings
  ADD COLUMN group_size INT NOT NULL DEFAULT 1;
```

`group_size` is the number of capacity spots this booking consumes. All existing bookings default to 1 (no change in behaviour).

### 1c. `booking_holders` table — new

```sql
CREATE TABLE booking_holders (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id    UUID        NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  full_name     TEXT        NOT NULL CHECK (char_length(full_name) BETWEEN 1 AND 120),
  date_of_birth DATE        NOT NULL,
  relation      TEXT        NOT NULL CHECK (char_length(relation) BETWEEN 1 AND 60),
  position      INT         NOT NULL CHECK (position >= 2),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (booking_id, position)
);

-- RLS: owner can read their own holders; organizer of the event can read all holders for their events.
ALTER TABLE booking_holders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner can read" ON booking_holders
  FOR SELECT USING (
    booking_id IN (SELECT id FROM bookings WHERE user_id = auth.uid())
  );
```

### 1d. DB trigger update — `bookings_count` increment

The existing trigger that increments `event_occurrences.bookings_count` on booking insert/update currently adds 1. It must be updated to add `NEW.group_size` (or subtract `OLD.group_size` on cancel).

**File:** `rawaq-web/supabase/migrations/00023_booking_payment_trigger.sql` (or whichever migration manages this trigger) — new migration wraps the update.

---

## Section 2: API changes

### 2a. Validation schema — `lib/validations/bookings.ts`

Add to `CreateBookingSchema`:

```ts
group_size: z.number().int().min(1).max(10).default(1),
holders: z.array(z.object({
  full_name:     z.string().min(1).max(120),
  date_of_birth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD format'),
  relation:      z.string().min(1).max(60),
  position:      z.number().int().min(2),
})).optional().default([]),
```

### 2b. `POST /api/payments/initiate` — `app/api/payments/initiate/route.ts`

New validation steps inserted **after** the existing occurrence capacity check:

1. **Group size cap**
   ```ts
   const maxGroup = event.max_group_size ?? 5
   if (input.group_size > maxGroup) {
     throw new ForbiddenException(`Maximum group size for this event is ${maxGroup}`)
   }
   ```

2. **Capacity check (updated)**
   ```ts
   if (
     occurrence.capacity !== null &&
     occurrence.bookings_count + input.group_size > occurrence.capacity
   ) {
     throw new ForbiddenException('Not enough spots available for this group size')
   }
   ```

3. **Holders count validation**
   ```ts
   if (input.holders.length !== input.group_size - 1) {
     throw new ApiException(422, 'Holder details must be provided for each extra ticket')
   }
   ```

4. **Price calculation**
   ```ts
   // Promo applies to primary ticket only
   const primaryPrice = Math.max(0, basePrice - discountAmount)
   const extraPrice   = basePrice * (input.group_size - 1)
   const totalAmount  = primaryPrice + extraPrice
   ```

5. **After booking is created — insert holders**
   ```ts
   if (input.holders.length > 0) {
     const holderRows = input.holders.map((h) => ({
       booking_id:    booking.id,
       full_name:     h.full_name,
       date_of_birth: h.date_of_birth,
       relation:      h.relation,
       position:      h.position,
     }))
     const { error } = await admin.from('booking_holders').insert(holderRows)
     if (error) throw error
   }
   ```

Store `group_size` on the booking row:
```ts
const bookingFields = {
  ...existingFields,
  group_size:          input.group_size,
  platform_fee_amount: round2(totalAmount * platformFeePct),
}
```

### 2c. `POST /api/bookings` (free bookings) — same changes

Apply identical group_size cap, capacity, holders count, price, and `booking_holders` insert logic. Free bookings skip the payment gateway but still need the holders stored.

---

## Section 3: Web UI — CheckoutForm

**File:** `rawaq-web/components/events/CheckoutForm.tsx`

### New state
```ts
const [groupSize, setGroupSize] = useState(1)
const [holders, setHolders]    = useState<HolderForm[]>([])

interface HolderForm {
  full_name:     string
  date_of_birth: string
  relation:      string
}
```

`holders` array length always equals `groupSize - 1`. When `groupSize` increases, append a blank `HolderForm`. When it decreases, pop from the end.

### Quantity stepper (rendered after ticket type selection)

```tsx
<div className="flex items-center justify-between">
  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
    Number of tickets
  </p>
  <div className="flex items-center gap-3">
    <button onClick={() => setGroupSize(g => Math.max(1, g - 1))}
      disabled={groupSize <= 1} className="btn-secondary px-3 py-1 text-lg">−</button>
    <span className="text-sm font-semibold w-4 text-center">{groupSize}</span>
    <button onClick={() => setGroupSize(g => Math.min(maxGroupSize, spotsLeft ?? maxGroupSize, g + 1))}
      disabled={groupSize >= effectiveMax} className="btn-secondary px-3 py-1 text-lg">+</button>
  </div>
  <p className="text-xs text-gray-400">Max {effectiveMax}</p>
</div>
```

`effectiveMax = Math.min(eventMaxGroupSize ?? 5, spotsLeft ?? Infinity)` — passed as a prop from the checkout page.

### Dependent holder forms (rendered when `groupSize ≥ 2`)

One card per extra ticket. Each card has three fields:
- **Full Name** — text input, required, maxLength 120
- **Date of Birth** — text input, placeholder `YYYY-MM-DD`, required, pattern validation
- **Relation** — text input, placeholder `e.g. son, wife, friend`, required, maxLength 60

The confirm/pay button is **disabled** until every holder card has all three fields non-empty.

### Updated price breakdown

```
Ticket price      100 SAR × 3
Promo (CODE10)    −10 SAR  (primary ticket only)
──────────────────────────────
Total             290 SAR
```

`basePrice × groupSize` shown as the ticket line; promo shown as applying to primary only.

### Updated `confirmBooking` payload

```ts
body: JSON.stringify({
  event_id:          eventId,
  occurrence_id:     occurrenceId,
  ticket_type_id:    selectedTypeId ?? null,
  promo_code:        promo?.valid ? promo.code : null,
  payment_option_id: selectedOptionId ?? 'simulated',
  group_size:        groupSize,
  holders:           holders.map((h, i) => ({ ...h, position: i + 2 })),
})
```

### `CheckoutForm` new props

```ts
maxGroupSize: number   // from checkout page, event.max_group_size ?? 5
spotsLeft:    number | null
```

The checkout page (`app/(app)/events/[id]/checkout/page.tsx`) passes these from the occurrence/event data it already has.

---

## Section 4: Mobile UI

**File:** `rawaq-mobile/app/events/[id].tsx`

### Quantity stepper

A `View` with `−` / `+` `TouchableOpacity` buttons flanking a count `Text`. Rendered below the ticket type selection and above the confirm CTA. Style matches existing mobile button patterns using `Colors`, `Spacing`, `Radius` tokens.

### Dependent holder forms

One `View` card per extra ticket (position 2+), rendered in a `ScrollView` section. Each card contains three `TextInput` fields matching the web design. Cards animate in/out as quantity changes (`groupSize` state drives `holders` array the same way as web).

### Confirm button label

```
Pay 290 SAR  (3 tickets)
```

Shown only for paid events; free events show `Join — Free (3 tickets)`.

### Submission

Same `/api/payments/initiate` endpoint, same payload shape as web.

---

## Section 5: Organizer — event editor

**Web:** `rawaq-web/app/(app)/organizer/events/[id]/edit/page.tsx` (and new event form)  
**Mobile:** Organizer event creation/edit screen

Add a **Max group size** number input:
- Label: "Max tickets per booking"
- Placeholder: "Default: 5"
- Type: integer, min 1, max 20, nullable
- Stored as `events.max_group_size`

### Attendee list

**Web:** `rawaq-web/app/(app)/organizer/events/[id]/attendees/page.tsx`

Each booking row that has `group_size > 1` shows a "👥 +N guests" badge. Expanding the row reveals the `booking_holders` data (full name, DOB, relation) for each dependent. Fetch `booking_holders` as a nested select on the attendees query.

---

## Section 6: Existing booking cancellation / refund

`group_size` is stored on the booking. When a booking is cancelled:
- The DB trigger already handles decrementing `bookings_count` — after the trigger update it will subtract `group_size` spots.
- `booking_holders` rows cascade-delete automatically via FK.
- Refund amount = full transaction amount (already stored on `payment_transactions`). No per-holder partial refund.

---

## What is NOT in scope

- Per-holder check-in (QR code per dependent) — future phase
- Partial group cancellation (cancel one dependent while keeping the rest) — future phase
- Per-holder gender restriction enforcement — dependents are not checked against event gender restrictions
- Promo code stacking across holders — promo always applies to primary ticket only
