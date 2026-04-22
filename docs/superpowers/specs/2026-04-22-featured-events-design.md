# Featured Events — Design Spec

**Date:** 2026-04-22
**Status:** Approved

## Summary

Organizers can mark published events as "featured" from their dashboard. Featured events pin to the top of the public events listing with a badge. Featuring lasts 7 days and is rate-limited by the organizer's plan.

---

## 1. Data Model

### Migration: two new columns on `events`

| Column | Type | Default | Purpose |
|---|---|---|---|
| `featured_at` | `TIMESTAMPTZ` | `NULL` | When the organizer last triggered featuring this month. Used for quota counting. |
| `featured_until` | `TIMESTAMPTZ` | `NULL` | Expiry timestamp (`featured_at + 7 days`). `NULL` or past = not featured. |

`is_featured` is **not** stored — it is computed at query time as `featured_until > NOW()`.

### Plan quota

Stored in the existing `features` JSON on `plan_definitions`:

```json
{ "featured_per_month": 3 }
```

- `0` or missing key → plan has no featuring access.
- Read via existing `getNumericPlanFeature(features, 'featured_per_month')`.

### Quota check (server-side)

Count distinct events the organizer has featured this calendar month:

```sql
SELECT COUNT(*) FROM events
WHERE organizer_id = $1
  AND featured_at >= date_trunc('month', NOW())
```

If `count >= limit` → 403. Same event re-featured in the same month reuses its existing slot (one slot per event per month, not per action).

---

## 2. API

### `POST /api/events/[id]/feature`

**Guards:**
- Authenticated as the event's organizer
- Event must be published and not cancelled
- Plan must have `featured_per_month > 0`

**Toggle logic:**

| Current state | Action | DB change |
|---|---|---|
| Featured (`featured_until > NOW()`) | Unfeature | `featured_until = NOW()` (expire immediately) |
| Not featured | Feature | quota check → `featured_at = NOW()`, `featured_until = NOW() + interval '7 days'` |

Quota check only runs on the **feature** action.

**Response:**
```json
{
  "featured_until": "2026-04-29T12:00:00Z",
  "quota": { "used": 2, "limit": 3 }
}
```
Returns `featured_until: null` when unfeaturing.

---

## 3. Organizer UI (`OrganizerStrings.tsx`)

The organizer dashboard events table gets a **Feature button** per row.

**Button states:**

| State | Appearance |
|---|---|
| Not featured | `☆ Feature` (outlined, secondary) |
| Actively featured | `★ Featured` + `"5d left"` expiry badge (amber) |
| Expired | Same as not featured |

**Disabled when:**
- Event is a draft or cancelled
- Quota exhausted and event is not currently featured
- Plan has no featuring access

**Quota indicator** above the table: `⭐ 2/3 featured this month`

- Fetched server-side alongside events, passed as a prop to the client component.
- Hidden entirely if plan has no featuring access.

**Optimistic updates:** button updates immediately on click; rolls back with an error toast on API failure.

---

## 4. Public Events Listing

**Featured rail** appears above the regular events grid:
- Separate query: `featured_until > NOW()`, ordered by `featured_until DESC`, max 6 events.
- Regular grid excludes featured event IDs to avoid duplicates.
- Section hidden entirely if no featured events exist.
- Each featured card shows a `⭐ Featured` badge using the existing `Badge` component (`amber` variant).

---

## 5. Helper additions to `lib/plans.ts`

```ts
export function getFeaturedPerMonth(plan: OrganizerPlanAccess | null): number {
  return getNumericPlanFeature(plan?.features, 'featured_per_month') ?? 0
}
```

---

## 6. Out of scope

- Admin override to force-feature events regardless of plan
- Notification to organizer when featuring expires
- Analytics on click-through rate of featured events
- Featured events in mobile app (separate ticket)
