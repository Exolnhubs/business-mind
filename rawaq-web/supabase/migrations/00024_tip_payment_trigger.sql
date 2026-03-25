-- ─────────────────────────────────────────────────────────────────────────────
-- 00024 · Auto-create payment_transaction on tip insert
--
-- Same pattern as 00023 for bookings: mobile tips are inserted directly via
-- the Supabase client (no server API call), so processPayment() is never
-- invoked and the organizer wallet is never credited.
-- ─────────────────────────────────────────────────────────────────────────────

-- Unique constraint so ON CONFLICT DO NOTHING can deduplicate web-API path
ALTER TABLE payment_transactions
  ADD CONSTRAINT uq_payment_tx_tip_id
  UNIQUE (tip_id);

CREATE OR REPLACE FUNCTION fn_auto_payment_on_tip()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_fee_pct       NUMERIC(5,4);
  v_platform_fee  NUMERIC(10,2);
  v_organizer_net NUMERIC(10,2);
BEGIN
  IF NEW.amount IS NULL OR NEW.amount <= 0 THEN
    RETURN NEW;
  END IF;

  v_fee_pct       := get_organizer_platform_fee(NEW.organizer_id);
  v_platform_fee  := ROUND(NEW.amount * v_fee_pct, 2);
  v_organizer_net := ROUND(NEW.amount - v_platform_fee, 2);

  INSERT INTO payment_transactions (
    user_id, organizer_id, event_id, tip_id,
    type, status,
    amount, platform_fee, organizer_net,
    currency, gateway, gateway_ref, is_simulated
  )
  VALUES (
    NEW.user_id, NEW.organizer_id, NEW.event_id, NEW.id,
    'tip', 'succeeded',
    NEW.amount, v_platform_fee, v_organizer_net,
    COALESCE(NEW.currency, 'SAR'), 'simulated',
    'sim_tip_' || NEW.id::text, true
  )
  ON CONFLICT (tip_id) DO NOTHING;  -- web API already created it → skip

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_auto_payment_on_tip
  AFTER INSERT ON tips
  FOR EACH ROW
  EXECUTE FUNCTION fn_auto_payment_on_tip();
