# Event Blog (pre-booking discovery) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let organizers publish a per-event blog feed (posts + images/short-videos/links) so prospective attendees can explore an event before booking.

**Architecture:** Two new tables (`event_blog_posts`, `event_blog_media`) with a denormalized `events.blog_posts_count`. Blog RLS **inherits event visibility** via a shared `is_event_visible_to_caller` helper. Media reuses the existing signed-upload infra with a new `blog-media` bucket/type. The event page links to a public blog route.

**Tech Stack:** Next.js App Router, Supabase Postgres (migrations, RLS, triggers, SECURITY DEFINER helper), TypeScript, zod, Supabase Storage. Verification: `npm run type-check`, `npm run lint`, SQL assertions, manual API/UI checks. No test runner.

**Spec:** `docs/superpowers/specs/2026-06-06-event-blog-design.md`

---

## Conventions (read once)

- Same route/handler conventions as the rest of `app/api/` (`requireAuth`, `@/lib/errors` helpers, admin client, zod, `limiters`).
- Migrations in `rawaq-web/supabase/migrations/` (`0XXXX_`). Apply via the project's normal method; verify with the SQL blocks.
- After every code task: `npm run type-check` and `npm run lint` (from `rawaq-web/`). Commit per task.

## File Structure

- Create `rawaq-web/supabase/migrations/00094_event_blogs.sql` — tables, triggers (`published_at`, count), `is_event_visible_to_caller` helper, RLS, `blog-media` bucket + storage policies.
- Modify `rawaq-web/types/database.ts` — `event_blog_posts`, `event_blog_media`, `events.blog_posts_count`.
- Create `rawaq-web/lib/validations/blog.ts` — zod schemas + per-kind media caps.
- Modify `rawaq-web/app/api/upload/sign/route.ts` and `rawaq-web/app/api/upload/route.ts` — add `blog-media` type.
- Create `rawaq-web/app/api/events/[id]/blog/route.ts` (GET/POST) and `.../blog/[postId]/route.ts` (PATCH/DELETE).
- Create `rawaq-web/app/(app)/events/[id]/blog/page.tsx`; modify `rawaq-web/app/(app)/events/[id]/page.tsx` (link).
- Create organizer editor under `rawaq-web/app/(app)/organizer/events/` + components.

---

### Task 1: Migration — tables, triggers, visibility helper, RLS, bucket

**Files:**
- Create: `rawaq-web/supabase/migrations/00094_event_blogs.sql`

- [ ] **Step 1: Write the migration**

