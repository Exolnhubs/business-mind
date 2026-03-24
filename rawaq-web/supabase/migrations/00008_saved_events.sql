-- Saved / favourited events per user
CREATE TABLE IF NOT EXISTS saved_events (
  user_id   uuid NOT NULL REFERENCES profiles(id)  ON DELETE CASCADE,
  event_id  uuid NOT NULL REFERENCES events(id)    ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, event_id)
);

-- Index for fast lookup of all events a user has saved
CREATE INDEX IF NOT EXISTS saved_events_user_id_idx ON saved_events (user_id);

-- RLS: users can only see and manage their own saves
ALTER TABLE saved_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own saves"
  ON saved_events FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can save events"
  ON saved_events FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can unsave events"
  ON saved_events FOR DELETE
  USING (auth.uid() = user_id);
