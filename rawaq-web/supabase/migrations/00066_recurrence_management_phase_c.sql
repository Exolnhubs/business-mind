-- ============================================================
-- 00066 · Recurrence management phase C
--
-- Adds:
--   - series-level recurrence end date on events
--   - per-occurrence exception metadata so organizers can edit/cancel
--     a single generated session without the generator overwriting it
-- ============================================================

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS recurrence_until TIMESTAMPTZ;

ALTER TABLE event_occurrences
  ADD COLUMN IF NOT EXISTS series_starts_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_exception BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE event_occurrences
SET series_starts_at = starts_at
WHERE series_starts_at IS NULL;

ALTER TABLE event_occurrences
  ALTER COLUMN series_starts_at SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_event_occurrences_series_slot
  ON event_occurrences(event_id, series_starts_at);

CREATE INDEX IF NOT EXISTS idx_event_occurrences_event_exception
  ON event_occurrences(event_id, is_exception, starts_at);
