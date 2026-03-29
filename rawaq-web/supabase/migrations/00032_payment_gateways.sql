-- ──────────────────────────────────────────────────────────────────────────────
-- Migration 00032 — Extend payment gateways (Paymob, Fawry, Stripe)
-- Adds: paymob, fawry to gateway CHECK constraint
--       payment_method column on payment_transactions
--       paymob_order_id for webhook correlation
--       payment_pending_until on bookings for unconfirmed paid bookings
-- ──────────────────────────────────────────────────────────────────────────────

-- 1. Extend the gateway CHECK constraint to include new providers
ALTER TABLE payment_transactions
  DROP CONSTRAINT IF EXISTS payment_transactions_gateway_check;

ALTER TABLE payment_transactions
  ADD CONSTRAINT payment_transactions_gateway_check
    CHECK (gateway IN ('simulated', 'moyasar', 'stripe', 'hyperpay', 'paymob', 'fawry'));

-- 2. Track the specific payment method used within a gateway
--    e.g. 'card', 'apple_pay', 'google_pay', 'fawry', 'wallet', 'installment'
ALTER TABLE payment_transactions
  ADD COLUMN IF NOT EXISTS payment_method TEXT;

-- 3. Store the gateway's own order ID for webhook correlation
--    Paymob returns a numeric order ID; Stripe uses string session IDs
ALTER TABLE payment_transactions
  ADD COLUMN IF NOT EXISTS gateway_order_id TEXT;

-- 4. Fawry reference code shown to the user for cash payment at outlets
ALTER TABLE payment_transactions
  ADD COLUMN IF NOT EXISTS fawry_reference_number TEXT;

-- 5. When a paid booking is created but payment not yet confirmed, hold it as
--    'pending' until this timestamp. A cron/cleanup job can expire stale ones.
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS payment_pending_until TIMESTAMPTZ;

-- 6. Index for efficient webhook lookups by gateway order ID
CREATE INDEX IF NOT EXISTS idx_payment_tx_gateway_order_id
  ON payment_transactions(gateway_order_id)
  WHERE gateway_order_id IS NOT NULL;

-- 7. Index for efficient webhook lookups by gateway_ref (Stripe session ID)
CREATE INDEX IF NOT EXISTS idx_payment_tx_gateway_ref
  ON payment_transactions(gateway_ref)
  WHERE gateway_ref IS NOT NULL;

-- 8. Cron-style cleanup: expire pending bookings whose payment window has passed
--    This function is called by /api/cron/expire-pending-payments
CREATE OR REPLACE FUNCTION expire_pending_payments()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  expired_count INTEGER;
BEGIN
  UPDATE bookings
  SET    status = 'cancelled',
         updated_at = NOW()
  WHERE  status = 'pending'
    AND  payment_pending_until IS NOT NULL
    AND  payment_pending_until < NOW();

  GET DIAGNOSTICS expired_count = ROW_COUNT;
  RETURN expired_count;
END;
$$;
