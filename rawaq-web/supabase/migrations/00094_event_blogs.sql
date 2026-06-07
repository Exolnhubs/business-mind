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
GRANT EXECUTE ON FUNCTION is_event_owner(UUID) TO anon, authenticated, service_role;

DROP POLICY IF EXISTS "blog_posts: public read published+visible" ON event_blog_posts;
CREATE POLICY "blog_posts: public read published+visible"
  ON event_blog_posts FOR SELECT
  USING (status = 'published' AND is_event_visible_to_caller(event_id));

DROP POLICY IF EXISTS "blog_posts: owner read" ON event_blog_posts;
CREATE POLICY "blog_posts: owner read"
  ON event_blog_posts FOR SELECT
  USING (is_event_owner(event_id) OR is_admin());

DROP POLICY IF EXISTS "blog_posts: owner write" ON event_blog_posts;
CREATE POLICY "blog_posts: owner write"
  ON event_blog_posts FOR ALL
  USING (is_event_owner(event_id) OR is_admin())
  WITH CHECK (is_event_owner(event_id) OR is_admin());

DROP POLICY IF EXISTS "blog_media: public read" ON event_blog_media;
CREATE POLICY "blog_media: public read"
  ON event_blog_media FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM event_blog_posts p
    WHERE p.id = event_blog_media.post_id
      AND p.status = 'published'
      AND is_event_visible_to_caller(p.event_id)
  ));

DROP POLICY IF EXISTS "blog_media: owner all" ON event_blog_media;
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

DROP POLICY IF EXISTS "blog-media: public read" ON storage.objects;
CREATE POLICY "blog-media: public read"
  ON storage.objects FOR SELECT USING (bucket_id = 'blog-media');
DROP POLICY IF EXISTS "blog-media: auth upload" ON storage.objects;
CREATE POLICY "blog-media: auth upload"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'blog-media'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
DROP POLICY IF EXISTS "blog-media: own delete" ON storage.objects;
CREATE POLICY "blog-media: own delete"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'blog-media' AND (storage.foldername(name))[1] = auth.uid()::text);
