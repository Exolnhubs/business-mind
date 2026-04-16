-- ============================================================
-- 00068 · Group booking support
--
-- Adds max_group_size to events, group_size to bookings,
-- and the booking_holders child table.
-- Updates both capacity triggers to use group_size.
-- ============================================================

-- 1. max_group_size on events (NULL = default 5)
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS max_group_size INT CHECK (max_group_size >= 1);

-- 2. group_size on bookings (defaults to 1 — no change to existing rows)
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS group_size INT NOT NULL DEFAULT 1 CHECK (group_size >= 1);

-- 3. booking_holders — one row per dependent (position >= 2)
CREATE TABLE IF NOT EXISTS booking_holders (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id    UUID        NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  full_name     TEXT        NOT NULL CHECK (char_length(full_name) BETWEEN 1 AND 120),
  date_of_birth DATE        NOT NULL,
  relation      TEXT        NOT NULL CHECK (char_length(relation) BETWEEN 1 AND 60),
  position      INT         NOT NULL CHECK (position >= 2),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (booking_id, position)
);

ALTER TABLE booking_holders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "booking_holders_owner_read"
  ON booking_holders FOR SELECT
  USING (
    booking_id IN (SELECT id FROM bookings WHERE user_id = auth.uid())
  );

CREATE INDEX IF NOT EXISTS idx_booking_holders_booking_id
  ON booking_holders(booking_id);

-- 4. Update check_event_capacity BEFORE trigger to use group_size
CREATE OR REPLACE FUNCTION check_event_capacity()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_occurrence_updated INT;
  v_ticket_updated     INT;
  v_group_size         INT;
BEGIN
  IF NEW.status <> 'confirmed' THEN
    RETURN NEW;
  END IF;

  IF NEW.occurrence_id IS NULL THEN
    RAISE EXCEPTION 'Occurrence is required for confirmed bookings'
      USING ERRCODE = 'P0004';
  END IF;

  v_group_size := COALESCE(NEW.group_size, 1);

  -- Atomic capacity guard: increment by group_size, only if enough spots remain
  UPDATE event_occurrences
  SET    bookings_count = bookings_count + v_group_size
  WHERE  id     = NEW.occurrence_id
    AND  status = 'scheduled'
    AND  (capacity IS NULL OR bookings_count + v_group_size <= capacity);

  GET DIAGNOSTICS v_occurrence_updated = ROW_COUNT;

  IF v_occurrence_updated = 0 THEN
    RAISE EXCEPTION 'This event occurrence is fully booked'
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE events
  SET    bookings_count = bookings_count + v_group_size
  WHERE  id = NEW.event_id;

  IF NEW.ticket_type_id IS NOT NULL THEN
    INSERT INTO event_occurrence_ticket_sales (occurrence_id, ticket_type_id, sold_count)
    VALUES (NEW.occurrence_id, NEW.ticket_type_id, v_group_size)
    ON CONFLICT (occurrence_id, ticket_type_id) DO UPDATE
    SET sold_count = event_occurrence_ticket_sales.sold_count + v_group_size,
        updated_at = NOW()
    WHERE EXISTS (
      SELECT 1 FROM ticket_types tt
      WHERE  tt.id = NEW.ticket_type_id
        AND  (tt.capacity IS NULL
              OR event_occurrence_ticket_sales.sold_count + v_group_size <= tt.capacity)
    );

    GET DIAGNOSTICS v_ticket_updated = ROW_COUNT;

    IF v_ticket_updated = 0 THEN
      UPDATE event_occurrences
      SET bookings_count = GREATEST(bookings_count - v_group_size, 0)
      WHERE id = NEW.occurrence_id;

      UPDATE events
      SET bookings_count = GREATEST(bookings_count - v_group_size, 0)
      WHERE id = NEW.event_id;

      RAISE EXCEPTION 'This ticket type is sold out'
        USING ERRCODE = 'P0003';
    END IF;

    UPDATE ticket_types
    SET    sold_count = sold_count + v_group_size
    WHERE  id = NEW.ticket_type_id;
  END IF;

  RETURN NEW;
END;
$$;

-- 5. Update update_event_bookings_count AFTER trigger to decrement by group_size
CREATE OR REPLACE FUNCTION update_event_bookings_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_group_size INT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    NULL; -- BEFORE trigger already incremented atomically

  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.status = 'confirmed' AND (
      NEW.status <> 'confirmed'
      OR NEW.occurrence_id IS DISTINCT FROM OLD.occurrence_id
      OR NEW.ticket_type_id IS DISTINCT FROM OLD.ticket_type_id
    ) THEN
      v_group_size := COALESCE(OLD.group_size, 1);

      UPDATE event_occurrences
      SET bookings_count = GREATEST(bookings_count - v_group_size, 0)
      WHERE id = OLD.occurrence_id;

      UPDATE events
      SET bookings_count = GREATEST(bookings_count - v_group_size, 0)
      WHERE id = OLD.event_id;

      IF OLD.ticket_type_id IS NOT NULL THEN
        UPDATE event_occurrence_ticket_sales
        SET sold_count = GREATEST(sold_count - v_group_size, 0),
            updated_at = NOW()
        WHERE occurrence_id = OLD.occurrence_id
          AND ticket_type_id = OLD.ticket_type_id;

        UPDATE ticket_types
        SET sold_count = GREATEST(sold_count - v_group_size, 0)
        WHERE id = OLD.ticket_type_id;
      END IF;
    END IF;

  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.status = 'confirmed' THEN
      v_group_size := COALESCE(OLD.group_size, 1);

      UPDATE event_occurrences
      SET bookings_count = GREATEST(bookings_count - v_group_size, 0)
      WHERE id = OLD.occurrence_id;

      UPDATE events
      SET bookings_count = GREATEST(bookings_count - v_group_size, 0)
      WHERE id = OLD.event_id;

      IF OLD.ticket_type_id IS NOT NULL THEN
        UPDATE event_occurrence_ticket_sales
        SET sold_count = GREATEST(sold_count - v_group_size, 0),
            updated_at = NOW()
        WHERE occurrence_id = OLD.occurrence_id
          AND ticket_type_id = OLD.ticket_type_id;

        UPDATE ticket_types
        SET sold_count = GREATEST(sold_count - v_group_size, 0)
        WHERE id = OLD.ticket_type_id;
      END IF;
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;
