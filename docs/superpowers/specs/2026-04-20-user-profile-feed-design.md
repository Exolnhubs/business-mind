---
title: Discoverable User Profile Feed
date: 2026-04-20
status: approved
---

# Discoverable User Profile Feed

## Goal

Transform `/user/[id]` from a minimal stats + reviews page into a rich social profile that surfaces a user's activity history and encourages interaction between platform members.

## Scope

- Enriched profile header with follow request flow (user-to-user)
- Tabbed feed: Activity (happenings) · Events (attended) · Communities (shared + all)
- Lightweight "Say Hi 👋" action
- DM/private messaging is explicitly out of scope — planned for a separate sprint

---

## Data Model

### New table: `user_follows`

```sql
user_follows (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id  uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  following_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status       text NOT NULL CHECK (status IN ('pending', 'accepted')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (follower_id, following_id)
)
```

- `pending` = follow request sent, not yet accepted
- `accepted` = mutual connection established
- Mutual follow = two accepted rows pointing at each other (`follower_id = A, following_id = B` AND `follower_id = B, following_id = A`)

Indexes: `(following_id, status)` for inbox queries; `(follower_id, following_id)` covered by the unique constraint.

### Existing table: `organizer_follows`

Unchanged. Organizer following remains a simple one-click action with no request state.

### Say Hi rate limiting

No new DB table. Rate-limited via Upstash using the existing `sw()` limiter pattern in `lib/rate-limit.ts`. Key: `say-hi:<viewer_id>:<target_id>`, limit: 1 per 24h. A notification row is inserted into the existing `notifications` table on success.

---

## Follow State Enum

All UI decisions derive from a single `FollowState` value computed server-side and passed as a prop to client components:

| State | Condition |
|---|---|
| `self` | `viewer.id === profile.id` |
| `none` | No row exists in `user_follows` |
| `pending_sent` | Row exists with `follower_id = viewer`, `status = pending` |
| `pending_received` | Row exists with `following_id = viewer`, `status = pending` |
| `accepted` | Row exists with `follower_id = viewer`, `status = accepted` |

`is_mutual` = `accepted` row exists in both directions.

---

## API Routes

All new routes live under `/app/api/users/[id]/`.

| Method | Route | Auth | Description |
|---|---|---|---|
| `GET` | `/api/users/[id]/profile` | optional | Profile data, follow state, shared community count |
| `POST` | `/api/users/[id]/follow` | required | Send follow request (`status = pending`) |
| `DELETE` | `/api/users/[id]/follow` | required | Cancel pending request or unfollow accepted |
| `POST` | `/api/users/[id]/follow/accept` | required | Accept an incoming pending request |
| `POST` | `/api/users/[id]/follow/decline` | required | Decline an incoming pending request (deletes row) |
| `GET` | `/api/users/[id]/happenings` | optional | Paginated happenings posted by user (public) |
| `GET` | `/api/users/[id]/events` | required + mutual | Paginated confirmed bookings (403 if not mutual) |
| `POST` | `/api/users/[id]/say-hi` | required | Rate-limited say-hi notification |

### `/api/users/[id]/profile` response shape

```ts
{
  profile: { id, display_name, avatar_url, city, bio, role, plan_id, created_at },
  stats: { happenings_count, events_attended, communities_count },
  follow_state: FollowState,
  is_mutual: boolean,
  say_hi_available: boolean,        // false if already sent in last 24h
  shared_communities: Community[],  // viewer and target are both active members
  avg_rating: number | null,
  total_reviews: number,
}
```

### `/api/users/[id]/happenings` — public, paginated

Query params: `limit` (default 10, max 20), `before` (cursor: ISO timestamp).
Returns happenings where `author_id = id` and `expires_at > now() OR created_at > (now - 30d)` — includes recent expired happenings as history. Ordered newest-first.

### `/api/users/[id]/events` — mutual follow gated

Returns 403 with `{ error: 'mutual_follow_required' }` if viewer is not authenticated or `is_mutual` is false. Otherwise returns confirmed bookings joined with event data, ordered by `events.start_at DESC`. Query params: `limit` (default 8, max 20), `before` cursor.

### `/api/users/[id]/say-hi`

Checks Upstash rate limit key `say-hi:<viewer_id>:<target_id>` (1 per 24h). On success: inserts notification for target user with type `say_hi` and metadata `{ from_user_id, from_display_name }`. Returns `{ sent: true }`. On rate limit: returns 429.

---

## Page Architecture

### `/app/(app)/user/[id]/page.tsx` — RSC (upgraded in place)