```sql
-- 00094 · Event blog: posts + media, visibility inheriting event RLS, blog-media bucket

-- 1. Tables
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
  title         TEXT CHECK (title IS NULL OR char_length(title) <= 200),
  thumbnail_url TEXT,
  caption       TEXT CHECK (caption IS NULL OR char_length(caption) <= 500),
  position      INT NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS event_blog_media_post_idx
  ON event_blog_media(post_id, position);

ALTER TABLE events ADD COLUMN IF NOT EXISTS blog_posts_count INT NOT NULL DEFAULT 0;

-- 2. published_at invariant
CREATE OR REPLACE FUNCTION fn_blog_post_published_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'published' AND NEW.published_at IS NULL THEN
    NEW.published_at := NOW();
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_blog_post_published_at ON event_blog_posts;
CREATE TRIGGER trg_blog_post_published_at
  BEFORE INSERT OR UPDATE ON event_blog_posts
  FOR EACH ROW EXECUTE FUNCTION fn_blog_post_published_at();

-- 3. blog_posts_count maintenance (published only)
CREATE OR REPLACE FUNCTION fn_blog_posts_count()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'published' THEN
      UPDATE events SET blog_posts_count = blog_posts_count + 1 WHERE id = NEW.event_id;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.status = 'published' THEN
      UPDATE events SET blog_posts_count = GREATEST(blog_posts_count - 1, 0) WHERE id = OLD.event_id;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.status <> 'published' AND NEW.status = 'published' THEN
      UPDATE events SET blog_posts_count = blog_posts_count + 1 WHERE id = NEW.event_id;
    ELSIF OLD.status = 'published' AND NEW.status <> 'published' THEN
      UPDATE events SET blog_posts_count = GREATEST(blog_posts_count - 1, 0) WHERE id = NEW.event_id;
    END IF;
  END IF;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS trg_blog_posts_count ON event_blog_posts;
CREATE TRIGGER trg_blog_posts_count
  AFTER INSERT OR UPDATE OF status OR DELETE ON event_blog_posts
  FOR EACH ROW EXECUTE FUNCTION fn_blog_posts_count();

-- updated_at touch (reuse existing touch_updated_at())
DROP TRIGGER IF EXISTS touch_event_blog_posts_updated_at ON event_blog_posts;
CREATE TRIGGER touch_event_blog_posts_updated_at
  BEFORE UPDATE ON event_blog_posts
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- 4. Shared event-visibility helper (mirrors 00041 event SELECT policy)
CREATE OR REPLACE FUNCTION is_event_visible_to_caller(p_event_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM events e
    WHERE e.id = p_event_id
      AND e.is_published = TRUE
      AND e.is_cancelled = FALSE
      AND (e.is_private = FALSE OR e.organizer_id = auth.uid() OR is_admin())
      AND (
        e.visibility_type IN ('city','national')
        OR e.organizer_id = auth.uid()
        OR is_admin()
        OR (
          e.visibility_type IN ('micro','interest')
          AND EXISTS (
            SELECT 1 FROM event_communities ec
            JOIN community_memberships cm ON cm.community_id = ec.community_id
            WHERE ec.event_id = e.id
              AND cm.user_id = auth.uid()
              AND cm.status = 'active'
          )
        )
      )
  );
$$;
REVOKE ALL ON FUNCTION is_event_visible_to_caller(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION is_event_visible_to_caller(UUID) TO anon, authenticated, service_role;

-- 5. RLS
ALTER TABLE event_blog_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_blog_media ENABLE ROW LEVEL SECURITY;

-- helper: caller owns the post's event
CREATE OR REPLACE FUNCTION is_event_owner(p_event_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM events e WHERE e.id = p_event_id AND e.organizer_id = auth.uid());
$$;
REVOKE ALL ON FUNCTION is_event_owner(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION is_event_owner(UUID) TO authenticated, service_role;

CREATE POLICY "blog_posts: public read published+visible"
  ON event_blog_posts FOR SELECT
  USING (status = 'published' AND is_event_visible_to_caller(event_id));

CREATE POLICY "blog_posts: owner read"
  ON event_blog_posts FOR SELECT
  USING (is_event_owner(event_id) OR is_admin());

CREATE POLICY "blog_posts: owner write"
  ON event_blog_posts FOR ALL
  USING (is_event_owner(event_id) OR is_admin())
  WITH CHECK (is_event_owner(event_id) OR is_admin());

CREATE POLICY "blog_media: public read"
  ON event_blog_media FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM event_blog_posts p
    WHERE p.id = event_blog_media.post_id
      AND p.status = 'published'
      AND is_event_visible_to_caller(p.event_id)
  ));

CREATE POLICY "blog_media: owner all"
  ON event_blog_media FOR ALL
  USING (EXISTS (
    SELECT 1 FROM event_blog_posts p
    WHERE p.id = event_blog_media.post_id AND (is_event_owner(p.event_id) OR is_admin())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM event_blog_posts p
    WHERE p.id = event_blog_media.post_id AND (is_event_owner(p.event_id) OR is_admin())
  ));

-- 6. blog-media storage bucket + policies (mirrors 00025 patterns)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'blog-media', 'blog-media', true,
  52428800, -- 50 MB
  ARRAY['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/quicktime','video/webm']
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE POLICY "blog-media: public read"
  ON storage.objects FOR SELECT USING (bucket_id = 'blog-media');
CREATE POLICY "blog-media: auth upload"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'blog-media'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
CREATE POLICY "blog-media: own delete"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'blog-media' AND (storage.foldername(name))[1] = auth.uid()::text);
```

- [ ] **Step 2: Apply**

Run: `npx supabase db push` (or your migration-apply command). Expected: `00094` applies cleanly.

- [ ] **Step 3: SQL verification**

