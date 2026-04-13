ALTER TABLE comments
  ADD COLUMN IF NOT EXISTS happening_id UUID REFERENCES happenings(id) ON DELETE CASCADE;

ALTER TABLE comments
  ALTER COLUMN event_id DROP NOT NULL;

ALTER TABLE comments
  DROP CONSTRAINT IF EXISTS comments_target_check;

ALTER TABLE comments
  ADD CONSTRAINT comments_target_check
  CHECK (
    ((event_id IS NOT NULL)::int + (happening_id IS NOT NULL)::int) = 1
  );

CREATE INDEX IF NOT EXISTS idx_comments_happening ON comments(happening_id);

COMMENT ON TABLE comments IS 'Threaded comments for events and happenings with mention support.';

DROP POLICY IF EXISTS "comments: public read" ON comments;
CREATE POLICY "comments: public read"
  ON comments FOR SELECT
  USING (
    is_deleted = FALSE
    AND (
      (
        event_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM events
          WHERE events.id = comments.event_id
            AND events.is_published = TRUE
            AND events.is_cancelled = FALSE
        )
      )
      OR (
        happening_id IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM happenings
          JOIN communities ON communities.id = happenings.community_id
          WHERE happenings.id = comments.happening_id
            AND happenings.expires_at > now()
            AND (
              communities.type = 'country'
              OR public.is_member_of_community(happenings.community_id)
              OR is_admin()
            )
        )
      )
    )
  );

DROP POLICY IF EXISTS "comments: organizer moderate" ON comments;
CREATE POLICY "comments: organizer moderate"
  ON comments FOR UPDATE
  USING (
    (
      comments.event_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM events
        WHERE events.id = comments.event_id
          AND events.organizer_id = auth.uid()
      )
    )
    OR (
      comments.happening_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM happenings
        WHERE happenings.id = comments.happening_id
          AND happenings.author_id = auth.uid()
      )
    )
  );
