# Spec — Event Blog (pre-booking discovery)

_Date: 2026-06-06 · Status: approved design, pre-implementation_
_Related analysis: `docs/analysis/01-business-core-analysis.md`, `02-software-structure-modules-analysis.md`_

## 1. Goal

Let organizers / individual hosts publish a **blog feed per event** — multiple
posts with media (images, short videos, links) — so prospective attendees can
discover what an event is about and get familiar **before booking**. The
`events/[id]` page links to the blog as a router link.

## 2. Decisions (locked)

| Question | Decision |
|---|---|
| Structure | **Multiple posts per event** (a blog feed), not a single page. |
| Media | Images **and** short videos uploaded to Supabase storage (with caps); external links are a first-class media type. |
| Visibility | **Draft / published** workflow. A published post is visible to whoever can see its **event** (inherits event RLS — §4.2): for a public published event that means everyone incl. logged-out, enabling pre-booking discovery. Drafts visible only to the organizer/admin. |

## 3. Non-goals

- No comments/reactions on blog posts (events already have comments; revisit later).
- No video transcoding/adaptive streaming in v1 (raw upload + simple `<video>`).
- No scheduled publishing (publish is a manual state flip).
- Notifying followers/host-community on publish is a **Phase 2** option (see §8).

## 4. Architecture

New tables, reusing the existing upload infra (`/api/upload/sign`, storage from
migration 00025) and the established API/RLS/trigger patterns. Logic that
enforces invariants (published count) lives in a DB trigger, consistent with the
codebase's DB-as-source-of-truth posture.

### 4.1 Data model — migration `00094_event_blogs.sql`

```sql
CREATE TABLE IF NOT EXISTS event_blog_posts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id     UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  author_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title        TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  body         TEXT CHECK (body IS NULL OR char_length(body) <= 10000),
  status       TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
  published_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS event_blog_posts_event_idx
  ON event_blog_posts(event_id, status, published_at DESC);

CREATE TABLE IF NOT EXISTS event_blog_media (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id       UUID NOT NULL REFERENCES event_blog_posts(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL CHECK (kind IN ('image','video','link')),
  url           TEXT NOT NULL,
  title         TEXT CHECK (title IS NULL OR char_length(title) <= 200),  -- link-card title
  thumbnail_url TEXT,
  caption       TEXT CHECK (caption IS NULL OR char_length(caption) <= 500),
  position      INT NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS event_blog_media_post_idx
  ON event_blog_media(post_id, position);

-- Denormalized published-post count for the event-page link badge
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS blog_posts_count INT NOT NULL DEFAULT 0;
```

**`published_at` invariant (BEFORE INSERT OR UPDATE trigger on
`event_blog_posts`):** if `status='published'` and `published_at IS NULL` → set
`published_at = NOW()`; if `status='draft'` → leave `published_at` as-is
(preserved across publish→draft→publish so the original publish time isn't lost —
unpublishing hides the post but keeps its history). This makes "published ⇒
published_at non-null" hold regardless of whether the row was **created** as
published or **patched** to published.

`blog_posts_count` is maintained by a separate AFTER trigger on
`event_blog_posts` that counts only `status='published'` rows (increment on
insert-published and draft→published, decrement on published→draft and
delete-of-published). `updated_at` touch trigger via the existing
`touch_updated_at()`.

### 4.2 RLS

Blog visibility must **inherit the event's visibility**, not just check
`status='published'`. Event RLS (migration 00041) gates on `is_published`,
`is_cancelled`, `is_private`, and `visibility_type` + community membership. A blog
post on a private, cancelled, unpublished, or community-scoped event must follow
the same rules, or it would leak event content.

RLS subqueries do **not** automatically re-apply the referenced table's policies,
so we encapsulate the visibility predicate in a `SECURITY DEFINER` helper and call
it from the blog policies (and ideally refactor the 00041 event policy to use the
same helper, keeping one source of truth):