```sql
-- create-as-published stamps published_at and bumps count
INSERT INTO event_blog_posts (event_id, author_id, title, status)
VALUES ('<EVENT_UUID>','<ORG_UUID>','Hello','published') RETURNING id, published_at; -- published_at NOT NULL
SELECT blog_posts_count FROM events WHERE id='<EVENT_UUID>';                          -- incremented

-- draft does not count; publish later bumps; unpublish decrements; published_at preserved
INSERT INTO event_blog_posts (event_id, author_id, title, status)
VALUES ('<EVENT_UUID>','<ORG_UUID>','Draft','draft') RETURNING id;                    -- count unchanged
UPDATE event_blog_posts SET status='published' WHERE title='Draft' RETURNING published_at; -- now set
UPDATE event_blog_posts SET status='draft'     WHERE title='Draft' RETURNING published_at; -- still set (preserved)

-- visibility helper: published post on an unpublished/private event hidden from anon
SELECT is_event_visible_to_caller('<PUBLIC_PUBLISHED_EVENT>');  -- expect TRUE as anon (run with anon role)
SELECT is_event_visible_to_caller('<UNPUBLISHED_EVENT>');       -- expect FALSE as anon
```

Expected: counts and timestamps behave as commented.

- [ ] **Step 4: Commit**

```bash
git add rawaq-web/supabase/migrations/00094_event_blogs.sql
git commit -m "feat(db): event blog tables, triggers, visibility-inheriting RLS, blog-media bucket"
```

---

### Task 2: Type definitions

**Files:**
- Modify: `rawaq-web/types/database.ts`

- [ ] **Step 1: Add row types**

Add `event_blog_posts` and `event_blog_media` row/insert/update types (mirror existing table-type style), and `blog_posts_count: number` to the `events` row type. Add a convenience API type:

```ts
export type BlogMediaKind = 'image' | 'video' | 'link'
export type EventBlogMedia = {
  id: string; post_id: string; kind: BlogMediaKind; url: string
  title: string | null; thumbnail_url: string | null; caption: string | null; position: number
}
export type EventBlogPost = {
  id: string; event_id: string; author_id: string; title: string; body: string | null
  status: 'draft' | 'published'; published_at: string | null; created_at: string; updated_at: string
  media: EventBlogMedia[]
}
```

- [ ] **Step 2: Verify** — `npm run type-check` PASS.
- [ ] **Step 3: Commit**

```bash
git add rawaq-web/types/database.ts
git commit -m "feat(types): event blog post/media types"
```

---

### Task 3: zod validation + per-kind media caps

**Files:**
- Create: `rawaq-web/lib/validations/blog.ts`

- [ ] **Step 1: Implement schemas**

```ts
import { z } from 'zod'

export const IMAGE_MAX_BYTES = 10 * 1024 * 1024 // 10 MB
export const VIDEO_MAX_BYTES = 50 * 1024 * 1024 // 50 MB
export const VIDEO_MAX_SECONDS = 60

export const BlogMediaInput = z.object({
  kind: z.enum(['image', 'video', 'link']),
  url: z.string().url(),
  title: z.string().max(200).optional().nullable(),
  thumbnail_url: z.string().url().optional().nullable(),
  caption: z.string().max(500).optional().nullable(),
  position: z.number().int().min(0).default(0),
})

export const CreateBlogPostSchema = z.object({
  title: z.string().min(1).max(200),
  body: z.string().max(10000).optional().nullable(),
  status: z.enum(['draft', 'published']).default('draft'),
  media: z.array(BlogMediaInput).max(20).default([]),
})

export const UpdateBlogPostSchema = CreateBlogPostSchema.partial()
```

> Byte/duration caps are enforced at upload time (Task 4 server + client). These schemas validate post shape and link URLs.

- [ ] **Step 2: Verify** — `npm run type-check && npm run lint` PASS.
- [ ] **Step 3: Commit**

```bash
git add rawaq-web/lib/validations/blog.ts
git commit -m "feat(lib): blog post/media zod schemas and caps"
```

---

### Task 4: Add `blog-media` upload type

**Files:**
- Modify: `rawaq-web/app/api/upload/sign/route.ts`
- Modify: `rawaq-web/app/api/upload/route.ts`

- [ ] **Step 1: Register the type in both files**

In each file's `BUCKET_CONFIG` add:

```ts
'blog-media': {
  bucket:      'blog-media',
  maxBytes:    50 * 1024 * 1024,
  ratePerMin:  5,
  ratePerHour: 30,
},
```

