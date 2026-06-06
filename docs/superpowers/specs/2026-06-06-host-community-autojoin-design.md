# Spec — Host Community + Auto-Join on Booking

_Date: 2026-06-06 · Status: approved design, pre-implementation_
_Related analysis: `docs/analysis/01-business-core-analysis.md`, `02-software-structure-modules-analysis.md`_

## 1. Goal

Let an organizer / individual host run a personal "host community" — a branded
space their attendees can join to stay updated. After someone books any of the
host's events, prompt them to **join** that community or **discard** the prompt.

## 2. Decisions (locked)

| Question | Decision |
|---|---|
| What is "the organizer's community"? | **Auto-created, one per organizer** (a distinct "host" community, not a geo/interest one). |
| When is it created? | **Opt-in** — an **approved** organizer flips a toggle; community is created on enable. Not mandatory. |
| Discard behavior | **Transient** — discard dismisses the current prompt only; no persistence. Existing membership suppresses re-prompts (see §6.1 for the exact rule across membership statuses). |
| Plan limits | Host community is **exempt** from `plan_community_limit` (capped at 1 per owner by a unique index). |
| Prompt timing | Shown only after a **confirmed** booking — covers both the free path (`/api/bookings`, free/simulated `/api/payments/initiate`) and the async paid path (gateway callback/webhook). Never on a `pending` booking. |
| Authorization | Toggle requires `organizer_profiles.status='approved'` ("legit"). The host community is **auto-approved** (`approval_status='approved'`) — no admin review. Platform admin/owner may act on an organizer's behalf. |

## 3. Non-goals

