CREATE TABLE IF NOT EXISTS community_follows (
  community_id UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (community_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_community_follows_user_id
  ON community_follows(user_id);

ALTER TABLE community_follows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cf_read_all" ON community_follows;
DROP POLICY IF EXISTS "cf_insert_own" ON community_follows;
DROP POLICY IF EXISTS "cf_delete_own" ON community_follows;
DROP POLICY IF EXISTS "cf_admin" ON community_follows;

CREATE POLICY "cf_read_all"
  ON community_follows FOR SELECT
  USING (TRUE);

CREATE POLICY "cf_insert_own"
  ON community_follows FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "cf_delete_own"
  ON community_follows FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "cf_admin"
  ON community_follows FOR ALL
  USING (is_admin());
