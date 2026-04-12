-- Enable real payment transactions for membership subscriptions.

ALTER TABLE payment_transactions
  DROP CONSTRAINT IF EXISTS payment_transactions_type_check;

ALTER TABLE payment_transactions
  ADD CONSTRAINT payment_transactions_type_check
  CHECK (type IN ('ticket', 'tip', 'refund', 'payout', 'subscription'));

ALTER TABLE payment_transactions
  ADD COLUMN IF NOT EXISTS subscription_plan_id TEXT REFERENCES plan_definitions(id);

COMMENT ON COLUMN payment_transactions.subscription_plan_id IS
  'Target plan being purchased when type = subscription.';

CREATE OR REPLACE FUNCTION fn_sync_wallet_on_payment()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_balance_after NUMERIC(12,2);
  v_reason        TEXT;
BEGIN
  IF NEW.type NOT IN ('ticket', 'tip') THEN
    RETURN NEW;
  END IF;

  -- Credit
  IF NEW.status = 'succeeded'
     AND (TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND OLD.status != 'succeeded'))
  THEN
    v_reason := CASE NEW.type WHEN 'tip' THEN 'tip' ELSE 'ticket_sale' END;

    INSERT INTO organizer_wallet (organizer_id, balance, total_earned, currency)
    VALUES (NEW.organizer_id, NEW.organizer_net, NEW.organizer_net, NEW.currency)
    ON CONFLICT (organizer_id) DO UPDATE
      SET balance      = organizer_wallet.balance + NEW.organizer_net,
          total_earned = organizer_wallet.total_earned + NEW.organizer_net,
          updated_at   = NOW();

    SELECT balance INTO v_balance_after
    FROM   organizer_wallet WHERE organizer_id = NEW.organizer_id;

    INSERT INTO wallet_ledger
      (organizer_id, payment_transaction_id, type, reason, amount, balance_before, balance_after)
    VALUES
      (NEW.organizer_id, NEW.id, 'credit', v_reason, NEW.organizer_net,
       v_balance_after - NEW.organizer_net, v_balance_after);
  END IF;

  -- Debit (refund)
  IF TG_OP = 'UPDATE' AND OLD.status != 'refunded' AND NEW.status = 'refunded' THEN
    UPDATE organizer_wallet
    SET    balance    = GREATEST(0, balance - NEW.organizer_net),
           updated_at = NOW()
    WHERE  organizer_id = NEW.organizer_id;

    SELECT balance INTO v_balance_after
    FROM   organizer_wallet WHERE organizer_id = NEW.organizer_id;

    INSERT INTO wallet_ledger
      (organizer_id, payment_transaction_id, type, reason, amount, balance_before, balance_after)
    VALUES
      (NEW.organizer_id, NEW.id, 'debit', 'refund_deducted', NEW.organizer_net,
       v_balance_after + NEW.organizer_net, v_balance_after);
  END IF;

  RETURN NEW;
END;
$$;
