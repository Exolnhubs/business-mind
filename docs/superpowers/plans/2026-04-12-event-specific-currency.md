# Event-Specific Currency Display Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hardcoded `'SAR'` in `formatCurrency` with the event's own `currency` field so the discovery screen (and all price display) shows the correct currency per event.

**Architecture:** Update the `formatCurrency` signature in both lib/utils.ts files to accept `(amount, currency, locale)`, then fix every call site to pass the event/ticket currency. No data model changes needed — `Event.currency` already exists in Supabase and the TypeScript types.

**Tech Stack:** TypeScript, React Native (Expo), Next.js 14, Intl.NumberFormat

---

## Files Modified

| File | Change |
|---|---|
| `rawaq-mobile/lib/utils.ts` | Add `currency` param to `formatCurrency` |
| `rawaq-mobile/components/events/EventCard.tsx` | Pass `event.currency` |
| `rawaq-mobile/app/events/[id].tsx` | Fix 3 call sites |
| `rawaq-web/lib/utils.ts` | Add `currency` param to `formatCurrency` |
| `rawaq-web/components/events/EventCard.tsx` | Pass `event.currency` in `getPriceDisplay` |
| `rawaq-web/app/(app)/events/[id]/page.tsx` | Fix 4 call sites |
| `rawaq-web/components/events/BookingFlow.tsx` | Fix 2 call sites |
| `rawaq-web/components/events/CheckoutForm.tsx` | Add `currency` to `PromoInput`, fix 6 call sites |

---

## Task 1: Update `formatCurrency` in mobile lib/utils.ts

**Files:**
- Modify: `rawaq-mobile/lib/utils.ts:17-23`

- [ ] **Step 1: Open the file and locate `formatCurrency`**

The function is at line 17. Current signature:
```ts
export function formatCurrency(amount: number, locale = 'en'): string {
  return new Intl.NumberFormat(locale === 'ar' ? 'ar-SA' : 'en-US', {
    style: 'currency',
    currency: 'SAR',
    minimumFractionDigits: 0,
  }).format(amount)
}
```

- [ ] **Step 2: Replace with the new signature**

Replace the entire function with:
```ts
export function formatCurrency(amount: number, currency = 'SAR', locale = 'en'): string {
  return new Intl.NumberFormat(locale === 'ar' ? 'ar-SA' : 'en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
  }).format(amount)
}
```

- [ ] **Step 3: Commit**

```bash
git add rawaq-mobile/lib/utils.ts
git commit -m "fix(mobile): accept currency param in formatCurrency"
```

---

## Task 2: Fix mobile EventCard.tsx

**Files:**
- Modify: `rawaq-mobile/components/events/EventCard.tsx:147`

- [ ] **Step 1: Locate the price display line**

Line 147 currently reads:
```tsx
{event.is_free ? 'Free' : formatCurrency(event.price ?? 0, locale)}
```

- [ ] **Step 2: Add `event.currency` as the second argument**

Change to:
```tsx
{event.is_free ? 'Free' : formatCurrency(event.price ?? 0, event.currency, locale)}
```

- [ ] **Step 3: Commit**

```bash
git add rawaq-mobile/components/events/EventCard.tsx
git commit -m "fix(mobile): show event-specific currency on discovery card"
```

---

## Task 3: Fix mobile events/[id].tsx

**Files:**
- Modify: `rawaq-mobile/app/events/[id].tsx` — lines 660, 775, 836

- [ ] **Step 1: Fix line 660 — event price info block**

Current:
```tsx
{event.is_free ? 'Free' : formatCurrency(event.price ?? 0, locale)}
```
Change to:
```tsx
{event.is_free ? 'Free' : formatCurrency(event.price ?? 0, event.currency, locale)}
```

- [ ] **Step 2: Fix line 775 — ticket type price in list**

Current:
```tsx
{tt.is_free ? 'Free' : formatCurrency(tt.price, tt.currency)}
```
Change to:
```tsx
{tt.is_free ? 'Free' : formatCurrency(tt.price, tt.currency, locale)}
```
*(Previously `tt.currency` was landing in the `locale` slot — now it correctly lands in the `currency` slot, and `locale` is properly passed.)*

- [ ] **Step 3: Fix line 836 — booking button label**

Current:
```tsx
: `Book Now — ${formatCurrency(finalP, event.currency ?? 'SAR')}`
```
Change to:
```tsx
: `Book Now — ${formatCurrency(finalP, event.currency, locale)}`
```
*(Drop the `?? 'SAR'` fallback — `event.currency` is a non-nullable `string` per the type, so the fallback is unnecessary.)*

- [ ] **Step 4: Commit**

```bash
git add rawaq-mobile/app/events/[id].tsx
git commit -m "fix(mobile): use event currency on detail and booking button"
```

---

## Task 4: Update `formatCurrency` in web lib/utils.ts

**Files:**
- Modify: `rawaq-web/lib/utils.ts:24-30`

- [ ] **Step 1: Open the file and locate `formatCurrency`**