```sql
-- is_event_visible_to_caller(p_event_id UUID) RETURNS BOOLEAN
-- TRUE when the calling user (auth.uid(), may be NULL/anon) is allowed to see the
-- event row, replicating the 00041 logic:
--   is_published AND NOT is_cancelled
--   AND (NOT is_private OR organizer_id = auth.uid() OR is_admin())
--   AND ( visibility_type IN ('city','national')
--         OR organizer_id = auth.uid() OR is_admin()
--         OR (visibility_type IN ('micro','interest')
--             AND caller is an active member of a tagged community) )
```

```sql
ALTER TABLE event_blog_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_blog_media ENABLE ROW LEVEL SECURITY;
```

- `event_blog_posts`
  - public `SELECT` where `status='published' AND is_event_visible_to_caller(event_id)`.
  - organizer `SELECT`/`ALL` where the post's event has `organizer_id = auth.uid()`
    (covers reading own drafts + full management, regardless of event visibility).
  - admin `ALL` via `is_admin()`.
- `event_blog_media`
  - public `SELECT` where the parent post is published **and** the parent event is
    visible to the caller (mirror the post predicate via an `EXISTS` join).
  - organizer/admin `SELECT`/`ALL` mirroring the parent post's ownership.

Consequence: unpublishing/cancelling/privatizing an event, or tightening its
`visibility_type`, automatically hides its blog from the public without touching
post rows.

## 5. Media handling

There is currently **no `blog-media` upload type** in `/api/upload/sign` (only
`avatar`, `event-cover`, `comment-media`). This feature adds one.

- New storage bucket `blog-media` (migration 00094) + a `blog-media` entry in the
  `BUCKET_CONFIG`/`ALLOWED_MIME` of **both** `app/api/upload/sign/route.ts` and
  `app/api/upload/route.ts`. Config: `maxBytes = 50 MB`, mimes =
  `image/jpeg|png|webp|gif` + `video/mp4|quicktime|webm`, with its own per-min/
  per-hour rate caps. Path stays `{userId}/{ts}.ext` (the existing own-folder
  upload RLS pattern).
- Per-kind caps enforced in `lib/validations/blog.ts` (zod) since the bucket has a
  single `maxBytes`:
  - Images: ≤10 MB; `image/png|jpeg|webp|gif`.
  - Videos: ≤60 s, ≤50 MB; `video/mp4|webm|quicktime`. Duration checked
    client-side pre-upload (best-effort); size enforced server-side.
  - Links: validated URL; organizer-supplied `title`/`thumbnail_url`/`caption`
    (no server-side scraping in v1).
- Media attached to a post by inserting `event_blog_media` rows with `position`
  ordering.

### 5.1 Draft media privacy (explicit decision)

All existing Supabase buckets are **public** (`avatars`, `event-covers`,
`comment-media`), relying on unguessable `{userId}/{timestamp}` paths rather than
auth-gated reads. `blog-media` **follows the same model**: a draft post's media
is technically reachable by direct URL, but the URL is held only by the uploader
until publish, and the post itself is not linked anywhere while draft. We
explicitly accept URL-level public exposure for draft media — consistent with the
rest of the platform.

> If a stronger guarantee is ever required, the hardening path is a **private**
> `blog-media` bucket with short-lived signed read URLs, swapped in without schema
> change. Out of scope for v1.

## 6. API — `app/api/events/[id]/blog/`

- `GET /api/events/[id]/blog` — list posts with ordered media.
  - Anonymous / non-organizer: published only.
  - Organizer of the event: published + drafts.
- `POST /api/events/[id]/blog` — create a post (organizer of that event or admin).
  Accepts title, body, status, and an ordered media array.
- `PATCH /api/events/[id]/blog/[postId]` — edit; flipping to `published` stamps
  `published_at` (idempotent if already published). Replace/reorder media.
- `DELETE /api/events/[id]/blog/[postId]` — delete (cascades media).

