-- ──────────────────────────────────────────────────────────────────────────────
-- 00021_promo_codes.sql
--
-- Tables / columns added:
--   promo_codes          — discount codes (per-event or platform-wide)
--   bookings             — ADD promo_code_id, discount_amount
--
-- Triggers added:
--   trg_ticket_type_sold_count   — increment / decrement sold_count on ticket_types
-- ──────────────────────────────────────────────────────────────────────────────

-- ── 1. promo_codes ────────────────────────────────────────────────────────────
CREATE TABLE promo_codes (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  code            TEXT         NOT NULL,
  -- NULL event_id = platform-wide code (admin only); non-null = event-specific (organizer)
  event_id        UUID         REFERENCES events(id) ON DELETE CASCADE,
  created_by      UUID         NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  discount_type   TEXT         NOT NULL CHECK (discount_type IN ('percent', 'fixed')),
  discount_value  NUMERIC(10,2) NOT NULL CHECK (discount_value > 0),
  max_uses        INT          CHECK (max_uses IS NULL OR max_uses > 0),  -- NULL = unlimited
  used_count      INT          NOT NULL DEFAULT 0,
  min_order_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  expires_at      TIMESTAMPTZ,
  is_active       BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  -- A code must be unique within the same scope:
  --   platform-wide codes: UNIQUE(code) where event_id IS NULL
  --   event-specific codes: UNIQUE(code, event_id)
  UNIQUE (code, event_id)  -- NULL event_id counts as a distinct value in Postgres NULLS NOT DISTINCT requires PG15; use partial index instead
);

-- Enforce uniqueness of platform-wide codes separately
CREATE UNIQUE INDEX idx_promo_codes_global ON promo_codes(code) WHERE event_id IS NULL;
CREATE INDEX idx_promo_codes_event  ON promo_codes(event_id);
CREATE INDEX idx_promo_codes_active ON promo_codes(is_active, expires_at);

COMMENT ON TABLE promo_codes IS
  'Discount codes for events. event_id=NULL means platform-wide (admin-only).';

-- ── 2. Extend bookings ────────────────────────────────────────────────────────
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS promo_code_id   UUID    REFERENCES promo_codes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(10,2) NOT NULL DEFAULT 0;

-- ── 3. Touch trigger for promo_codes ─────────────────────────────────────────
CREATE TRIGGER touch_promo_codes_updated_at
  BEFORE UPDATE ON promo_codes
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ── 4. Trigger: maintain ticket_type.sold_count ───────────────────────────────
--
-- Fires AFTER INSERT or UPDATE on bookings.
-- Rules:
--   INSERT with status='confirmed' AND ticket_type_id IS NOT NULL → +1
--   UPDATE confirmed→cancelled with ticket_type_id → -1
--   UPDATE cancelled→confirmed with ticket_type_id → +1
--   UPDATE changing ticket_type_id (rare edge-case) → handled correctly

CREATE OR REPLACE FUNCTION fn_ticket_type_sold_count()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'confirmed' AND NEW.ticket_type_id IS NOT NULL THEN
      UPDATE ticket_types SET sold_count = sold_count + 1 WHERE id = NEW.ticket_type_id;
    END IF;

  ELSIF TG_OP = 'UPDATE' THEN
    -- Decrement old type if transitioning OUT of confirmed
    IF OLD.status = 'confirmed' AND NEW.status <> 'confirmed' AND OLD.ticket_type_id IS NOT NULL THEN
      UPDATE ticket_types SET sold_count = GREATEST(0, sold_count - 1) WHERE id = OLD.ticket_type_id;
    END IF;
    -- Increment new type if transitioning INTO confirmed
    IF NEW.status = 'confirmed' AND OLD.status <> 'confirmed' AND NEW.ticket_type_id IS NOT NULL THEN
      UPDATE ticket_types SET sold_count = sold_count + 1 WHERE id = NEW.ticket_type_id;
    END IF;
    -- Handle ticket_type_id change while staying confirmed (edge case)
    IF OLD.status = 'confirmed' AND NEW.status = 'confirmed'
       AND OLD.ticket_type_id IS DISTINCT FROM NEW.ticket_type_id THEN
      IF OLD.ticket_type_id IS NOT NULL THEN
        UPDATE ticket_types SET sold_count = GREATEST(0, sold_count - 1) WHERE id = OLD.ticket_type_id;
      END IF;
      IF NEW.ticket_type_id IS NOT NULL THEN
        UPDATE ticket_types SET sold_count = sold_count + 1 WHERE id = NEW.ticket_type_id;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_ticket_type_sold_count
  AFTER INSERT OR UPDATE OF status, ticket_type_id ON bookings
  FOR EACH ROW EXECUTE FUNCTION fn_ticket_type_sold_count();

-- ── 5. Trigger: increment promo used_count on confirmed booking ───────────────
CREATE OR REPLACE FUNCTION fn_promo_used_count()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'confirmed' AND NEW.promo_code_id IS NOT NULL THEN
      UPDATE promo_codes SET used_count = used_count + 1 WHERE id = NEW.promo_code_id;
    END IF;

  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.status <> 'confirmed' AND NEW.status = 'confirmed' AND NEW.promo_code_id IS NOT NULL THEN
      UPDATE promo_codes SET used_count = used_count + 1 WHERE id = NEW.promo_code_id;
    END IF;
    IF OLD.status = 'confirmed' AND NEW.status <> 'confirmed' AND OLD.promo_code_id IS NOT NULL THEN
      UPDATE promo_codes SET used_count = GREATEST(0, used_count - 1) WHERE id = OLD.promo_code_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_promo_used_count
  AFTER INSERT OR UPDATE OF status, promo_code_id ON bookings
  FOR EACH ROW EXECUTE FUNCTION fn_promo_used_count();

-- ── 6. RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE promo_codes ENABLE ROW LEVEL SECURITY;

-- Public can read active codes (needed for validate endpoint via anon key, but
-- the API layer does its own auth; RLS just guards direct DB access)
CREATE POLICY "pc_read_active"   ON promo_codes FOR SELECT USING (is_active = TRUE);
-- Organizer manages codes for their own events
CREATE POLICY "pc_org_insert"    ON promo_codes FOR INSERT
  WITH CHECK (
    event_id IS NOT NULL
    AND EXISTS (SELECT 1 FROM events WHERE id = event_id AND organizer_id = auth.uid())
  );
CREATE POLICY "pc_org_update"    ON promo_codes FOR UPDATE
  USING (
    event_id IS NOT NULL
    AND EXISTS (SELECT 1 FROM events WHERE id = event_id AND organizer_id = auth.uid())
  );
CREATE POLICY "pc_org_delete"    ON promo_codes FOR DELETE
  USING (
    event_id IS NOT NULL
    AND EXISTS (SELECT 1 FROM events WHERE id = event_id AND organizer_id = auth.uid())
  );
-- Admin full access
CREATE POLICY "pc_admin"         ON promo_codes FOR ALL USING (is_admin());
