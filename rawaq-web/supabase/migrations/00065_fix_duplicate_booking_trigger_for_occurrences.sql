-- ============================================================
-- 00065 · Fix duplicate booking trigger for occurrence-based bookings
--
-- The legacy duplicate-booking trigger still checked user_id + event_id,
-- which incorrectly blocked booking a different future occurrence of the
-- same recurring event series. This aligns the trigger with the new
-- occurrence-based data model introduced in 00064.
-- ============================================================

DROP TRIGGER IF EXISTS trg_duplicate_booking ON bookings;
DROP FUNCTION IF EXISTS check_duplicate_booking();

CREATE OR REPLACE FUNCTION check_duplicate_booking()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  existing_status booking_status;
BEGIN
  IF NEW.occurrence_id IS NOT NULL THEN
    SELECT status INTO existing_status
    FROM   bookings
    WHERE  user_id = NEW.user_id
      AND  occurrence_id = NEW.occurrence_id
    FOR UPDATE;
  ELSE
    SELECT status INTO existing_status
    FROM   bookings
    WHERE  user_id = NEW.user_id
      AND  event_id = NEW.event_id
    FOR UPDATE;
  END IF;

  IF FOUND AND existing_status = 'confirmed' THEN
    RAISE EXCEPTION 'User already has an active booking for this occurrence'
      USING ERRCODE = 'P0002';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_duplicate_booking
  BEFORE INSERT ON bookings
  FOR EACH ROW EXECUTE FUNCTION check_duplicate_booking();
