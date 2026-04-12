# Event-Specific Currency Display

**Date:** 2026-04-12
**Status:** Approved

## Problem

`formatCurrency` in both `rawaq-mobile/lib/utils.ts` and `rawaq-web/lib/utils.ts` hardcodes `currency: 'SAR'`, ignoring the `currency` field already present on every `Event` row in Supabase. The discovery screen and event detail pages always show prices in SAR regardless of the event's actual country/currency.

## Solution

Update `formatCurrency` to accept a `currency` parameter (second arg, default `'SAR'`) and shift `locale` to the third arg. Fix all call sites to pass the event's currency.

### Signature change (both lib/utils.ts files)

```ts
// Before
formatCurrency(amount: number, locale = 'en'): string

// After
formatCurrency(amount: number, currency = 'SAR', locale = 'en'): string
```

The `Intl.NumberFormat` call's `currency` option becomes the dynamic parameter instead of the hardcoded `'SAR'`.

### Call sites — mobile (`rawaq-mobile`)

| File | Line | Before | After |
|---|---|---|---|
| `components/events/EventCard.tsx` | 147 | `formatCurrency(event.price ?? 0, locale)` | `formatCurrency(event.price ?? 0, event.currency, locale)` |
| `app/events/[id].tsx` | 660 | `formatCurrency(event.price ?? 0, locale)` | `formatCurrency(event.price ?? 0, event.currency, locale)` |
| `app/events/[id].tsx` | 775 | `formatCurrency(tt.price, tt.currency)` | `formatCurrency(tt.price, tt.currency, locale)` |
| `app/events/[id].tsx` | 836 | `formatCurrency(finalP, event.currency ?? 'SAR')` | `formatCurrency(finalP, event.currency, locale)` |

### Call sites — web (`rawaq-web`)

| File | Location | Change |
|---|---|---|
| `components/events/EventCard.tsx` | `getPriceDisplay` | Pass `event.currency` as currency arg for both min-price and fallback-price calls |
| `app/(app)/events/[id]/page.tsx` | ticket type price, event price, min/max range | Pass `ev.currency` as currency arg |
| `components/events/BookingFlow.tsx` | ticket price + proceed button | Pass `ticket.currency` / `currency` var as currency arg, add `locale` |
| `components/events/CheckoutForm.tsx` | all price display lines | Pass `t.currency` / `currency` var as currency arg, add `locale` |

### Ticket types on discovery card

`EventWithOrganizer.ticket_types` picks only `id`, `price`, `is_free`, `is_active` — no `currency`. Since all ticket types for an event share the event's currency, `event.currency` is used for ticket-type prices on the discovery card.

## Out of scope

- Adding `currency` to the `ticket_types` pick in `EventWithOrganizer` (unnecessary — same currency as event)
- Any currency conversion or display preferences
- Admin/organizer dashboard price formatting (SAR default acceptable there as those are platform-internal)