Server-side fetches (parallelised with `Promise.all`):
1. Profile row
2. Follow state (viewer → target and target → viewer rows)
3. Stats counts (happenings, bookings, community memberships)
4. Shared communities (intersection of viewer and target community memberships)
5. Average rating + review count
6. Say hi availability (Upstash check)

Streams the header immediately. Passes all data as props to `<UserProfileTabs>`.

### `components/social/UserProfileHeader.tsx` — server component

Renders avatar, name, plan badge, city, bio, rating, stats row, and the two action buttons. Accepts `followState` and `sayHiAvailable` props.

### `components/social/UserFollowButton.tsx` — `'use client'`

Manages optimistic follow state transitions. Renders differently per state:

| State | Render |
|---|---|
| `self` | `Edit Profile →` link |
| `none` | Brand-colored **Follow** button |
| `pending_sent` | Gray **Requested** button (click = cancel) |
| `pending_received` | **Accept** (green) + **Decline** (outline) side by side |
| `accepted` | Green outline **Following ✓** (click = unfollow) |

Reuses the same API call pattern as the existing `FollowButton` (organizer) but targets the new user follow routes.

### `components/social/SayHiButton.tsx` — `'use client'`

Single button: **Say Hi 👋**. On click: POST `/api/users/[id]/say-hi`, flip to **Sent 👋** (disabled). Visible when viewer is logged in and `state !== 'self'`. Hidden if `sayHiAvailable === false` on load (already sent today) — shown as **👋 Said hi today** (muted, disabled).

### `components/social/UserProfileTabs.tsx` — `'use client'`

Tab bar with three panels. Active tab stored in `useState`, defaults to `'activity'`. Each panel fetches its own data on first activation (not on mount), with loading skeletons.

Tab labels:
- **Activity** — always enabled
- **Events** — shows 🔒 in label when `!isMutual`; clicking shows inline gate prompt, not an API call
- **Communities** — always enabled

---

## Tab Content Detail

### Activity tab

Fetches `GET /api/users/[id]/happenings?limit=10`. Renders happening cards:
- Community name pill (links to `/communities/[slug]`)
- Body text (3-line clamp)
- Row: timestamp · 👍 reaction count · ✋ RSVP count
- Past happenings: subtle `Past` badge

Load-more button (cursor pagination). Empty state: *"No public activity yet."*

### Events tab

**Gate state (not mutual):** Full-panel message — *"You both need to follow each other to see attended events."* — with Follow button if `followState === 'none'`.

**Unlocked state:** Grid of `EventCard` components (reuses existing component with `priority={false}`). Data from `GET /api/users/[id]/events`. Shows past confirmed bookings, newest first. 8 per load, load-more. Empty state: *"No events attended yet."*

### Communities tab

Two sub-sections with different data sources:

**In common** — communities where both users are active members. Data comes from the server-side RSC fetch (no client request needed). Each row: community name, level pill, member count, **Join** button if viewer is not a member. Hidden entirely if viewer is not logged in. Empty: *"No communities in common."*

**All communities** — all public communities the viewed user belongs to. Fetched client-side on first tab activation via `GET /api/communities?member_only=true&user_id=[id]` (public communities only — private communities are excluded). Collapsible if more than 6. Same row style, no Join button shown here. Empty: *"Not a member of any public communities."*

---

## Notifications Integration

Follow request and say-hi both insert rows into the existing `notifications` table. The notifications page already handles display. Notification types added:

| type | text template |
|---|---|
| `follow_request` | `{name} wants to follow you` |
| `follow_accepted` | `{name} accepted your follow request` |
| `say_hi` | `{name} waved at you 👋` |

The pending follow requests count surfaces in the existing notification badge — no new inbox UI needed.

---

## Privacy Rules Summary

| Data | Visibility |
|---|---|
| Profile (name, bio, city, rating) | Public |
| Happenings posted | Public |
| Attended events | Mutual follow only |
| Communities (all) | Public (public communities only) |
| Communities in common | Logged-in viewer only |
| Say Hi button | Logged-in viewer, not self |
| Follow button | Logged-in viewer, not self |

Admins bypass all gates (same pattern used throughout the codebase).

---

## Error & Edge Cases

- Viewing own profile: no Follow or Say Hi buttons; show Edit Profile link
- Banned/deleted user: `notFound()` (same as current behaviour)
- Admin role: `notFound()` (same as current)
- Self-follow attempt: API returns 400
- Follow request to someone who already sent you one: API auto-accepts both and returns `accepted`
- Say Hi to yourself: button not rendered; API returns 400 as safety net
