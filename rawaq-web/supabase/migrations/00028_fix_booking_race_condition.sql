-- Migration: Fix booking race condition using SELECT ... FOR UPDATE
--
-- Problem: check_event_capacity() and the API-side sold_count check both read
-- denormalized counters (bookings_count, sold_count) without holding a lock.
-- Two concurrent requests can both pass the capacity check and overbook an event.
--
-- Fix: Replace the BEFORE trigger with an ATOMIC function that:
--   1. Locks the event row with SELECT ... FOR UPDATE
--   2. Counts LIVE confirmed bookings (not the denormalized counter)
--   3. Raises immediately if at capacity
-- The lock is held until the inserting transaction commits, so any concurrent
-- attempt will block, then re-read the now-updated count and fail correctly.

-- ── 1. Drop the old trigger and function ─────────────────────────────────────
DROP TRIGGER IF EXISTS trg_check_capacity ON bookings;
DROP FUNCTION IF EXISTS check_event_capacity();

-- ── 2. New atomic capacity guard ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION check_event_capacity()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_capacity   INT;
  v_booked     INT;
  v_tt_cap     INT;
  v_tt_sold    INT;
BEGIN
  -- Only enforce on confirmed bookings
  IF NEW.status != 'confirmed' THEN
    RETURN NEW;
  END IF;

  -- ── Event-level capacity ──────────────────────────────────────────────────
  -- Lock the event row so concurrent inserts queue up rather than racing
  SELECT capacity
  INTO   v_capacity
  FROM   events
  WHERE  id = NEW.event_id
  FOR UPDATE;                         -- row-level lock held until tx commits

  IF v_capacity IS NOT NULL THEN
    -- Count live confirmed bookings (source of truth, ignores stale counter)
    SELECT COUNT(*)
    INTO   v_booked
    FROM   bookings
    WHERE  event_id = NEW.event_id
      AND  status   = 'confirmed'
      AND  id      != NEW.id;         -- exclude the row being inserted

    IF v_booked >= v_capacity THEN
      RAISE EXCEPTION 'Event is fully booked (capacity: %)', v_capacity
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- ── Ticket-type-level capacity ────────────────────────────────────────────
  IF NEW.ticket_type_id IS NOT NULL THEN
    SELECT capacity, sold_count
    INTO   v_tt_cap, v_tt_sold
    FROM   ticket_types
    WHERE  id = NEW.ticket_type_id
    FOR UPDATE;                       -- lock ticket type row too

    IF v_tt_cap IS NOT NULL THEN
      SELECT COUNT(*)
      INTO   v_tt_sold
      FROM   bookings
      WHERE  ticket_type_id = NEW.ticket_type_id
        AND  status         = 'confirmed'
        AND  id            != NEW.id;

      IF v_tt_sold >= v_tt_cap THEN
        RAISE EXCEPTION 'This ticket type is sold out'
          USING ERRCODE = 'P0003';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Re-create the trigger (BEFORE INSERT/UPDATE so the lock fires before the row lands)
CREATE TRIGGER trg_check_capacity
  BEFORE INSERT OR UPDATE OF status ON bookings
  FOR EACH ROW EXECUTE FUNCTION check_event_capacity();

-- ── 3. Also protect the duplicate-booking check with FOR UPDATE ──────────────
-- The existing check_duplicate_booking reads without a lock; add FOR UPDATE
-- so it's consistent with the capacity check happening in the same statement.
DROP TRIGGER IF EXISTS trg_duplicate_booking ON bookings;
DROP FUNCTION IF EXISTS check_duplicate_booking();

CREATE OR REPLACE FUNCTION check_duplicate_booking()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  existing_status booking_status;
BEGIN
  -- Lock the existing row (if any) so simultaneous inserts for the same
  -- user+event queue up rather than both slipping through
  SELECT status INTO existing_status
  FROM   bookings
  WHERE  user_id   = NEW.user_id
    AND  event_id  = NEW.event_id
  FOR UPDATE;

  IF FOUND AND existing_status = 'confirmed' THEN
    RAISE EXCEPTION 'User already has an active booking for this event'
      USING ERRCODE = 'P0002';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_duplicate_booking
  BEFORE INSERT ON bookings
  FOR EACH ROW EXECUTE FUNCTION check_duplicate_booking();

-- ── 4. Map the new error code in PostgREST responses ─────────────────────────
-- P0003 = ticket type sold out (new code, handled by errors.ts mapDbError)
-- No SQL needed; handled in application layer.

COMMENT ON FUNCTION check_event_capacity IS
  'Atomic capacity guard using SELECT ... FOR UPDATE. Prevents overbooking under concurrent load.';
