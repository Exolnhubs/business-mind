-- Add organizer_type to events for efficient session vs event filtering.
-- Sessions are events created by individual hosts (organizer_type = 'individual').

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS organizer_type TEXT NOT NULL DEFAULT 'company'
    CHECK (organizer_type IN ('company', 'individual'));

-- Backfill existing individual-host events
UPDATE events e
SET organizer_type = 'individual'
FROM organizer_profiles op
WHERE op.user_id = e.organizer_id
  AND op.organizer_type = 'individual';

-- Partial index: covers the session feed query (individual, published, not cancelled)
CREATE INDEX IF NOT EXISTS idx_events_sessions_start_at
  ON events (start_at ASC)
  WHERE organizer_type = 'individual' AND is_published = true AND is_cancelled = false;

-- General index for hosted_by filter on the events list API
CREATE INDEX IF NOT EXISTS idx_events_organizer_type
  ON events (organizer_type, start_at ASC)
  WHERE is_published = true AND is_cancelled = false;
