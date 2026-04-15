-- ============================================================
-- 00064 · Event occurrences phase A
--
-- Introduces real dated occurrences for recurring events and moves
-- booking uniqueness / waitlist / capacity enforcement to occurrence level.
--
-- This migration keeps event_id on dependent rows for compatibility, while
-- adding occurrence_id as the source of truth for attendance and booking.
-- ============================================================

-- 1. Occurrence tables
CREATE TABLE IF NOT EXISTS event_occurrences (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id       UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  starts_at      TIMESTAMPTZ NOT NULL,
  ends_at        TIMESTAMPTZ,
  status         TEXT NOT NULL DEFAULT 'scheduled'
                   CHECK (status IN ('scheduled', 'cancelled', 'completed')),
  capacity       INT CHECK (capacity > 0),
  bookings_count INT NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (event_id, starts_at)
);

CREATE INDEX IF NOT EXISTS idx_event_occurrences_event_id
  ON event_occurrences(event_id, starts_at);

CREATE INDEX IF NOT EXISTS idx_event_occurrences_status
  ON event_occurrences(status, starts_at);

COMMENT ON TABLE event_occurrences IS
  'Concrete dated sessions for one-time and recurring events.';

CREATE TABLE IF NOT EXISTS event_occurrence_ticket_sales (
  occurrence_id UUID NOT NULL REFERENCES event_occurrences(id) ON DELETE CASCADE,
  ticket_type_id UUID NOT NULL REFERENCES ticket_types(id) ON DELETE CASCADE,
  sold_count    INT NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (occurrence_id, ticket_type_id)
);

CREATE INDEX IF NOT EXISTS idx_occurrence_ticket_sales_ticket_type
  ON event_occurrence_ticket_sales(ticket_type_id);

COMMENT ON TABLE event_occurrence_ticket_sales IS
  'Per-occurrence ticket sales counters. Keeps recurring ticket capacity scoped to a single session.';

-- 2. Add occurrence_id to dependent tables
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS occurrence_id UUID REFERENCES event_occurrences(id) ON DELETE CASCADE;

ALTER TABLE waitlist
  ADD COLUMN IF NOT EXISTS occurrence_id UUID REFERENCES event_occurrences(id) ON DELETE CASCADE;

