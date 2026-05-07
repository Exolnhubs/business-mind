-- ============================================================
-- Migration 00085 - Revenue Hold System
--
-- Changes:
--   organizer_wallet  - ADD held_balance column
--   revenue_holds     - NEW table for per-transaction hold records
--   platform_settings - SEED revenue_hold_hours = 24
--   wallet_ledger     - EXTEND reason CHECK for 'hold_released'
--   fn_sync_wallet_on_payment - tickets route to held_balance
--   fn_release_expired_revenue_holds - release matured holds
--   pg_cron           - schedule release every 15 minutes
-- ============================================================

ALTER TABLE organizer_wallet
  ADD COLUMN held_balance NUMERIC(12,2) NOT NULL DEFAULT 0
    CHECK (held_balance >= 0);

CREATE TABLE revenue_holds (
  id                     UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  organizer_id           UUID          NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  payment_transaction_id UUID          NOT NULL REFERENCES payment_transactions(id),
  amount                 NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  held_until             TIMESTAMPTZ   NOT NULL,
  released_at            TIMESTAMPTZ,
  created_at             TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  UNIQUE (payment_transaction_id)
);

CREATE INDEX idx_revenue_holds_organizer ON revenue_holds(organizer_id, held_until);
CREATE INDEX idx_revenue_holds_pending   ON revenue_holds(held_until) WHERE released_at IS NULL;

ALTER TABLE revenue_holds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rh_read_own" ON revenue_holds
  FOR SELECT USING (organizer_id = auth.uid());

CREATE POLICY "rh_admin" ON revenue_holds
  FOR ALL USING (is_admin());

ALTER TABLE wallet_ledger DROP CONSTRAINT IF EXISTS wallet_ledger_reason_check;
ALTER TABLE wallet_ledger ADD CONSTRAINT wallet_ledger_reason_check
  CHECK (reason IN ('tip', 'ticket_sale', 'refund_deducted', 'payout', 'adjustment', 'hold_released'));

INSERT INTO platform_settings (key, value)
VALUES ('revenue_hold_hours', '24'::jsonb)
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION fn_sync_wallet_on_payment()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_balance_after NUMERIC(12,2);
  v_hold_hours    INT;
  v_hold_amount   NUMERIC(10,2);
  v_hold_id       UUID;
BEGIN
  IF NEW.type NOT IN ('ticket', 'tip') THEN
    RETURN NEW;
  END IF;

  -- Credit succeeded payments once.
  IF NEW.status = 'succeeded'
     AND (TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND OLD.status != 'succeeded'))
  THEN
    IF NEW.type = 'tip' THEN
      INSERT INTO organizer_wallet (organizer_id, balance, total_earned, currency)
      VALUES (NEW.organizer_id, NEW.organizer_net, NEW.organizer_net, NEW.currency)
      ON CONFLICT (organizer_id) DO UPDATE
        SET balance      = organizer_wallet.balance + NEW.organizer_net,
            total_earned = organizer_wallet.total_earned + NEW.organizer_net,
            updated_at   = NOW();

      SELECT balance INTO v_balance_after
      FROM organizer_wallet
      WHERE organizer_id = NEW.organizer_id;

      INSERT INTO wallet_ledger
        (organizer_id, payment_transaction_id, type, reason, amount, balance_before, balance_after)
      VALUES
        (NEW.organizer_id, NEW.id, 'credit', 'tip', NEW.organizer_net,
         v_balance_after - NEW.organizer_net, v_balance_after);
    ELSE
      SELECT GREATEST(1, COALESCE((value #>> '{}')::int, 24))
      INTO v_hold_hours
      FROM platform_settings
      WHERE key = 'revenue_hold_hours';

      v_hold_hours := COALESCE(v_hold_hours, 24);

      INSERT INTO organizer_wallet (organizer_id, held_balance, total_earned, currency)
      VALUES (NEW.organizer_id, NEW.organizer_net, NEW.organizer_net, NEW.currency)
      ON CONFLICT (organizer_id) DO UPDATE
        SET held_balance = organizer_wallet.held_balance + NEW.organizer_net,
            total_earned = organizer_wallet.total_earned + NEW.organizer_net,
            updated_at   = NOW();

      INSERT INTO revenue_holds
        (organizer_id, payment_transaction_id, amount, held_until)
      VALUES
        (NEW.organizer_id, NEW.id, NEW.organizer_net,
         NOW() + (v_hold_hours || ' hours')::interval);
    END IF;
  END IF;

  -- Refund: cancel an active hold first, then deduct any remainder from balance.
  IF TG_OP = 'UPDATE' AND OLD.status != 'refunded' AND NEW.status = 'refunded' THEN
    SELECT id, amount
    INTO v_hold_id, v_hold_amount
    FROM revenue_holds
    WHERE payment_transaction_id = NEW.id
      AND released_at IS NULL;

    IF v_hold_id IS NOT NULL THEN
      UPDATE revenue_holds
      SET released_at = NOW()
      WHERE id = v_hold_id;

      UPDATE organizer_wallet
      SET held_balance = GREATEST(0, held_balance - v_hold_amount),
          balance      = GREATEST(0, balance - GREATEST(0, NEW.organizer_net - v_hold_amount)),
          updated_at   = NOW()
      WHERE organizer_id = NEW.organizer_id;
    ELSE
      UPDATE organizer_wallet
      SET balance    = GREATEST(0, balance - NEW.organizer_net),
          updated_at = NOW()
      WHERE organizer_id = NEW.organizer_id;
    END IF;

    SELECT balance INTO v_balance_after
    FROM organizer_wallet
    WHERE organizer_id = NEW.organizer_id;

    INSERT INTO wallet_ledger
      (organizer_id, payment_transaction_id, type, reason, amount, balance_before, balance_after)
    VALUES
      (NEW.organizer_id, NEW.id, 'debit', 'refund_deducted', NEW.organizer_net,
       v_balance_after + CASE
         WHEN v_hold_id IS NOT NULL THEN GREATEST(0, NEW.organizer_net - v_hold_amount)
         ELSE NEW.organizer_net
       END,
       v_balance_after);
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION fn_release_expired_revenue_holds()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_hold           RECORD;
  v_balance_after NUMERIC(12,2);
BEGIN
  FOR v_hold IN
    SELECT id, organizer_id, payment_transaction_id, amount
    FROM revenue_holds
    WHERE held_until <= NOW()
      AND released_at IS NULL
    FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE organizer_wallet
    SET balance      = balance + v_hold.amount,
        held_balance = GREATEST(0, held_balance - v_hold.amount),
        updated_at   = NOW()
    WHERE organizer_id = v_hold.organizer_id;

    SELECT balance INTO v_balance_after
    FROM organizer_wallet
    WHERE organizer_id = v_hold.organizer_id;

    UPDATE revenue_holds
    SET released_at = NOW()
    WHERE id = v_hold.id;

    INSERT INTO wallet_ledger
      (organizer_id, payment_transaction_id, type, reason, amount, balance_before, balance_after)
    VALUES
      (v_hold.organizer_id, v_hold.payment_transaction_id, 'credit', 'hold_released',
       v_hold.amount, v_balance_after - v_hold.amount, v_balance_after);
  END LOOP;
END;
$$;

SELECT cron.schedule(
  'release-revenue-holds',
  '*/15 * * * *',
  $$ SELECT fn_release_expired_revenue_holds(); $$
);