and in `ALLOWED_MIME` add:

```ts
'blog-media': ['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/quicktime','video/webm'],
```

(The `EXT_MAP` already covers these mimes.)

- [ ] **Step 2: Verify** — `npm run type-check && npm run lint` PASS.
- [ ] **Step 3: Manual check**

```bash
curl -X POST http://localhost:3000/api/upload/sign -b "<cookie>" \
  -H 'content-type: application/json' \
  -d '{"type":"blog-media","mimeType":"image/png","fileSize":1234}'   # => signed url + publicUrl
```

- [ ] **Step 4: Commit**

```bash
git add rawaq-web/app/api/upload/sign/route.ts rawaq-web/app/api/upload/route.ts
git commit -m "feat(api): blog-media upload type"
```

---

### Task 5: Blog list + create endpoint

**Files:**
- Create: `rawaq-web/app/api/events/[id]/blog/route.ts`

- [ ] **Step 1: Implement GET/POST**

```ts
import { NextRequest } from 'next/server'
import { requireAuth, optionalAuth } from '@/lib/auth'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { handleApiError, ok, created, ForbiddenException } from '@/lib/errors'
import { checkRateLimit, limiters } from '@/lib/rate-limit'
import { CreateBlogPostSchema } from '@/lib/validations/blog'

const POST_SELECT = 'id, event_id, author_id, title, body, status, published_at, created_at, updated_at, media:event_blog_media(id, post_id, kind, url, title, thumbnail_url, caption, position)'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const ctx = await optionalAuth()
    const admin = createSupabaseAdminClient()

    // Is the caller the event owner? (owners see drafts)
    let isOwner = false
    if (ctx?.userId) {
      const { data: ev } = await admin.from('events').select('organizer_id').eq('id', id).maybeSingle()
      isOwner = ev?.organizer_id === ctx.userId || ctx.role === 'admin'
    }

    // Use the RLS-enforcing server client for reads so visibility is applied.
    const supabase = await createSupabaseServerClient()
    let query = supabase.from('event_blog_posts').select(POST_SELECT).eq('event_id', id)
      .order('published_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
    if (!isOwner) query = query.eq('status', 'published')

    const { data, error } = await query
    if (error) throw error
    // sort media by position client-side or rely on order; normalize here:
    const posts = (data ?? []).map((p) => ({
      ...p,
      media: ((p as { media?: { position: number }[] }).media ?? []).sort((a, b) => a.position - b.position),
    }))
    return ok({ data: posts })
  } catch (err) { return handleApiError(err) }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const ctx = await requireAuth()
    await checkRateLimit(limiters.communityCreate, ctx.userId) // reuse an existing limiter; add limiters.blogCreate if preferred
    const admin = createSupabaseAdminClient()

    const { data: ev } = await admin.from('events').select('organizer_id').eq('id', id).maybeSingle()
    const isOwner = ev?.organizer_id === ctx.userId || ctx.role === 'admin'
    if (!isOwner) throw new ForbiddenException('Only the event organizer can post')

    const input = CreateBlogPostSchema.parse(await req.json())

    const { data: post, error } = await admin.from('event_blog_posts').insert({
      event_id: id, author_id: ctx.userId, title: input.title, body: input.body ?? null, status: input.status,
    }).select('id').single()
    if (error) throw error

    if (input.media.length > 0) {
      const rows = input.media.map((m, i) => ({
        post_id: post.id, kind: m.kind, url: m.url, title: m.title ?? null,
        thumbnail_url: m.thumbnail_url ?? null, caption: m.caption ?? null, position: m.position ?? i,
      }))
      const { error: mErr } = await admin.from('event_blog_media').insert(rows)
      if (mErr) throw mErr
    }
    return created({ id: post.id })
  } catch (err) { return handleApiError(err) }
}
```

> If you prefer a dedicated limiter, add `blogCreate` to `lib/rate-limit.ts` mirroring `communityCreate`, and swap it in.

- [ ] **Step 2: Verify** — `npm run type-check && npm run lint` PASS.
- [ ] **Step 3: Manual check**