- No per-event community linking (rejected in favor of per-organizer).
- No dismissal persistence / cooldown.
- No notifications to host-community members on new content (that bridge is in
  the Event Blog spec's Phase-2 note).
- Host communities are not part of the geo `community_hierarchy`.

## 4. Architecture

Reuse the existing `communities` + `community_memberships` infrastructure. A host
community is a normal `communities` row tagged `kind='host'`, owned via the
existing `owner_user_id`. This inherits membership, RLS join policy, feed, and
happenings for free.

### 4.1 Data model — migration `00093_host_communities.sql`

```sql
-- Discriminator: standard (geo/interest) vs host (organizer-owned brand space)
ALTER TABLE communities
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'standard'
    CHECK (kind IN ('standard', 'host'));

-- At most one host community per owner
CREATE UNIQUE INDEX IF NOT EXISTS communities_one_host_per_owner
  ON communities(owner_user_id)
  WHERE kind = 'host';

-- Fast lookup + opt-in flag on the organizer profile
ALTER TABLE organizer_profiles
  ADD COLUMN IF NOT EXISTS host_community_id UUID REFERENCES communities(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS host_community_enabled BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS communities_kind_idx ON communities(kind);
```

Host community rows are created with: `kind='host'`, `level='interest'`,
`type='other'`, `is_private=false`, `approval_status='approved'`,
`country = <organizer's primary country, default 'SA'>` (matches the app's event
defaults; the DB column default `'EG'` is **not** relied on),
`owner_user_id = <organizer>`, `created_by = <organizer>`. They get **no
`community_hierarchy` rows**.

### 4.2 Integrity & idempotent creation

`host_community_id` is a bare FK — it does not prove the target is `kind='host'`
or owned by the organizer, and two concurrent "enable" requests could both try to
create a row and collide on `communities_one_host_per_owner`. To prevent partial
state, creation goes through a single `SECURITY DEFINER` RPC, not ad-hoc inserts:

```sql
-- ensure_host_community(p_owner UUID, p_name TEXT, p_name_ar TEXT, p_country TEXT)
-- 1. INSERT the host community ... ON CONFLICT (owner_user_id) WHERE kind='host'
--    DO NOTHING, in one transaction.
-- 2. Ensure the owner community_memberships row exists (role 'owner', status 'active').
-- 3. Set organizer_profiles.host_community_id + host_community_enabled=true.
-- 4. RETURN the host community id (existing or new).
```

Because the whole flow is one transaction keyed on the partial unique index, it
is safe under concurrency and idempotent on repeat enable. A `CHECK`/guard
ensures `host_community_id`, when set, references a row with `kind='host'` and
`owner_user_id = organizer` (enforced in the RPC; optionally a validation trigger).

### 4.3 RLS

No new policies required — host communities are normal `communities` rows:
- Public read already covered by `"public read communities"`.
- Joining reuses `"user join community"` (`WITH CHECK user_id = auth.uid()`).
- Owner management reuses existing owner/admin policies.

Confirm during implementation that the public-read and join policies do not
exclude `kind='host'`; they should not, since they don't reference `kind`.

### 4.4 Discovery placement (where host communities appear)

Host communities must NOT pollute geo/interest browsing, but must remain
reachable. Explicit matrix:

| Surface | Host community shown? |
|---|---|
| `GET /api/communities` generic browse / `level` / `ancestor_slug` filters | **No** (`kind='standard'` only) |
| `GET /api/communities` `member_only=true` ("my communities") | **Yes** (a member sees their host communities) |
| `GET /api/communities` `user_id=<x>` (a user's public membership list) | **Yes** |
| `GET /api/communities/trending` | **No** (add `kind='standard'` filter, route reads `communities` directly) |
| `recommended=true` | **No** |
| Generic name search (`q`) in browse | **No** (avoids noise; discover via profile/prompt) |
| `GET /api/communities/[slug]` (direct) | **Yes** |
| Organizer/host public profile (`organizer/[id]`, `hosts/[username]`) | **Yes** |
| Booking auto-join prompt | **Yes** |

Implementation: `GET /api/communities` adds `kind='standard'` to `buildQuery`
except when `member_only` or `user_id` is set; `trending` adds the same filter to
its `communities` select. New `kind` column must be added to both routes' SELECT
column lists (and their `_LEGACY` fallbacks tolerate its absence).

## 5. Opt-in flow

**Endpoint:** `app/api/organizer/host-community/route.ts`
- `POST` (enable): `requireAuth` **and** require `organizer_profiles.status =
  'approved'` (a "legit" organizer); platform admin/owner may pass an explicit
  `organizer_id` to act on behalf. Calls the `ensure_host_community` RPC (§4.2),
  which is idempotent and concurrency-safe. Default name: organizer's
  `business_name` (fallback `display_name`) + suffix (e.g. "<name> Community"),
  with `business_name_ar` for `name_ar`; country = organizer's country, default
  `'SA'`. Organizer may rename later via the normal community edit flow.
- `PATCH` (disable): set `host_community_enabled=false`. The community row is
  retained (members keep access) but no new prompts are emitted. Re-enabling
  reuses the existing community (RPC returns the existing id).
- `GET`: return current host community summary + enabled flag for the dashboard.

The community-insert + owner-membership + audit-log steps currently inline in
`app/api/communities/route.ts POST` should be extracted into a shared helper so
the host-community path and the standard path do not diverge.

**UI:** toggle + community link in the organizer dashboard
(`app/(app)/organizer/` area). Out of scope to redesign the dashboard; add a
card/section.

## 6. Auto-join prompt flow

The prompt must appear **only for a confirmed booking**. Because confirmation
happens in three different places — immediately in `POST /api/bookings` (free),
immediately in the free/simulated branch of `POST /api/payments/initiate`, and
**asynchronously** in the gateway callback/webhook for real paid bookings — the
suggestion is **not** tied to any single POST response. Instead it is resolved on
the booking-confirmation surface, gated on `booking.status='confirmed'`.

### 6.1 Suggestion endpoint (single source)
New `GET /api/bookings/[id]/host-community-suggestion` (or fold the same object
into the existing `GET /api/bookings/[id]` response). Returns:

```ts
suggested_community: {
  id: string
  slug: string
  name: string
  name_ar: string | null
  cover_url: string | null
  member_count: number
} | null
```

Returns non-null when **all** hold:
1. The booking belongs to the caller and `booking.status = 'confirmed'`.
2. The event's `organizer_id` has `host_community_enabled = true` and a non-null
   `host_community_id`.
3. The caller's membership in that community does **not** already suppress the
   prompt, per the rule below.

**Suppression rule (resolves the removed/banned contradiction).** Look up the
caller's `community_memberships` row for the host community:

| Existing membership status | Suggest? | Rationale |
|---|---|---|
| (no row) | **Yes** | Never joined |
| `removed` | **Yes** | Join route reactivates removed users → re-offer is valid |
| `active` | No | Already in |
| `timed_out` | No | Still a member (temporary sanction) |
| `banned` | No | Join route blocks banned users — offering would dead-end |

Computed with the admin client. Any failure resolves to `null` (never blocks the
booking or confirmation view).

### 6.2 Convenience hint on immediate-confirm POSTs (optional)
For the two synchronous-confirm paths (`POST /api/bookings` free, and the
free/simulated branch of `POST /api/payments/initiate`), the response **may**
additionally include the same `suggested_community` object as an optimization so
the client can prompt without a follow-up fetch. The async paid path relies on
§6.1 at the confirmation screen. Both routes compute it via the same shared
helper as §6.1.

### 6.3 Client prompt
On the booking-confirmation surface (`bookings/[id]`, and the
`bookings/[id]?payment=success` return URL used by paid flows), if
`suggested_community` is non-null, show a join-or-discard prompt:
- **Join** → `POST /api/communities/[slug]/join` (the existing route already
  reactivates `removed` and inserts `member`/`owner` correctly). On success,
  dismiss.
- **Discard** → dismiss only. No server call, no persistence.

## 7. Edge cases

- Organizer disables the toggle after members joined → members retain access;
  prompt suppressed for new bookings.
- Attendee already `active`/`timed_out` member → no suggestion (per §6.1 table).
- `removed` member re-booking → suggestion shown; joining reactivates them.
- `banned` member re-booking → no suggestion (join would dead-end).
- Paid booking still `pending` (awaiting gateway) → no suggestion until the
  webhook/callback flips it to `confirmed`; then the confirmation screen surfaces
  it via §6.1.
- Paid booking that fails/expires → never `confirmed` → never suggested.
- Organizer is also the attendee (booking own event) → owner is already an active
  member, so no suggestion.
- Organizer not approved → toggle rejected; no host community, no suggestions.

## 8. Testing

- **Migration**: `communities_one_host_per_owner` enforced (second host insert
  for same owner conflicts); `kind` defaults to `standard`.
- **Idempotent/concurrent opt-in**: `ensure_host_community` called twice (incl.
  concurrently) yields exactly one community + one owner membership; no partial
  state; returns the same id. Disable flips `host_community_enabled` without
  deleting; re-enable reuses it.
- **Authorization**: non-approved organizer is rejected by the toggle; admin can
  enable on behalf via `organizer_id`.
- **Suggestion endpoint**: returns the community only when booking is
  `confirmed`, organizer enabled, and membership status ∈ {none, removed};
  returns `null` for `active`/`timed_out`/`banned`, disabled organizer, no host
  community, `pending`/failed booking, and bookings not owned by the caller.
- **Join from prompt**: `removed`→reactivated to `active`; subsequent suggestion
  is `null`.
- **Resilience**: suggestion-computation error resolves to `null`, never fails
  the booking or confirmation view.
- **Discovery matrix (§4.4)**: host communities excluded from browse/trending/
  recommended/search; present in `member_only`, `user_id`, direct slug, and
  organizer profile.

## 9. Affected files (anticipated)

- `rawaq-web/supabase/migrations/00093_host_communities.sql` (new — columns, index, `ensure_host_community` RPC)
- `rawaq-web/app/api/organizer/host-community/route.ts` (new — GET/POST/PATCH)
- `rawaq-web/lib/host-community.ts` (new — shared suggestion + creation helpers) or extend `lib/community-governance.ts`
- `rawaq-web/app/api/bookings/[id]/host-community-suggestion/route.ts` (new) **or** fold into `app/api/bookings/[id]/route.ts`
- `rawaq-web/app/api/bookings/route.ts` (optional convenience hint, §6.2)
- `rawaq-web/app/api/payments/initiate/route.ts` (optional convenience hint on free/simulated branch, §6.2)
- `rawaq-web/app/api/communities/route.ts` (exclude `kind='host'` except member_only/user_id; add `kind` to SELECT)
- `rawaq-web/app/api/communities/trending/route.ts` (exclude `kind='host'`; add `kind` to SELECT)
- `rawaq-web/types/database.ts` (community `kind`, organizer_profiles fields, suggested_community type)
- Organizer dashboard UI + booking-confirmation prompt UI (components/pages)

## 10. Open implementation notes

- Naming: confirm host-community default name format with stakeholders during
  implementation (English + Arabic suffix).
- The community-creation logic in `app/api/communities/route.ts POST` is sizable;
  extract the shared insert+owner-membership+audit-log steps into a helper so the
  host-community path and the normal path don't diverge (the `ensure_host_community`
  RPC encapsulates this on the DB side).
