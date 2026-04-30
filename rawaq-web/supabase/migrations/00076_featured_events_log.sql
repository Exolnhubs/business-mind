-- Track each featuring action separately so re-featuring the same event
-- after expiry costs a new quota slot (not a free reuse of the same slot).
CREATE TABLE IF NOT EXISTS featured_events_log (
  id           UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id     UUID        NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  organizer_id UUID        NOT NULL,
  featured_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  featured_until TIMESTAMPTZ NOT NULL
);

-- Quota count query: count rows per organizer per month
CREATE INDEX IF NOT EXISTS idx_featured_log_organizer_at
  ON featured_events_log (organizer_id, featured_at);

-- Backfill: seed one log row per event that was featured this month so
-- existing quota usage is preserved after the migration.
INSERT INTO featured_events_log (event_id, organizer_id, featured_at, featured_until)
SELECT
  id,
  organizer_id,
  featured_at,
  COALESCE(featured_until, featured_at + INTERVAL '7 days')
FROM events
WHERE featured_at >= date_trunc('month', now())
  AND featured_at IS NOT NULL
ON CONFLICT DO NOTHING;
