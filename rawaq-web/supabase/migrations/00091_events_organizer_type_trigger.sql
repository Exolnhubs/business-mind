-- Trigger: auto-fill events.organizer_type from organizer_profiles on INSERT.
-- This fixes forms that insert events directly via the Supabase client (bypassing
-- the API route) and omit organizer_type, causing it to default to 'company'
-- even when the organizer is an individual host.

CREATE OR REPLACE FUNCTION fn_set_event_organizer_type()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.organizer_type = 'company' THEN
    SELECT COALESCE(op.organizer_type, 'company')
    INTO NEW.organizer_type
    FROM organizer_profiles op
    WHERE op.user_id = NEW.organizer_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_events_set_organizer_type ON events;

CREATE TRIGGER trg_events_set_organizer_type
  BEFORE INSERT ON events
  FOR EACH ROW EXECUTE FUNCTION fn_set_event_organizer_type();

-- Backfill: fix any events created after migration 00090 that got the wrong default.
-- (organizer is individual host but events.organizer_type is still 'company')
UPDATE events e
SET organizer_type = 'individual'
FROM organizer_profiles op
WHERE op.user_id = e.organizer_id
  AND op.organizer_type = 'individual'
  AND e.organizer_type = 'company';
