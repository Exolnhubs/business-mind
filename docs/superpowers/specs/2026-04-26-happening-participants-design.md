# Happening Participants — Design Spec

**Date:** 2026-04-26
**Scope:** Add a "Show participants" entry point to the existing community-happening feature on both `rawaq-mobile` and `rawaq-web`. Tapping it opens a list of users who joined (RSVP'd) the happening, showing each user's avatar, display name, and platform signup date. Tapping a user navigates to their profile.

---

## 1. Background

Happenings are short-lived community posts. Members can RSVP via `POST /api/happenings/:id/rsvp`. RSVPs are stored in `happening_rsvps (happening_id, user_id, created_at)` with a trigger maintaining `happenings.rsvp_count`. Today the card only shows the count — there is no way to see who joined.

Relevant existing surfaces:
- Mobile card: `rawaq-mobile/components/happenings/HappeningDiscoveryCard.tsx`
- Mobile host: `rawaq-mobile/app/(tabs)/happenings.tsx`
- Mobile comments sheet (pattern reference): `rawaq-mobile/components/happenings/HappeningCommentsSheet.tsx`
- Web card: `rawaq-web/components/communities/HappeningCard.tsx`
- Web community page: `rawaq-web/app/(app)/communities/[slug]/page.tsx`
- User profile route: mobile `app/user/[id].tsx`, web `app/(app)/user/[id]/page.tsx`
- RSVP API: `rawaq-web/app/api/happenings/[id]/rsvp/route.ts`
- Schema: `rawaq-web/supabase/migrations/00042_happenings.sql`

`UserHappeningCard` is **out of scope** for this iteration.

## 2. Decisions

| Decision | Choice |
|---|---|
| Clients in scope | Both `rawaq-mobile` and `rawaq-web` |
| Card entry point | Small "👥 N joined ›" row above the existing action buttons |
| List presentation | Hybrid: bottom sheet (mobile) / centered modal (web) by default; "View all" link inside opens a full-screen route |
| "View all" threshold | Sheet/modal loads first 15; "View all" link appears only when `total > 15` |
| Ordering | Oldest RSVP first (chronological by `happening_rsvps.created_at` ASC) |
| Viewer auth | Any logged-in user (broader than RSVP gating, matches discover-feed visibility) |
| API style | Dedicated backend endpoint (matches existing `/api/...` pattern) |
| Cards updated | `HappeningDiscoveryCard` (mobile) and `HappeningCard` (web). `UserHappeningCard` is out of scope. |

## 3. Architecture

### 3.1 New API endpoint

`GET /api/happenings/:id/participants` — `rawaq-web/app/api/happenings/[id]/participants/route.ts`

- **Auth:** `requireAuth()` — any logged-in user. No community-membership check.
- **Query params:**
  - `limit` (default `15`, clamped 1–50)
  - `offset` (default `0`, must be ≥ 0)
- **Logic:**
  1. Validate happening exists. If not, throw `NotFoundException`. Expired happenings are allowed (history is preserved per migration 00073).
  2. Use `createSupabaseAdminClient()` so the read bypasses the `happening_rsvps: own read` RLS policy that would otherwise hide other users' rows.
  3. Query `happening_rsvps` joined to `profiles` (id, display_name, avatar_url, created_at), filtered by `happening_id`, ordered by `happening_rsvps.created_at ASC`, with `limit` + `offset`.
  4. Read `happenings.rsvp_count` for `total` (already maintained by trigger; no need for a separate count query).
- **Response:**
  ```json
  {
    "total": 23,
    "participants": [
      {
        "id": "uuid",
        "display_name": "Khalid",
        "avatar_url": "https://...",
        "joined_at": "2026-04-26T10:21:00Z",
        "platform_joined_at": "2025-08-14T07:11:00Z"
      }
    ]
  }
  ```
  - `joined_at` is the RSVP timestamp (used for stable ordering and potential future UI; not displayed in v1).
  - `platform_joined_at` is `profiles.created_at` (this is the date displayed under each user, per the user request).
- **Rate limit:** add `limiters.happeningParticipants` in `rawaq-web/lib/rate-limit.ts` (modest read-only quota) and call `checkRateLimit(limiters.happeningParticipants, ctx.userId)` in the handler.
- **Errors:** wrapped via existing `handleApiError`. Common cases: 401 (unauth), 404 (happening missing), 429 (rate limit), 500 (generic).

### 3.2 Mobile UI

#### a) Card row — `HappeningDiscoveryCard.tsx`

- Add a new tappable row inside `footer`, **above** the `actions` row:
  ```
  👥 12 joined ›
  ```
  Uses `Ionicons people-outline`, `Colors.gray[500]` text, chevron (`chevron-forward`).
- Always rendered (even if expired or count is 0; if count is 0 the row label reads `"No one joined yet"` and is non-interactive).
- New optional prop `onShowParticipants?: (h: HappeningDiscoveryItem) => void`. The row calls it when count > 0. Tap propagation to the card's outer `TouchableOpacity` is stopped.

#### b) Host wiring — `app/(tabs)/happenings.tsx`

- Add `selectedParticipants` state mirroring `selectedHappening`.
- Pass `onShowParticipants={setSelectedParticipants}` to `HappeningDiscoveryCard`.
- Render `<HappeningParticipantsSheet visible={!!selectedParticipants} happening={selectedParticipants} onClose={() => setSelectedParticipants(null)} />`.

#### c) Sheet — `components/happenings/HappeningParticipantsSheet.tsx` (new)

- Same `Modal` + slide-up layout as `HappeningCommentsSheet` (handle, header, close button).
- Header: title `"Participants"`, subtitle `"{total} joined"`.
- On open, fetches `apiGet('/api/happenings/' + id + '/participants?limit=15')`.
- List rows (no pagination inside the sheet — capped at 15):
  - Round avatar (left), display name (top), `"Joined Rawaq · {formatDate(platform_joined_at)}"` (bottom, muted).
  - The avatar **and** the row are tappable. Tap → `router.push('/user/' + id)`, then `onClose()`.
- Footer:
  - If `total > 15`: `"View all {total} participants ›"` button → `router.push('/happenings/' + id + '/participants')`, then `onClose()`.
  - Otherwise nothing.
- States: `Spinner` while loading; on error, surface via existing alert pattern; empty fallback `"No one has joined yet."`

#### d) Full-screen route — `app/happenings/[id]/participants.tsx` (new)

- Stack screen with header showing the happening body snippet (truncated) and community name.
- `FlatList` of participant rows identical to the sheet's row.
- Pagination: page size 15. `onEndReached` fires `apiGet('?limit=15&offset=' + currentLength)` until `participants.length >= total`.
- `RefreshControl` resets to first page.
- Tap → `/user/[id]`.

### 3.3 Web UI

#### a) Card row — `HappeningCard.tsx`

- Insert a tappable row above the existing actions block:
  ```html
  <button class="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-brand-700">
    <PeopleIcon /> 12 joined ›
  </button>
  ```
- Use whichever icon library the file already imports; otherwise an inline SVG. Match the `text-xs` + `text-gray-500` styling already used for muted metadata in this card.
- Always rendered. If count is 0, render label `"No one joined yet"` non-interactively.
- New optional prop `onShowParticipants?: (h: HappeningWithAuthor) => void`. The community page passes a handler that opens the modal.

#### b) Modal — `components/communities/HappeningParticipantsModal.tsx` (new)

- Centered overlay dialog matching the existing modal pattern in `rawaq-web` (reuse whatever community-area modals already use; do not introduce a new primitive).
- Header: `"Participants"` + `"{total} joined"`. Close button (X), Esc, and overlay-click all close.
- Loads `GET /api/happenings/:id/participants?limit=15` via the existing client fetch helper (`clientGetJson` or equivalent — match what `rawaq-web` already uses for similar reads).
- Rows: round avatar (`<img>` with initial fallback), display name, `"Joined Rawaq · {formattedDate}"`.
- Avatar and row wrapped in `<Link href={'/user/' + id}>` (closes modal on click).
- Footer: if `total > 15`, `<Link href={'/happenings/' + id + '/participants'}>View all {total} participants ›</Link>` (closes modal).
- States: spinner while loading; friendly error message on failure; empty fallback.

#### c) Community page wiring — `app/(app)/communities/[slug]/page.tsx`

- Hoist `selectedParticipantsHappening` state alongside the existing happening interaction state.
- Pass `onShowParticipants` to each `HappeningCard`.
- Render `<HappeningParticipantsModal happening={...} onClose={...} />` once at the page level.

#### d) Full-screen route — `app/(app)/happenings/[id]/participants/page.tsx` (new)

- Match the rendering pattern (server vs client) used by neighboring pages in `app/(app)/...`. The simplest fit is a server component that calls the API (or queries directly via the admin client + `requireAuth`) for the first page, and a client child for paginated "Load more".
- Page header shows the happening body snippet and community name with a link back.
- List with page size 15 and a "Load more" button until `participants.length >= total`.
- Each row links to `/user/{id}`.

### 3.4 Navigation

- Avatar tap → `/user/{id}` on both clients.
- Sheet/modal closes before navigation to avoid stack/overlay stacking.
- Full-screen route uses standard back navigation.

### 3.5 Errors and edge cases

| Case | Behavior |
|---|---|
| Happening not found | API returns 404 → client shows friendly error |
| Network/server error | Existing `apiGet`/client fetch error path; user can retry |
| Rate limit hit (429) | Friendly toast/alert from existing handler |
| `rsvp_count = 0` | Card shows "No one joined yet"; row not interactive; sheet not opened |
| Expired happening | Allowed; participants list still readable |
| RSVP added/removed while sheet open | Not auto-refreshed in v1; user can pull-to-refresh on full route. Acceptable given short-lived nature |

### 3.6 Testing

- **API:** unit test for `GET /api/happenings/:id/participants` covering: 401 unauth, 404 missing happening, default pagination, custom `limit`/`offset`, ordering by `joined_at ASC`, `total` reflects `rsvp_count`. Match testing conventions of nearby route files (e.g., `react/route.ts`, `rsvp/route.ts`).
- **Clients:** if the repo already has component tests for `HappeningCommentsSheet` or `HappeningCard`, add equivalent tests for the new sheet/modal. Otherwise no new test infra is introduced.

## 4. Out of scope (v1)

- Avatar previews on the card itself.
- `UserHappeningCard` integration.
- Real-time updates of the participants list while sheet/modal is open.
- Removing yourself from the list via this UI (existing RSVP toggle on the card already handles this).
- Localization beyond what the surrounding components already provide.

## 5. Files touched

**New:**
- `rawaq-web/app/api/happenings/[id]/participants/route.ts`
- `rawaq-web/components/communities/HappeningParticipantsModal.tsx`
- `rawaq-web/app/(app)/happenings/[id]/participants/page.tsx`
- `rawaq-mobile/components/happenings/HappeningParticipantsSheet.tsx`
- `rawaq-mobile/app/happenings/[id]/participants.tsx`

**Modified:**
- `rawaq-web/lib/rate-limit.ts` (add `happeningParticipants` limiter)
- `rawaq-web/components/communities/HappeningCard.tsx` (add row + prop)
- `rawaq-web/app/(app)/communities/[slug]/page.tsx` (modal state + wiring)
- `rawaq-mobile/components/happenings/HappeningDiscoveryCard.tsx` (add row + prop)
- `rawaq-mobile/app/(tabs)/happenings.tsx` (sheet state + wiring)
