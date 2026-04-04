-- ── Migration 00042: Happenings Layer (Phase 3) ───────────────────────────────

-- ── Enums ─────────────────────────────────────────────────────────────────────

CREATE TYPE happening_type AS ENUM ('open_invite', 'info', 'question', 'alert');

-- ── Tables ────────────────────────────────────────────────────────────────────

CREATE TABLE happenings (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id   uuid        NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  author_id      uuid        NOT NULL REFERENCES profiles(id),
  type           happening_type NOT NULL DEFAULT 'open_invite',
  body           text        NOT NULL CHECK (char_length(body) BETWEEN 1 AND 280),
  lat            double precision,
  lng            double precision,
  expires_at     timestamptz NOT NULL DEFAULT (now() + interval '6 hours'),
  rsvp_count     int         NOT NULL DEFAULT 0,
  reaction_count int         NOT NULL DEFAULT 0,
  is_pinned      boolean     NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE happening_rsvps (
  happening_id uuid NOT NULL REFERENCES happenings(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES profiles(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (happening_id, user_id)
);

CREATE TABLE happening_reactions (
  happening_id uuid NOT NULL REFERENCES happenings(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES profiles(id),
  emoji        text NOT NULL DEFAULT '👍' CHECK (char_length(emoji) <= 8),
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (happening_id, user_id)
);

-- ── Indexes ───────────────────────────────────────────────────────────────────

CREATE INDEX happenings_community_expires_idx ON happenings(community_id, expires_at DESC);
CREATE INDEX happenings_author_idx            ON happenings(author_id);

-- ── Denormalized count triggers ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION fn_happening_rsvp_count()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE happenings SET rsvp_count = rsvp_count + 1 WHERE id = NEW.happening_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE happenings SET rsvp_count = GREATEST(rsvp_count - 1, 0) WHERE id = OLD.happening_id;
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION fn_happening_reaction_count()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE happenings SET reaction_count = reaction_count + 1 WHERE id = NEW.happening_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE happenings SET reaction_count = GREATEST(reaction_count - 1, 0) WHERE id = OLD.happening_id;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_happening_rsvp_count
  AFTER INSERT OR DELETE ON happening_rsvps
  FOR EACH ROW EXECUTE FUNCTION fn_happening_rsvp_count();

CREATE TRIGGER trg_happening_reaction_count
  AFTER INSERT OR DELETE ON happening_reactions
  FOR EACH ROW EXECUTE FUNCTION fn_happening_reaction_count();

-- ── Notification enum ─────────────────────────────────────────────────────────

ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'community_happening';

-- ── RLS ───────────────────────────────────────────────────────────────────────

ALTER TABLE happenings          ENABLE ROW LEVEL SECURITY;
ALTER TABLE happening_rsvps     ENABLE ROW LEVEL SECURITY;
ALTER TABLE happening_reactions ENABLE ROW LEVEL SECURITY;

-- happenings: community members can read active happenings
CREATE POLICY "happenings: member read"
  ON happenings FOR SELECT
  USING (
    expires_at > now()
    AND (
      -- public communities: anyone reads
      EXISTS (SELECT 1 FROM communities WHERE id = happenings.community_id AND type = 'country')
      -- OR caller is a member
      OR EXISTS (
        SELECT 1 FROM community_memberships
        WHERE community_id = happenings.community_id AND user_id = auth.uid()
      )
      OR is_admin()
    )
  );

-- happenings: community members can post
CREATE POLICY "happenings: member insert"
  ON happenings FOR INSERT
  WITH CHECK (
    author_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM community_memberships
      WHERE community_id = happenings.community_id AND user_id = auth.uid()
    )
  );

-- happenings: author or admin can delete
CREATE POLICY "happenings: author delete"
  ON happenings FOR DELETE
  USING (author_id = auth.uid() OR is_admin());

-- happenings: admin full
CREATE POLICY "happenings: admin update"
  ON happenings FOR UPDATE
  USING (is_admin());

-- rsvps: member can manage own
CREATE POLICY "happening_rsvps: own read"
  ON happening_rsvps FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "happening_rsvps: member insert"
  ON happening_rsvps FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM happenings h
      JOIN community_memberships cm ON cm.community_id = h.community_id
      WHERE h.id = happening_rsvps.happening_id AND cm.user_id = auth.uid()
        AND h.expires_at > now()
    )
  );

CREATE POLICY "happening_rsvps: own delete"
  ON happening_rsvps FOR DELETE USING (user_id = auth.uid());

-- reactions: same pattern as rsvps
CREATE POLICY "happening_reactions: own read"
  ON happening_reactions FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "happening_reactions: member insert"
  ON happening_reactions FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM happenings h
      JOIN community_memberships cm ON cm.community_id = h.community_id
      WHERE h.id = happening_reactions.happening_id AND cm.user_id = auth.uid()
        AND h.expires_at > now()
    )
  );

CREATE POLICY "happening_reactions: own delete"
  ON happening_reactions FOR DELETE USING (user_id = auth.uid());

-- ── Realtime ──────────────────────────────────────────────────────────────────

ALTER PUBLICATION supabase_realtime ADD TABLE happenings;

-- ── Cleanup function (call via pg_cron or edge function every 15 min) ─────────

CREATE OR REPLACE FUNCTION fn_cleanup_expired_happenings()
RETURNS void LANGUAGE sql SECURITY DEFINER AS $$
  DELETE FROM happenings WHERE expires_at < now() - interval '1 hour';
$$;