ALTER TABLE payment_transactions
  ADD COLUMN IF NOT EXISTS occurrence_id UUID REFERENCES event_occurrences(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_bookings_occurrence_id
  ON bookings(occurrence_id);

CREATE INDEX IF NOT EXISTS idx_bookings_occurrence_status
  ON bookings(occurrence_id, status);

CREATE INDEX IF NOT EXISTS idx_waitlist_occurrence_id
  ON waitlist(occurrence_id, status, position);

CREATE INDEX IF NOT EXISTS idx_payment_transactions_occurrence_id
  ON payment_transactions(occurrence_id);

-- 3. Backfill anchor occurrences for all existing events
INSERT INTO event_occurrences (event_id, starts_at, ends_at, status, capacity)
SELECT
  e.id,
  e.start_at,
  e.end_at,
  CASE WHEN e.is_cancelled THEN 'cancelled' ELSE 'scheduled' END,
  e.capacity
FROM events e
ON CONFLICT (event_id, starts_at) DO UPDATE
SET
  ends_at = EXCLUDED.ends_at,
  status = EXCLUDED.status,
  capacity = EXCLUDED.capacity;

-- 4. Backfill occurrence_id on existing rows using the anchor event date
UPDATE bookings b
SET occurrence_id = eo.id
FROM events e
JOIN event_occurrences eo
  ON eo.event_id = e.id
 AND eo.starts_at = e.start_at
WHERE b.event_id = e.id
  AND b.occurrence_id IS NULL;

UPDATE waitlist w
SET occurrence_id = eo.id
FROM events e
JOIN event_occurrences eo
  ON eo.event_id = e.id
 AND eo.starts_at = e.start_at
WHERE w.event_id = e.id
  AND w.occurrence_id IS NULL;

UPDATE payment_transactions pt
SET occurrence_id = b.occurrence_id
FROM bookings b
WHERE pt.booking_id = b.id
  AND pt.occurrence_id IS NULL;

-- 5. Replace uniqueness with occurrence-scoped uniqueness
ALTER TABLE bookings
  DROP CONSTRAINT IF EXISTS bookings_user_id_event_id_key;

ALTER TABLE bookings
  ADD CONSTRAINT bookings_user_id_occurrence_id_key
  UNIQUE (user_id, occurrence_id);

ALTER TABLE waitlist
  DROP CONSTRAINT IF EXISTS waitlist_event_id_user_id_key;

ALTER TABLE waitlist
  ADD CONSTRAINT waitlist_occurrence_id_user_id_key
  UNIQUE (occurrence_id, user_id);

ALTER TABLE bookings
  ALTER COLUMN occurrence_id SET NOT NULL;

ALTER TABLE waitlist
  ALTER COLUMN occurrence_id SET NOT NULL;

-- 6. Waitlist triggers now scope to occurrence_id
CREATE OR REPLACE FUNCTION fn_assign_waitlist_position()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  SELECT COALESCE(MAX(position), 0) + 1
  INTO   NEW.position
  FROM   waitlist
  WHERE  occurrence_id = NEW.occurrence_id
    AND  status = 'waiting';

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION fn_promote_from_waitlist()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_entry RECORD;
BEGIN
  IF OLD.status = NEW.status OR NEW.status <> 'cancelled' THEN
    RETURN NEW;
  END IF;

  SELECT id, user_id
  INTO   v_entry
  FROM   waitlist
  WHERE  occurrence_id = OLD.occurrence_id
    AND  status = 'waiting'
  ORDER  BY position ASC
  LIMIT  1;

  IF v_entry IS NOT NULL THEN
    UPDATE waitlist
    SET    status = 'promoted', notified_at = NOW()
    WHERE  id = v_entry.id;

    INSERT INTO bookings (user_id, event_id, occurrence_id, status)
    VALUES (v_entry.user_id, OLD.event_id, OLD.occurrence_id, 'confirmed')
    ON CONFLICT (user_id, occurrence_id) DO UPDATE
      SET status = 'confirmed', updated_at = NOW()
    WHERE bookings.status = 'cancelled';
  END IF;

  RETURN NEW;
END;
$$;

-- 7. Capacity / ticket counters now scope to occurrence_id
DROP TRIGGER IF EXISTS trg_check_capacity ON bookings;
DROP FUNCTION IF EXISTS check_event_capacity();

CREATE OR REPLACE FUNCTION check_event_capacity()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_occurrence_updated INT;
  v_ticket_updated     INT;
BEGIN
  IF NEW.status <> 'confirmed' THEN
    RETURN NEW;
  END IF;

  IF NEW.occurrence_id IS NULL THEN
    RAISE EXCEPTION 'Occurrence is required for confirmed bookings'
      USING ERRCODE = 'P0004';
  END IF;

  UPDATE event_occurrences
  SET    bookings_count = bookings_count + 1
  WHERE  id = NEW.occurrence_id
    AND  status = 'scheduled'
    AND  (capacity IS NULL OR bookings_count < capacity);

  GET DIAGNOSTICS v_occurrence_updated = ROW_COUNT;

  IF v_occurrence_updated = 0 THEN
    RAISE EXCEPTION 'This event occurrence is fully booked'
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE events
  SET    bookings_count = bookings_count + 1
  WHERE  id = NEW.event_id;

  IF NEW.ticket_type_id IS NOT NULL THEN
    INSERT INTO event_occurrence_ticket_sales (occurrence_id, ticket_type_id, sold_count)
    VALUES (NEW.occurrence_id, NEW.ticket_type_id, 1)
    ON CONFLICT (occurrence_id, ticket_type_id) DO UPDATE
    SET sold_count = event_occurrence_ticket_sales.sold_count + 1,
        updated_at = NOW()
    WHERE EXISTS (
      SELECT 1
      FROM   ticket_types tt
      WHERE  tt.id = NEW.ticket_type_id
        AND  (tt.capacity IS NULL OR event_occurrence_ticket_sales.sold_count < tt.capacity)
    );

    GET DIAGNOSTICS v_ticket_updated = ROW_COUNT;

    IF v_ticket_updated = 0 THEN
      UPDATE event_occurrences
      SET bookings_count = GREATEST(bookings_count - 1, 0)
      WHERE id = NEW.occurrence_id;

      UPDATE events
      SET bookings_count = GREATEST(bookings_count - 1, 0)
      WHERE id = NEW.event_id;

      RAISE EXCEPTION 'This ticket type is sold out'
        USING ERRCODE = 'P0003';
    END IF;

    UPDATE ticket_types
    SET    sold_count = sold_count + 1
    WHERE  id = NEW.ticket_type_id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_check_capacity
  BEFORE INSERT OR UPDATE OF status, occurrence_id, ticket_type_id ON bookings
  FOR EACH ROW EXECUTE FUNCTION check_event_capacity();

DROP TRIGGER IF EXISTS trg_booking_count ON bookings;
DROP FUNCTION IF EXISTS update_event_bookings_count();

CREATE OR REPLACE FUNCTION update_event_bookings_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NULL;

  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.status = 'confirmed' AND (
      NEW.status <> 'confirmed'
      OR NEW.occurrence_id IS DISTINCT FROM OLD.occurrence_id
      OR NEW.ticket_type_id IS DISTINCT FROM OLD.ticket_type_id
    ) THEN
      UPDATE event_occurrences
      SET bookings_count = GREATEST(bookings_count - 1, 0)
      WHERE id = OLD.occurrence_id;

      UPDATE events
      SET bookings_count = GREATEST(bookings_count - 1, 0)
      WHERE id = OLD.event_id;

      IF OLD.ticket_type_id IS NOT NULL THEN
        UPDATE event_occurrence_ticket_sales
        SET sold_count = GREATEST(sold_count - 1, 0),
            updated_at = NOW()
        WHERE occurrence_id = OLD.occurrence_id
          AND ticket_type_id = OLD.ticket_type_id;

        UPDATE ticket_types
        SET sold_count = GREATEST(sold_count - 1, 0)
        WHERE id = OLD.ticket_type_id;
      END IF;
    END IF;

  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.status = 'confirmed' THEN
      UPDATE event_occurrences
      SET bookings_count = GREATEST(bookings_count - 1, 0)
      WHERE id = OLD.occurrence_id;

      UPDATE events
      SET bookings_count = GREATEST(bookings_count - 1, 0)
      WHERE id = OLD.event_id;

      IF OLD.ticket_type_id IS NOT NULL THEN
        UPDATE event_occurrence_ticket_sales
        SET sold_count = GREATEST(sold_count - 1, 0),
            updated_at = NOW()
        WHERE occurrence_id = OLD.occurrence_id
          AND ticket_type_id = OLD.ticket_type_id;

        UPDATE ticket_types
        SET sold_count = GREATEST(sold_count - 1, 0)
        WHERE id = OLD.ticket_type_id;
      END IF;
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_booking_count
  AFTER INSERT OR UPDATE OR DELETE ON bookings
  FOR EACH ROW EXECUTE FUNCTION update_event_bookings_count();

-- 8. Auto payment rows should carry the occurrence_id too
CREATE OR REPLACE FUNCTION fn_auto_payment_on_booking()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_organizer_id  UUID;
  v_currency      TEXT;
  v_ticket_price  NUMERIC(10,2);
  v_is_free       BOOLEAN;
  v_effective     NUMERIC(10,2);
  v_fee_pct       NUMERIC(5,4);
  v_platform_fee  NUMERIC(10,2);
  v_organizer_net NUMERIC(10,2);
BEGIN
  IF NEW.status <> 'confirmed' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'confirmed' THEN
    RETURN NEW;
  END IF;

  SELECT organizer_id, COALESCE(currency, 'SAR')
  INTO   v_organizer_id, v_currency
  FROM   events WHERE id = NEW.event_id;

  IF NEW.ticket_type_id IS NOT NULL THEN
    SELECT price, is_free INTO v_ticket_price, v_is_free
    FROM   ticket_types WHERE id = NEW.ticket_type_id;
    IF v_is_free THEN RETURN NEW; END IF;
  ELSE
    SELECT price, is_free INTO v_ticket_price, v_is_free
    FROM   events WHERE id = NEW.event_id;
    IF v_is_free OR v_ticket_price IS NULL THEN RETURN NEW; END IF;
  END IF;

  v_effective := GREATEST(0, v_ticket_price - COALESCE(NEW.discount_amount, 0));
  IF v_effective <= 0 THEN RETURN NEW; END IF;

  v_fee_pct       := get_organizer_platform_fee(v_organizer_id);
  v_platform_fee  := ROUND(v_effective * v_fee_pct, 2);
  v_organizer_net := ROUND(v_effective - v_platform_fee, 2);

  INSERT INTO payment_transactions (
    user_id, organizer_id, event_id, occurrence_id, booking_id,
    type, status,
    amount, platform_fee, organizer_net,
    currency, gateway, gateway_ref, is_simulated
  )
  VALUES (
    NEW.user_id, v_organizer_id, NEW.event_id, NEW.occurrence_id, NEW.id,
    'ticket', 'succeeded',
    v_effective, v_platform_fee, v_organizer_net,
    v_currency, 'simulated',
    'sim_auto_' || NEW.id::text, true
  )
  ON CONFLICT (booking_id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- 9. Repair denormalized counters from the new source of truth
UPDATE events e
SET    bookings_count = (
  SELECT COUNT(*)
  FROM   bookings b
  WHERE  b.event_id = e.id
    AND  b.status = 'confirmed'
);

UPDATE event_occurrences eo
SET    bookings_count = (
  SELECT COUNT(*)
  FROM   bookings b
  WHERE  b.occurrence_id = eo.id
    AND  b.status = 'confirmed'
);

UPDATE ticket_types tt
SET    sold_count = (
  SELECT COUNT(*)
  FROM   bookings b
  WHERE  b.ticket_type_id = tt.id
    AND  b.status = 'confirmed'
);

INSERT INTO event_occurrence_ticket_sales (occurrence_id, ticket_type_id, sold_count)
SELECT
  b.occurrence_id,
  b.ticket_type_id,
  COUNT(*)::INT
FROM bookings b
WHERE b.ticket_type_id IS NOT NULL
  AND b.status = 'confirmed'
GROUP BY b.occurrence_id, b.ticket_type_id
ON CONFLICT (occurrence_id, ticket_type_id) DO UPDATE
SET sold_count = EXCLUDED.sold_count,
    updated_at = NOW();

-- 10. updated_at touch triggers
DROP TRIGGER IF EXISTS touch_event_occurrences_updated_at ON event_occurrences;
CREATE TRIGGER touch_event_occurrences_updated_at
  BEFORE UPDATE ON event_occurrences
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

DROP TRIGGER IF EXISTS touch_event_occurrence_ticket_sales_updated_at ON event_occurrence_ticket_sales;
CREATE TRIGGER touch_event_occurrence_ticket_sales_updated_at
  BEFORE UPDATE ON event_occurrence_ticket_sales
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

