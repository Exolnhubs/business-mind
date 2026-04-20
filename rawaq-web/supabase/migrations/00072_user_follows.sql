-- rawaq-web/supabase/migrations/00072_user_follows.sql
CREATE TABLE IF NOT EXISTS user_follows (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id  uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  following_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status       text NOT NULL CHECK (status IN ('pending', 'accepted')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (follower_id, following_id)
);

CREATE INDEX IF NOT EXISTS idx_user_follows_following_status
  ON user_follows (following_id, status);
