-- ─────────────────────────────────────────────────────────────────────────────
-- 00025 · Supabase Storage: buckets, RLS, media_uploads rate-limit table,
--         comments.media_url
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Storage buckets ───────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  (
    'avatars', 'avatars', true,
    5242880,  -- 5 MB
    ARRAY['image/jpeg','image/png','image/webp','image/gif']
  ),
  (
    'event-covers', 'event-covers', true,
    52428800, -- 50 MB
    ARRAY['image/jpeg','image/png','image/webp','image/gif',
          'video/mp4','video/quicktime','video/webm']
  ),
  (
    'comment-media', 'comment-media', true,
    10485760, -- 10 MB
    ARRAY['image/jpeg','image/png','image/webp','image/gif',
          'video/mp4','video/quicktime','video/webm']
  )
ON CONFLICT (id) DO UPDATE SET
  file_size_limit    = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ── Storage RLS policies ──────────────────────────────────────────────────────
-- Public read for all three buckets
CREATE POLICY "avatars: public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

CREATE POLICY "event-covers: public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'event-covers');

CREATE POLICY "comment-media: public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'comment-media');

-- Authenticated upload — path must start with the user's own UUID
-- e.g. avatars/{user_id}/1234.jpg
CREATE POLICY "avatars: own folder upload"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'avatars'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "event-covers: auth upload"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'event-covers'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "comment-media: auth upload"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'comment-media'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Owners can delete their own objects
CREATE POLICY "avatars: own delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "event-covers: own delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'event-covers'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "comment-media: own delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'comment-media'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- ── media_uploads — rate-limit tracking table ─────────────────────────────────
CREATE TABLE IF NOT EXISTS media_uploads (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  bucket      TEXT        NOT NULL,
  path        TEXT        NOT NULL,
  size_bytes  BIGINT      NOT NULL,
  mime_type   TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_media_uploads_user_time
  ON media_uploads(user_id, created_at DESC);

ALTER TABLE media_uploads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "media_uploads: own read"
  ON media_uploads FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "media_uploads: admin read"
  ON media_uploads FOR SELECT
  USING (is_admin());

-- ── comments.media_url ────────────────────────────────────────────────────────
ALTER TABLE comments ADD COLUMN IF NOT EXISTS media_url TEXT;
