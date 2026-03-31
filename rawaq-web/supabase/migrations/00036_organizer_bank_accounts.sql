-- ── Migration 00036: Organizer Bank Accounts ────────────────────────────────
--
-- Adds a persistent bank account table linked to organizer profiles.
-- Payouts now reference a saved bank account instead of carrying ad-hoc
-- bank_name / iban columns.
--
-- Changes:
--   1. CREATE TABLE organizer_bank_accounts
--   2. ALTER TABLE payouts — add bank_account_id FK, set is_simulated default FALSE
--   3. Keep bank_name / iban on payouts as snapshot columns (filled on request)

-- ── 1. organizer_bank_accounts ───────────────────────────────────────────────
CREATE TABLE organizer_bank_accounts (
  id                   UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  organizer_id         UUID          NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  bank_name            TEXT          NOT NULL,
  bank_name_ar         TEXT,
  account_holder_name  TEXT          NOT NULL,
  iban                 TEXT          NOT NULL,
  swift_code           TEXT,
  country              TEXT          NOT NULL DEFAULT 'SA',
  is_verified          BOOLEAN       NOT NULL DEFAULT FALSE,
  created_at           TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE (organizer_id)   -- one primary bank account per organizer
);

CREATE INDEX idx_organizer_bank_accounts_organizer ON organizer_bank_accounts(organizer_id);

COMMENT ON TABLE organizer_bank_accounts IS 'Saved bank account for organizer withdrawal. One per organizer. Admin can verify.';
COMMENT ON COLUMN organizer_bank_accounts.iban IS 'Full IBAN including country code prefix (e.g. SA29 ...).';
COMMENT ON COLUMN organizer_bank_accounts.is_verified IS 'Admin-verified flag. Payouts can still be requested before verification; admin reviews before processing.';

-- ── 2. payouts: add bank_account_id FK ───────────────────────────────────────
ALTER TABLE payouts
  ADD COLUMN bank_account_id UUID REFERENCES organizer_bank_accounts(id) ON DELETE SET NULL;

-- Change default to FALSE — new payouts are real by default
ALTER TABLE payouts
  ALTER COLUMN is_simulated SET DEFAULT FALSE;

-- ── 3. RLS ───────────────────────────────────────────────────────────────────
ALTER TABLE organizer_bank_accounts ENABLE ROW LEVEL SECURITY;

-- Organizer can read/write their own bank account
CREATE POLICY "organizer_bank_accounts_own"
  ON organizer_bank_accounts
  FOR ALL
  USING (organizer_id = auth.uid())
  WITH CHECK (organizer_id = auth.uid());

-- Admin service role bypasses RLS (uses admin client)
