-- ============================================================
-- Migration 00020 — User Reviews
--
--  New table:
--    user_reviews — any user can leave a star rating + text
--                   review for another user they've interacted with
--
--  Design:
--    • One review per (reviewer, reviewed) pair — UNIQUE constraint
--    • Rating 1-5 stars
--    • Content is optional (star-only reviews are valid)
--    • Reviewer cannot review themselves
--    • RLS: public read; own insert/update/delete; admin full
-- ============================================================

CREATE TABLE user_reviews (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  reviewer_id  UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  reviewed_id  UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  rating       SMALLINT    NOT NULL CHECK (rating BETWEEN 1 AND 5),
  content      TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (reviewer_id, reviewed_id),
  CHECK  (reviewer_id != reviewed_id)
);

CREATE INDEX idx_user_reviews_reviewed ON user_reviews(reviewed_id, created_at DESC);
CREATE INDEX idx_user_reviews_reviewer ON user_reviews(reviewer_id);

COMMENT ON TABLE user_reviews IS
  'Peer reviews — one per pair. Used on public user profiles.';

CREATE TRIGGER touch_user_reviews_updated_at
  BEFORE UPDATE ON user_reviews
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- RLS
ALTER TABLE user_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ur_read_all"   ON user_reviews FOR SELECT USING (TRUE);
CREATE POLICY "ur_insert_own" ON user_reviews FOR INSERT WITH CHECK (auth.uid() = reviewer_id);
CREATE POLICY "ur_update_own" ON user_reviews FOR UPDATE USING  (auth.uid() = reviewer_id);
CREATE POLICY "ur_delete_own" ON user_reviews FOR DELETE USING  (auth.uid() = reviewer_id);
CREATE POLICY "ur_admin"      ON user_reviews FOR ALL   USING  (is_admin());