Current at line 24:
```ts
export function formatCurrency(amount: number, locale: string = 'en') {
  return new Intl.NumberFormat(locale === 'ar' ? 'ar-SA' : 'en-US', {
    style: 'currency',
    currency: 'SAR',
    minimumFractionDigits: 0,
  }).format(amount)
}
```

- [ ] **Step 2: Replace with the new signature**

```ts
export function formatCurrency(amount: number, currency: string = 'SAR', locale: string = 'en') {
  return new Intl.NumberFormat(locale === 'ar' ? 'ar-SA' : 'en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
  }).format(amount)
}
```

- [ ] **Step 3: Commit**

```bash
git add rawaq-web/lib/utils.ts
git commit -m "fix(web): accept currency param in formatCurrency"
```

---

## Task 5: Fix web EventCard.tsx (discovery card)

**Files:**
- Modify: `rawaq-web/components/events/EventCard.tsx:35-39`

- [ ] **Step 1: Locate `getPriceDisplay`**

The function currently at lines 23-40:
```ts
function getPriceDisplay(
  event: EventWithOrganizer,
  locale: string,
  t: (key: string) => string,
): { label: string; isFree: boolean } {
  const active = (event.ticket_types ?? []).filter((ticket) => ticket.is_active)
  if (active.length > 0) {
    const paid = active.filter((ticket) => !ticket.is_free)
    if (paid.length === 0) return { label: t('events.free'), isFree: true }
    const prices = paid.map((ticket) => ticket.price)
    const min = Math.min(...prices)
    const max = Math.max(...prices)
    if (min === max) return { label: formatCurrency(min, locale), isFree: false }
    return { label: t('events.card.from').replace('{price}', formatCurrency(min, locale)), isFree: false }
  }
  if (event.is_free || !event.price) return { label: t('events.free'), isFree: true }
  return { label: formatCurrency(event.price, locale), isFree: false }
}
```

- [ ] **Step 2: Fix the three `formatCurrency` calls inside `getPriceDisplay`**

All three use `event.currency` (ticket types on a discovery card share the event's currency — `ticket_types` in `EventWithOrganizer` doesn't pick the `currency` field). Replace:

```ts
    if (min === max) return { label: formatCurrency(min, event.currency, locale), isFree: false }
    return { label: t('events.card.from').replace('{price}', formatCurrency(min, event.currency, locale)), isFree: false }
```
and:
```ts
  return { label: formatCurrency(event.price, event.currency, locale), isFree: false }
```

- [ ] **Step 3: Commit**

```bash
git add rawaq-web/components/events/EventCard.tsx
git commit -m "fix(web): show event-specific currency on discovery card"
```

---

## Task 6: Fix web events/[id]/page.tsx

**Files:**
- Modify: `rawaq-web/app/(app)/events/[id]/page.tsx` — lines 186, 193, 250, 251, 258

The variable holding the event is `ev` in this file.

- [ ] **Step 1: Fix line 186 — ticket type price**

Current:
```tsx
{tt.is_free ? 'Free' : formatCurrency(tt.price, ev.currency ?? 'SAR')}
```
Change to:
```tsx
{tt.is_free ? 'Free' : formatCurrency(tt.price, ev.currency)}
```
*(Previously `ev.currency ?? 'SAR'` was landing in the `locale` slot. Now it correctly lands in `currency`. Drop `?? 'SAR'` — `Event.currency` is non-nullable.)*

- [ ] **Step 2: Fix line 193 — event price (no ticket types)**

Current:
```tsx
{ev.is_free ? 'Free' : formatCurrency(ev.price ?? 0)}
```
Change to:
```tsx
{ev.is_free ? 'Free' : formatCurrency(ev.price ?? 0, ev.currency)}
```

- [ ] **Step 3: Fix lines 250-251 — min/max ticket range**

Current:
```tsx
<span className="text-2xl font-bold text-gray-900">{formatCurrency(min, ev.currency ?? 'SAR')}</span>
{max !== min && <span className="text-sm text-gray-500 ml-1">– {formatCurrency(max, ev.currency ?? 'SAR')}</span>}
```
Change to:
```tsx
<span className="text-2xl font-bold text-gray-900">{formatCurrency(min, ev.currency)}</span>
{max !== min && <span className="text-sm text-gray-500 ml-1">– {formatCurrency(max, ev.currency)}</span>}
```

- [ ] **Step 4: Fix line 258 — event price fallback**

Current:
```tsx
{ev.is_free ? 'Free' : formatCurrency(ev.price ?? 0)}
```
Change to:
```tsx
{ev.is_free ? 'Free' : formatCurrency(ev.price ?? 0, ev.currency)}
```

- [ ] **Step 5: Commit**

```bash
git add "rawaq-web/app/(app)/events/[id]/page.tsx"
git commit -m "fix(web): use event currency on event detail page"
```

---

## Task 7: Fix web BookingFlow.tsx and CheckoutForm.tsx

**Files:**
- Modify: `rawaq-web/components/events/BookingFlow.tsx` — lines 57, 213
- Modify: `rawaq-web/components/events/CheckoutForm.tsx` — lines 62, 74-84, 139, 166, 171, 181, 352-357, 400

