-- ── Migration 00037: Refund improvements ────────────────────────────────────
--
-- 1. Add user_note and refund_method to refunds table
-- 2. Set is_simulated default to FALSE (real refunds going forward)
-- 3. Add admin/refunds nav support (no schema change needed — just docs)

-- user_note: reason provided by the user when requesting the refund
ALTER TABLE refunds
  ADD COLUMN IF NOT EXISTS user_note TEXT;

-- refund_method: how the money is returned to the user
--   'original_payment' = reversed back to original card/method via gateway
--   'manual'           = platform team manually transfers (default for now)
ALTER TABLE refunds
  ADD COLUMN IF NOT EXISTS refund_method TEXT NOT NULL DEFAULT 'manual'
    CHECK (refund_method IN ('original_payment', 'manual'));

-- Real refunds going forward
ALTER TABLE refunds
  ALTER COLUMN is_simulated SET DEFAULT FALSE;

COMMENT ON COLUMN refunds.user_note     IS 'Cancellation reason entered by the user.';
COMMENT ON COLUMN refunds.refund_method IS 'How the refund is returned: original_payment (gateway reversal) or manual (bank transfer).';
