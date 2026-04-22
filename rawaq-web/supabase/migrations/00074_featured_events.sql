-- Add featured columns to events
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS featured_at  TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS featured_until TIMESTAMPTZ DEFAULT NULL;

-- Index for the public featured query (featured_until > now())
CREATE INDEX IF NOT EXISTS idx_events_featured_until
  ON events (featured_until)
  WHERE featured_until IS NOT NULL;

-- Index for the quota count query (featured_at >= month_start per organizer)
CREATE INDEX IF NOT EXISTS idx_events_featured_at_organizer
  ON events (organizer_id, featured_at)
  WHERE featured_at IS NOT NULL;
