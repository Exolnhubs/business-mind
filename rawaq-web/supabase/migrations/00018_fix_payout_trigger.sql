-- ============================================================
-- Migration 00018 — Fix payout wallet debit trigger
--
-- Bug: trg_payout_wallet_debit was AFTER UPDATE only.
-- The simulated payout API inserts rows directly with
-- status='completed', so the trigger never fired:
--   • balance was never reduced
--   • total_withdrawn was never incremented
--   • no ledger debit entry was created
--
-- Fix: drop + recreate as AFTER INSERT OR UPDATE, with guard
-- that prevents double-debiting if a row is updated while
-- already in 'completed' state.
-- ============================================================

DROP TRIGGER IF EXISTS trg_payout_wallet_debit ON payouts;

CREATE OR REPLACE FUNCTION fn_sync_wallet_on_payout()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance_after NUMERIC(12,2);
BEGIN
  -- Only act when the resulting status is 'completed'
  IF NEW.status != 'completed' THEN
    RETURN NEW;
  END IF;

  -- For UPDATE: skip if already completed (prevent double-debit)
  IF TG_OP = 'UPDATE' AND OLD.status = 'completed' THEN
    RETURN NEW;
  END IF;

  -- Debit wallet and increment total_withdrawn
  UPDATE organizer_wallet
  SET    balance         = GREATEST(0, balance - NEW.amount),
         total_withdrawn = total_withdrawn + NEW.amount,
         updated_at      = NOW()
  WHERE  organizer_id = NEW.organizer_id;

  -- Append ledger entry
  SELECT balance INTO v_balance_after
  FROM   organizer_wallet
  WHERE  organizer_id = NEW.organizer_id;

  INSERT INTO wallet_ledger
    (organizer_id, type, reason, amount, balance_before, balance_after, note)
  VALUES
    (NEW.organizer_id, 'debit', 'payout', NEW.amount,
     v_balance_after + NEW.amount, v_balance_after,
     'Payout to ' || COALESCE(NEW.bank_name, 'bank'));

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_payout_wallet_debit
  AFTER INSERT OR UPDATE OF status ON payouts
  FOR EACH ROW EXECUTE FUNCTION fn_sync_wallet_on_payout();