**Authorization (all writes):** `requireAuth`, then permit when the caller is the
event's organizer (`events.organizer_id = auth.uid()`) **or** a platform
admin/owner (`is_admin()`). Authoring a blog is gated by **event ownership**, not
by organizer-approval status — if you can own/edit the event you can blog it; an
unapproved organizer has no published events to blog anyway. zod validation;
rate-limit on create (reuse the `limiters` pattern). Reads use the RLS rules in
§4.2 (anon sees published+visible; owner sees own drafts; admin sees all).

## 7. UI

- `app/(app)/events/[id]/page.tsx` — add an **"Updates / Blog" router link**
  (label + count badge from `events.blog_posts_count`) shown only when
  `blog_posts_count > 0`, positioned near the event details and before the
  booking CTA.
- `app/(app)/events/[id]/blog/page.tsx` (new) — public post feed:
  chronological (newest published first), each post rendering title, body, and a
  media gallery (image grid, inline `<video controls>`, link cards). Reachable
  logged-out.
- Organizer editor under `app/(app)/organizer/events/` — create/edit/publish
  posts and manage media for events they own (draft preview included).
- Shared post/media components in `components/`.

## 8. Optional Phase 2 (not in this spec)

When an organizer **publishes** a blog post, notify their host-community members
(bridges with the Host Community feature) via a new `notification_type`
(`event_blog_published`) emitted from a trigger or the publish handler. Deferred
to keep this spec scoped.

## 9. Testing

- **Count trigger**: `blog_posts_count` accurate across insert-published,
  draft→published, published→draft, delete-of-published; drafts never counted.
- **`published_at` invariant**: non-null after **create-as-published** and after
  PATCH publish; preserved across publish→draft→publish; covered alongside the
  count tests.
- **RLS visibility inheritance**: a published post on a private / cancelled /
  unpublished / `micro`/`interest`-scoped event is hidden from anon and
  non-member callers, but visible to the organizer and admin; a published post on
  a public (`city`/`national`) published event is visible to anon. Non-owner
  organizer cannot read/edit another's drafts.
- **API authz**: event owner and admin can write; other users (incl. other
  organizers) get 403; publish stamps `published_at`; media ordering preserved;
  cascade delete removes media.
- **Media validation**: oversized image/video and disallowed mime rejected
  (server `upload/sign` + `lib/validations/blog.ts`); invalid link URL rejected;
  `blog-media` upload type accepted.
- **UI**: event page shows the blog link only when `blog_posts_count > 0`; blog
  page renders image/video/link kinds; logged-out access works for a public
  event.

## 10. Affected files (anticipated)

- `rawaq-web/supabase/migrations/00094_event_blogs.sql` (new — tables, `published_at` + count triggers, `is_event_visible_to_caller` helper, RLS, `blog-media` bucket)
- `rawaq-web/app/api/events/[id]/blog/route.ts` (new — GET/POST)
- `rawaq-web/app/api/events/[id]/blog/[postId]/route.ts` (new — PATCH/DELETE)
- `rawaq-web/lib/validations/blog.ts` (new, zod — post + per-kind media caps)
- `rawaq-web/app/api/upload/sign/route.ts` + `app/api/upload/route.ts` (add `blog-media` type)
- `rawaq-web/app/(app)/events/[id]/blog/page.tsx` (new)
- `rawaq-web/app/(app)/events/[id]/page.tsx` (add blog router link gated on `blog_posts_count > 0`)
- Organizer blog editor under `app/(app)/organizer/events/` + `components/`
- `rawaq-web/types/database.ts` (new tables, `events.blog_posts_count`)

## 11. Open implementation notes

- `is_event_visible_to_caller` should be the single source of truth; refactoring
  the 00041 event SELECT policy to call it is preferred but optional — if skipped,
  keep the two predicates byte-for-byte equivalent and add a test that they agree.
- Video duration check is best-effort client-side; server enforces size only —
  acceptable for v1, revisit if abuse appears.
