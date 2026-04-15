-- ============================================================
-- 00067 · Guard series_starts_at on event occurrences
--
-- Makes event_occurrences resilient to older writers by
-- defaulting series_starts_at to starts_at whenever it is omitted.
-- ============================================================

UPDATE event_occurrences
SET series_starts_at = starts_at
WHERE series_starts_at IS NULL;

CREATE OR REPLACE FUNCTION set_event_occurrence_series_starts_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.series_starts_at IS NULL THEN
    NEW.series_starts_at := NEW.starts_at;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_event_occurrences_series_starts_at ON event_occurrences;

CREATE TRIGGER trg_event_occurrences_series_starts_at
  BEFORE INSERT OR UPDATE OF starts_at, series_starts_at
  ON event_occurrences
  FOR EACH ROW
  EXECUTE FUNCTION set_event_occurrence_series_starts_at();
