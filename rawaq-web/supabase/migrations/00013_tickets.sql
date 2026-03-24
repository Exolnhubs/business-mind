-- ============================================================
-- TICKET SYSTEM
-- Adds ticket_id, seat, and scan tracking to bookings
-- ============================================================

-- Human-readable ticket code generator: RWQ-XXXXXXXX (uppercase alphanumeric)
CREATE OR REPLACE FUNCTION generate_ticket_id()
RETURNS TEXT AS $$
DECLARE
  chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result TEXT := 'RWQ-';
  i INT;
BEGIN
  FOR i IN 1..8 LOOP
    result := result || substr(chars, floor(random() * length(chars) + 1)::INT, 1);
  END LOOP;
  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Add ticket columns to bookings
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS ticket_id   TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS seat        TEXT,
  ADD COLUMN IF NOT EXISTS scanned_at  TIMESTAMPTZ;

-- Back-fill existing confirmed bookings with a ticket_id
DO $$
DECLARE
  rec RECORD;
  new_ticket TEXT;
BEGIN
  FOR rec IN SELECT id FROM bookings WHERE ticket_id IS NULL AND status = 'confirmed' LOOP
    LOOP
      new_ticket := generate_ticket_id();
      BEGIN
        UPDATE bookings SET ticket_id = new_ticket WHERE id = rec.id;
        EXIT;  -- success, break inner loop
      EXCEPTION WHEN unique_violation THEN
        -- collision — try again
      END;
    END LOOP;
  END LOOP;
END $$;

-- Trigger: auto-assign ticket_id on INSERT of a confirmed booking
CREATE OR REPLACE FUNCTION assign_ticket_id()
RETURNS TRIGGER AS $$
DECLARE
  new_ticket TEXT;
BEGIN
  IF NEW.status = 'confirmed' AND NEW.ticket_id IS NULL THEN
    LOOP
      new_ticket := generate_ticket_id();
      BEGIN
        NEW.ticket_id := new_ticket;
        EXIT;
      EXCEPTION WHEN unique_violation THEN
        -- collision — try again
      END;
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_assign_ticket_id ON bookings;
CREATE TRIGGER trg_assign_ticket_id
  BEFORE INSERT OR UPDATE OF status ON bookings
  FOR EACH ROW EXECUTE FUNCTION assign_ticket_id();

-- Index for fast ticket verification lookups
CREATE INDEX IF NOT EXISTS idx_bookings_ticket_id ON bookings (ticket_id);