```bash
# owner creates a published post
curl -X POST http://localhost:3000/api/events/<EVENT>/blog -b "<owner-cookie>" \
  -H 'content-type: application/json' \
  -d '{"title":"Sneak peek","status":"published","media":[{"kind":"link","url":"https://x.com","title":"X"}]}'
# anon lists -> sees the published post
curl http://localhost:3000/api/events/<EVENT>/blog
# non-owner POST -> 403
```

- [ ] **Step 4: Commit**

```bash
git add rawaq-web/app/api/events/[id]/blog/route.ts
git commit -m "feat(api): event blog list + create"
```

---

### Task 6: Blog edit/delete endpoint

**Files:**
- Create: `rawaq-web/app/api/events/[id]/blog/[postId]/route.ts`

- [ ] **Step 1: Implement PATCH/DELETE**

```ts
import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { handleApiError, ok, ForbiddenException, NotFoundException } from '@/lib/errors'
import { UpdateBlogPostSchema } from '@/lib/validations/blog'

async function assertOwner(admin: ReturnType<typeof createSupabaseAdminClient>, postId: string, userId: string, isAdmin: boolean) {
  const { data: post } = await admin
    .from('event_blog_posts')
    .select('id, event:events(organizer_id)')
    .eq('id', postId)
    .maybeSingle()
  if (!post) throw new NotFoundException('Blog post')
  const organizerId = (post.event as unknown as { organizer_id: string } | null)?.organizer_id
  if (organizerId !== userId && !isAdmin) throw new ForbiddenException('Not your post')
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; postId: string }> }) {
  try {
    const { postId } = await params
    const ctx = await requireAuth()
    const admin = createSupabaseAdminClient()
    await assertOwner(admin, postId, ctx.userId, ctx.role === 'admin')

    const input = UpdateBlogPostSchema.parse(await req.json())

    const patch: Record<string, unknown> = {}
    if (input.title !== undefined) patch.title = input.title
    if (input.body !== undefined) patch.body = input.body ?? null
    if (input.status !== undefined) patch.status = input.status
    // published_at is handled by the DB trigger when status -> published

    if (Object.keys(patch).length > 0) {
      const { error } = await admin.from('event_blog_posts').update(patch).eq('id', postId)
      if (error) throw error
    }

    if (input.media !== undefined) {
      await admin.from('event_blog_media').delete().eq('post_id', postId)
      if (input.media.length > 0) {
        const rows = input.media.map((m, i) => ({
          post_id: postId, kind: m.kind, url: m.url, title: m.title ?? null,
          thumbnail_url: m.thumbnail_url ?? null, caption: m.caption ?? null, position: m.position ?? i,
        }))
        const { error: mErr } = await admin.from('event_blog_media').insert(rows)
        if (mErr) throw mErr
      }
    }
    return ok({ id: postId })
  } catch (err) { return handleApiError(err) }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; postId: string }> }) {
  try {
    const { postId } = await params
    const ctx = await requireAuth()
    const admin = createSupabaseAdminClient()
    await assertOwner(admin, postId, ctx.userId, ctx.role === 'admin')
    const { error } = await admin.from('event_blog_posts').delete().eq('id', postId)
    if (error) throw error
    return ok({ deleted: true })
  } catch (err) { return handleApiError(err) }
}
```

- [ ] **Step 2: Verify** — `npm run type-check && npm run lint` PASS.
- [ ] **Step 3: Manual check**

```bash
curl -X PATCH http://localhost:3000/api/events/<EVENT>/blog/<POST> -b "<owner-cookie>" \
  -H 'content-type: application/json' -d '{"status":"published"}'    # publishes; published_at set
curl -X DELETE http://localhost:3000/api/events/<EVENT>/blog/<POST> -b "<owner-cookie>"  # deletes + media cascade
# non-owner PATCH/DELETE -> 403
```

- [ ] **Step 4: Commit**

```bash
git add rawaq-web/app/api/events/[id]/blog/[postId]/route.ts
git commit -m "feat(api): event blog edit + delete"
```

---

### Task 7: Public blog page + event-page link

**Files:**
- Create: `rawaq-web/app/(app)/events/[id]/blog/page.tsx`
- Modify: `rawaq-web/app/(app)/events/[id]/page.tsx`

- [ ] **Step 1: Build the public blog feed page**