### BookingFlow.tsx

- [ ] **Step 1: Fix line 57 — TicketCard price**

`TicketCard` receives a `ticket: TicketType` prop. `TicketType` has a `currency` field.

Current:
```tsx
{ticket.is_free ? 'Free' : formatCurrency(ticket.price, ticket.currency)}
```
Change to:
```tsx
{ticket.is_free ? 'Free' : formatCurrency(ticket.price, ticket.currency)}
```
*(No text change needed — `ticket.currency` is already the second arg. After the signature change, this now correctly lands in the `currency` slot instead of the `locale` slot. Nothing to edit on this line.)*

- [ ] **Step 2: Fix line 213 — proceed button label**

`currency` is a prop on `BookingFlow`. Locate the component props interface (around line 73) — it has `currency: string`.

Current:
```tsx
`Proceed to Checkout${selectedType ? ` — ${formatCurrency(basePrice, currency)}` : ''}`
```
Change to:
```tsx
`Proceed to Checkout${selectedType ? ` — ${formatCurrency(basePrice, currency)}` : ''}`
```
*(No text change needed — `currency` is already the second arg, which now correctly maps to the `currency` param after the signature change.)*

### CheckoutForm.tsx

- [ ] **Step 3: Fix line 62 — TicketSelector item price**

Current:
```tsx
{t.is_free ? 'Free' : formatCurrency(t.price, t.currency)}
```
*(No text change needed — `t.currency` is already the second arg and now correctly maps to `currency` param.)*

- [ ] **Step 4: Add `currency` prop to `PromoInput` and fix line 139**

The `PromoInput` component (lines 74-145) currently has no `currency` prop, so line 139 hardcodes `'SAR'`:
```tsx
`${formatCurrency(result.discount_amount ?? 0, 'SAR')} off`
```

Update the `PromoInput` props interface and function signature:

```tsx
// Before — props interface
function PromoInput({
  eventId,
  orderAmount,
  onApplied,
  onCleared,
}: {
  eventId: string
  orderAmount: number
  onApplied: (r: PromoValidationResult) => void
  onCleared: () => void
})

// After — props interface
function PromoInput({
  eventId,
  orderAmount,
  currency,
  onApplied,
  onCleared,
}: {
  eventId: string
  orderAmount: number
  currency: string
  onApplied: (r: PromoValidationResult) => void
  onCleared: () => void
})
```

Then fix line 139:
```tsx
// Before
`${formatCurrency(result.discount_amount ?? 0, 'SAR')} off`

// After
`${formatCurrency(result.discount_amount ?? 0, currency)} off`
```

- [ ] **Step 5: Pass `currency` to `PromoInput` at line 352**

Locate the `<PromoInput` JSX (around line 352):

```tsx
// Before
<PromoInput
  eventId={eventId}
  orderAmount={basePrice}
  onApplied={setPromo}
  onCleared={() => setPromo(null)}
/>

// After
<PromoInput
  eventId={eventId}
  orderAmount={basePrice}
  currency={currency}
  onApplied={setPromo}
  onCleared={() => setPromo(null)}
/>
```

- [ ] **Step 6: Verify lines 166, 171, 181, 400 — PriceBreakdown and Pay button**

These already pass `currency` (the `CheckoutFormProps.currency` prop) as the second arg. After the signature change they are automatically correct — no text edits needed:
- Line 166: `formatCurrency(basePrice, currency)` ✓
- Line 171: `formatCurrency(discountAmount, currency)` ✓
- Line 181: `formatCurrency(total, currency)` ✓
- Line 400: `formatCurrency(total, currency)` ✓

- [ ] **Step 7: Commit**

```bash
git add rawaq-web/components/events/BookingFlow.tsx rawaq-web/components/events/CheckoutForm.tsx
git commit -m "fix(web): use event currency in booking and checkout flow"
```

---

## Task 8: TypeScript type-check both apps

- [ ] **Step 1: Type-check mobile**

```bash
cd rawaq-mobile && npx tsc --noEmit
```
Expected: no errors related to `formatCurrency`.

- [ ] **Step 2: Type-check web**

```bash
cd rawaq-web && npx tsc --noEmit
```
Expected: no errors related to `formatCurrency`.

- [ ] **Step 3: Fix any type errors found, then commit if changes were needed**

```bash
git add -A
git commit -m "fix: resolve tsc errors from currency param refactor"
```

---

## Verification Checklist

After all tasks are complete, manually verify in the running apps:

- [ ] Mobile discovery screen: a non-SAR event (e.g. USD, AED, EGP) shows its correct currency symbol
- [ ] Mobile event detail page: price block and booking button show correct currency
- [ ] Mobile ticket type list: each ticket shows its own currency
- [ ] Web discovery grid: event cards show the event's currency, not SAR
- [ ] Web event detail page: price display and ticket range show correct currency
- [ ] Web checkout: ticket selector, price breakdown, and Pay button all show correct currency
- [ ] Web checkout: promo discount amount shows correct currency
