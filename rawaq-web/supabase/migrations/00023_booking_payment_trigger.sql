-- ─────────────────────────────────────────────────────────────────────────────
-- 00023 · Auto-create payment_transaction on booking confirmation
--
-- Problem: mobile bookings use a direct Supabase insert, bypassing the
--          Next.js API route that calls processPayment(). This means the
--          payment_transactions table never gets a row, so trg_payment_wallet_sync
--          never fires and the organizer wallet is never credited.
--
-- Fix:     A trigger on bookings fires whenever status becomes 'confirmed'
--          (INSERT or UPDATE) and auto-inserts into payment_transactions.
--          A UNIQUE constraint on payment_transactions(booking_id) ensures
--          no double-counting if the web API also writes a row first.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Unique constraint to prevent double-counting ──────────────────────────────
-- Allows one payment transaction per booking (nullable booking_id still OK for tips)
ALTER TABLE payment_transactions
  ADD CONSTRAINT uq_payment_tx_booking_id
  UNIQUE (booking_id);

-- ── Auto-payment trigger function ─────────────────────────────────────────────
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
  -- Only act when status is/becomes 'confirmed'
  IF NEW.status <> 'confirmed' THEN
    RETURN NEW;
  END IF;
  -- Skip if already handled (INSERT case updating to same status has no OLD)
  IF TG_OP = 'UPDATE' AND OLD.status = 'confirmed' THEN
    RETURN NEW;
  END IF;

  -- Look up event organizer + currency
  SELECT organizer_id, COALESCE(currency, 'SAR')
  INTO   v_organizer_id, v_currency
  FROM   events WHERE id = NEW.event_id;

  -- Determine ticket price
  IF NEW.ticket_type_id IS NOT NULL THEN
    SELECT price, is_free INTO v_ticket_price, v_is_free
    FROM   ticket_types WHERE id = NEW.ticket_type_id;
    IF v_is_free THEN RETURN NEW; END IF;
  ELSE
    SELECT price, is_free INTO v_ticket_price, v_is_free
    FROM   events WHERE id = NEW.event_id;
    IF v_is_free OR v_ticket_price IS NULL THEN RETURN NEW; END IF;
  END IF;

  -- Apply discount
  v_effective := GREATEST(0, v_ticket_price - COALESCE(NEW.discount_amount, 0));
  IF v_effective <= 0 THEN RETURN NEW; END IF;

  -- Get organizer platform fee (uses existing helper from 00014_plans)
  v_fee_pct       := get_organizer_platform_fee(v_organizer_id);
  v_platform_fee  := ROUND(v_effective * v_fee_pct, 2);
  v_organizer_net := ROUND(v_effective - v_platform_fee, 2);

  -- Insert payment transaction; ignore if already exists (web API path)
  INSERT INTO payment_transactions (
    user_id, organizer_id, event_id, booking_id,
    type, status,
    amount, platform_fee, organizer_net,
    currency, gateway, gateway_ref, is_simulated
  )
  VALUES (
    NEW.user_id, v_organizer_id, NEW.event_id, NEW.id,
    'ticket', 'succeeded',
    v_effective, v_platform_fee, v_organizer_net,
    v_currency, 'simulated',
    'sim_auto_' || NEW.id::text, true
  )
  ON CONFLICT (booking_id) DO NOTHING;  -- web API already created it → skip

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_auto_payment_on_booking
  AFTER INSERT OR UPDATE OF status
  ON bookings
  FOR EACH ROW
  EXECUTE FUNCTION fn_auto_payment_on_booking();
