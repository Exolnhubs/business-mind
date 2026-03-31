-- ============================================================
-- Migration 00033 — Persist payment initiation source
--
-- Problem:
--   payment_transactions.gateway_payload was being used for two jobs:
--   1. storing immutable app context ({ source: 'web' | 'mobile' })
--   2. storing the latest raw gateway/webhook payload for audit
--
--   Webhook updates overwrite gateway_payload, which loses the original
--   source and breaks post-payment mobile deep-link redirects.
--
-- Fix:
--   Add a dedicated immutable source column and backfill from the legacy
--   JSON payload when present.
-- ============================================================

ALTER TABLE payment_transactions
  ADD COLUMN IF NOT EXISTS source TEXT;

UPDATE payment_transactions
SET source = CASE
  WHEN gateway_payload IS NOT NULL
   AND jsonb_typeof(gateway_payload) = 'object'
   AND (gateway_payload ->> 'source') IN ('web', 'mobile')
    THEN gateway_payload ->> 'source'
  ELSE 'web'
END
WHERE source IS NULL;

ALTER TABLE payment_transactions
  ALTER COLUMN source SET DEFAULT 'web';

ALTER TABLE payment_transactions
  ALTER COLUMN source SET NOT NULL;

ALTER TABLE payment_transactions
  DROP CONSTRAINT IF EXISTS payment_transactions_source_check;

ALTER TABLE payment_transactions
  ADD CONSTRAINT payment_transactions_source_check
  CHECK (source IN ('web', 'mobile'));

CREATE INDEX IF NOT EXISTS idx_payment_tx_source
  ON payment_transactions(source);

COMMENT ON COLUMN payment_transactions.source IS
  'Immutable app origin of the payment attempt: web or mobile.';
