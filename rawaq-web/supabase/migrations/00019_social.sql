-- ============================================================
-- Migration 00019 — Social Layer
--
--  New tables:
--    organizer_follows  — users follow organizers for a feed
--    event_reactions    — like / interested on events
--    user_blocks        — block another user
--
--  Altered tables:
--    organizer_profiles — ADD followers_count INT
--    events             — ADD reactions_count INT
--
--  Triggers:
--    trg_follow_count_inc / dec  — maintain followers_count
--    trg_reaction_count_inc / dec — maintain reactions_count
-- ============================================================

-- ── 1. Add denormalised counters ──────────────────────────────
ALTER TABLE organizer_profiles
  ADD COLUMN IF NOT EXISTS followers_count INT NOT NULL DEFAULT 0;

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS reactions_count INT NOT NULL DEFAULT 0;

-- ── 2. organizer_follows ──────────────────────────────────────
CREATE TABLE organizer_follows (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id  UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  organizer_id UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (follower_id, organizer_id),
  CHECK  (follower_id != organizer_id)
);

CREATE INDEX idx_org_follows_follower  ON organizer_follows(follower_id);
CREATE INDEX idx_org_follows_organizer ON organizer_follows(organizer_id);
COMMENT ON TABLE organizer_follows IS
  'Users follow organizers to see their events in a personalised feed.';

-- ── 3. event_reactions ────────────────────────────────────────
--   One row per (user, event). User can switch between 'like'
--   and 'interested' with a plain UPDATE.
CREATE TABLE event_reactions (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  event_id   UUID        NOT NULL REFERENCES events(id)   ON DELETE CASCADE,
  type       TEXT        NOT NULL CHECK (type IN ('like', 'interested')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (user_id, event_id)
);

CREATE INDEX idx_event_reactions_event ON event_reactions(event_id);
CREATE INDEX idx_event_reactions_user  ON event_reactions(user_id);
COMMENT ON TABLE event_reactions IS
  'Like / interested reactions on events. One per user per event.';

-- ── 4. user_blocks ────────────────────────────────────────────
CREATE TABLE user_blocks (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_id UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  blocked_id UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (blocker_id, blocked_id),
  CHECK  (blocker_id != blocked_id)
);

CREATE INDEX idx_user_blocks_blocker ON user_blocks(blocker_id);
COMMENT ON TABLE user_blocks IS
  'Blocks between users. Blocker cannot see blocked content and vice-versa.';

-- ── 5. Triggers: followers_count ─────────────────────────────
CREATE OR REPLACE FUNCTION fn_follow_count_sync()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE organizer_profiles
    SET    followers_count = followers_count + 1
    WHERE  user_id = NEW.organizer_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE organizer_profiles
    SET    followers_count = GREATEST(0, followers_count - 1)
    WHERE  user_id = OLD.organizer_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_follow_count
  AFTER INSERT OR DELETE ON organizer_follows
  FOR EACH ROW EXECUTE FUNCTION fn_follow_count_sync();

-- ── 6. Triggers: reactions_count ─────────────────────────────
CREATE OR REPLACE FUNCTION fn_reaction_count_sync()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE events
    SET    reactions_count = reactions_count + 1
    WHERE  id = NEW.event_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE events
    SET    reactions_count = GREATEST(0, reactions_count - 1)
    WHERE  id = OLD.event_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_reaction_count
  AFTER INSERT OR DELETE ON event_reactions
  FOR EACH ROW EXECUTE FUNCTION fn_reaction_count_sync();

-- ── 7. Row Level Security ─────────────────────────────────────
ALTER TABLE organizer_follows ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_reactions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_blocks       ENABLE ROW LEVEL SECURITY;

-- organizer_follows: public read (needed for follower counts + check if following)
CREATE POLICY "of_read_all"    ON organizer_follows FOR SELECT USING (TRUE);
CREATE POLICY "of_insert_own"  ON organizer_follows FOR INSERT WITH CHECK (auth.uid() = follower_id);
CREATE POLICY "of_delete_own"  ON organizer_follows FOR DELETE USING  (auth.uid() = follower_id);
CREATE POLICY "of_admin"       ON organizer_follows FOR ALL   USING  (is_admin());

-- event_reactions: public read (needed for counts on event pages)
CREATE POLICY "er_read_all"    ON event_reactions FOR SELECT USING (TRUE);
CREATE POLICY "er_insert_own"  ON event_reactions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "er_update_own"  ON event_reactions FOR UPDATE USING  (auth.uid() = user_id);
CREATE POLICY "er_delete_own"  ON event_reactions FOR DELETE USING  (auth.uid() = user_id);
CREATE POLICY "er_admin"       ON event_reactions FOR ALL   USING  (is_admin());

-- user_blocks: private — only the blocker sees/manages their list
CREATE POLICY "ub_read_own"    ON user_blocks FOR SELECT USING  (auth.uid() = blocker_id);
CREATE POLICY "ub_insert_own"  ON user_blocks FOR INSERT WITH CHECK (auth.uid() = blocker_id);
CREATE POLICY "ub_delete_own"  ON user_blocks FOR DELETE USING  (auth.uid() = blocker_id);
CREATE POLICY "ub_admin"       ON user_blocks FOR ALL   USING  (is_admin());