Fetch `/api/events/<id>/blog` and render posts newest-first, each with title, body, and a media gallery: images in a grid, `video` as `<video controls src>`, `link` as a card (use `title`/`thumbnail_url`). Reachable logged-out. Follow existing page patterns (server component fetching via the app's fetch helper, or client component with `clientFetch`).

```tsx
// minimal shape — adapt to the design system
import { headers } from 'next/headers'

async function getPosts(eventId: string) {
  const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/events/${eventId}/blog`, { cache: 'no-store' })
  if (!res.ok) return []
  return (await res.json()).data as Array<{ id: string; title: string; body: string | null; media: Array<{ kind: string; url: string; title: string | null; thumbnail_url: string | null }> }>
}

export default async function EventBlogPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const posts = await getPosts(id)
  return (
    <main>
      <h1>Event updates</h1>
      {posts.map((p) => (
        <article key={p.id}>
          <h2>{p.title}</h2>
          {p.body && <p>{p.body}</p>}
          <div>
            {p.media.map((m, i) => {
              if (m.kind === 'image') return <img key={i} src={m.url} alt={m.title ?? ''} />
              if (m.kind === 'video') return <video key={i} src={m.url} controls />
              return <a key={i} href={m.url} target="_blank" rel="noreferrer">{m.title ?? m.url}</a>
            })}
          </div>
        </article>
      ))}
    </main>
  )
}
```

- [ ] **Step 2: Add the link on the event page**

On `events/[id]/page.tsx`, where the event is fetched, read `blog_posts_count` (already on the event row after migration). When `> 0`, render a router link to `/events/${id}/blog` with the count, placed near event details and before the booking CTA:

```tsx
{event.blog_posts_count > 0 && (
  <Link href={`/events/${event.id}/blog`}>Event updates ({event.blog_posts_count})</Link>
)}
```

Ensure the event-fetching query/select includes `blog_posts_count` (add it if the select is column-explicit).

- [ ] **Step 3: Verify** — `npm run type-check && npm run lint` PASS. Browser: public event with a published post shows the link; blog page renders image/video/link; logged-out works.

- [ ] **Step 4: Commit**

```bash
git add rawaq-web/app/\(app\)/events/[id]/blog/page.tsx rawaq-web/app/\(app\)/events/[id]/page.tsx
git commit -m "feat(ui): public event blog page + event-page link"
```

---

### Task 8: Organizer blog editor

**Files:**
- Create: `rawaq-web/app/(app)/organizer/events/[id]/blog/page.tsx` (or integrate into the existing organizer event-management UI)
- Create: `rawaq-web/components/blog/BlogPostEditor.tsx`

- [ ] **Step 1: Build the editor**

A client editor for the organizer to: list their posts (including drafts via the owner read path), create a post (title, body, status), upload media via the signed-upload flow (`POST /api/upload/sign` with `type: 'blog-media'`, then PUT to the signed URL, then store the returned `publicUrl` as a media item), add link items, reorder, and publish/unpublish/delete. Reuse the project's existing upload helper if one exists (search `createSignedUploadUrl`/`upload/sign` usages); otherwise implement the two-step upload inline. Enforce the Task 3 caps client-side before upload (image ≤10MB, video ≤50MB/≤60s via a temporary `<video>` `loadedmetadata` duration check).

Key calls:
- Create: `POST /api/events/<id>/blog`
- Edit/publish: `PATCH /api/events/<id>/blog/<postId>`
- Delete: `DELETE /api/events/<id>/blog/<postId>`

- [ ] **Step 2: Verify** — `npm run type-check && npm run lint` PASS. Browser: organizer creates a draft, uploads an image + a short video + a link, publishes; the public page and event link update; oversized/long video rejected client-side.

- [ ] **Step 3: Commit**

```bash
git add rawaq-web/app/\(app\)/organizer/events/ rawaq-web/components/blog/
git commit -m "feat(ui): organizer blog editor with media upload"
```

---

## Final verification

- [ ] `npm run type-check` PASS
- [ ] `npm run lint` PASS
- [ ] SQL assertions from Task 1 hold (published_at, count, visibility helper)
- [ ] RLS: published post on a private/cancelled/unpublished event hidden from anon; visible to owner/admin
- [ ] Manual flow: organizer drafts → uploads image/video/link → publishes → event page shows link → public blog renders → unpublish hides it
