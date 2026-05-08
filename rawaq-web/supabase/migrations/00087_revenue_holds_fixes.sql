-- ============================================================
-- Migration 00086 — Revenue Hold Fixes
--
-- Fixes over 00085:
--
-- 1. CRITICAL — fn_sync_wallet_on_payment: refund path computed
--    balance_before as (v_balance_after + amount) which is wrong
--    when GREATEST(0,...) clamps the balance. Now captures
--    v_balance_before from a snapshot BEFORE the UPDATE.
--
-- 2. IMPORTANT — idempotent pg_cron schedule: cron.schedule errors
--    if the job already exists (e.g. on db reset). Unschedule first.
--
-- 3. MINOR — fn_release_expired_revenue_holds: eliminates the extra
--    SELECT after UPDATE by using RETURNING, and adds LIMIT 500 to
--    cap work per cron firing (prevents runaway on large backlogs).
-- ============================================================

-- ── 1. Fix fn_sync_wallet_on_payment ─────────────────────────
CREATE OR REPLACE FUNCTION fn_sync_wallet_on_payment()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_balance_before NUMERIC(12,2);
  v_balance_after  NUMERIC(12,2);
  v_hold_hours     INT;
  v_hold_amount    NUMERIC(10,2);
  v_hold_id        UUID;
BEGIN
  IF NEW.type NOT IN ('ticket', 'tip') THEN
    RETURN NEW;
  END IF;

  -- ── Credit succeeded payments once ─────────────────────────
  IF NEW.status = 'succeeded'
     AND (TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND OLD.status != 'succeeded'))
  THEN
    IF NEW.type = 'tip' THEN
      -- Tips: credit balance directly, write ledger entry immediately
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
      -- Ticket sales: credit held_balance + insert hold row.
      -- Ledger entry written at release time by fn_release_expired_revenue_holds.
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

  -- ── Debit (refund) ──────────────────────────────────────────
  -- Tip refunds: no hold exists, falls straight to ELSE branch.
  IF TG_OP = 'UPDATE' AND OLD.status != 'refunded' AND NEW.status = 'refunded' THEN
    -- Look up an active hold for this transaction (tips never have one)
    SELECT id, amount
    INTO v_hold_id, v_hold_amount
    FROM revenue_holds
    WHERE payment_transaction_id = NEW.id
      AND released_at IS NULL;

    -- Snapshot withdrawable balance BEFORE the update so balance_before
    -- in the ledger is always accurate even if GREATEST(0,...) clamps.
    SELECT balance INTO v_balance_before
    FROM organizer_wallet
    WHERE organizer_id = NEW.organizer_id;

    IF v_hold_id IS NOT NULL THEN
      -- Cancel the hold; deduct any refund amount beyond the hold from balance
      UPDATE revenue_holds
      SET released_at = NOW()
      WHERE id = v_hold_id;

      UPDATE organizer_wallet
      SET held_balance = GREATEST(0, held_balance - v_hold_amount),
          balance      = GREATEST(0, balance - GREATEST(0, NEW.organizer_net - v_hold_amount)),
          updated_at   = NOW()
      WHERE organizer_id = NEW.organizer_id;
    ELSE
      -- Hold already released (or tip): full deduction from balance
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
       v_balance_before, v_balance_after);
  END IF;

  RETURN NEW;
END;
$$;

-- ── 2. Fix fn_release_expired_revenue_holds ──────────────────
--    • RETURNING eliminates the separate SELECT per loop iteration
--    • LIMIT 500 caps work per cron firing (subsequent runs clear the rest)
CREATE OR REPLACE FUNCTION fn_release_expired_revenue_holds()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_hold          RECORD;
  v_balance_after NUMERIC(12,2);
BEGIN
  FOR v_hold IN
    SELECT id, organizer_id, payment_transaction_id, amount
    FROM revenue_holds
    WHERE held_until <= NOW()
      AND released_at IS NULL
    LIMIT 500
    FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE organizer_wallet
    SET balance      = balance + v_hold.amount,
        held_balance = GREATEST(0, held_balance - v_hold.amount),
        updated_at   = NOW()
    WHERE organizer_id = v_hold.organizer_id
    RETURNING balance INTO v_balance_after;

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

-- ── 3. Idempotent cron schedule ───────────────────────────────
--    Unschedule first so re-running this migration (db reset, etc.)
--    doesn't raise "job already exists".
SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname = 'release-revenue-holds';

SELECT cron.schedule(
  'release-revenue-holds',
  '*/15 * * * *',
  $$ SELECT fn_release_expired_revenue_holds(); $$
);
