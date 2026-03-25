-- ============================================================
--  Migration 00016 — Phase 1: Payment Infrastructure
--
--  New tables:
--    ticket_types          — multiple price tiers per event
--    waitlist              — queue when an event reaches capacity
--    payment_transactions  — immutable payment audit trail
--    organizer_wallet      — running balance per organizer
--    wallet_ledger         — append-only balance ledger
--    refunds               — refund records
--    payouts               — organizer withdrawal requests
--
--  Altered tables:
--    bookings              — ADD ticket_type_id (nullable, backward-compat)
--
--  Triggers:
--    trg_assign_waitlist_position   — auto-assign queue position on insert
--    trg_promote_from_waitlist      — auto-promote on booking cancel
--    trg_payment_wallet_sync        — credit / debit wallet on tx status change
--    trg_payout_wallet_debit        — debit wallet when payout completes
--
--  Design notes:
--    • All money in SAR (NUMERIC(10,2) / NUMERIC(12,2))
--    • is_simulated = TRUE for all MVP records — swap to FALSE when real
--      gateway keys are configured (Moyasar / Stripe / HyperPay)
--    • Wallet is only ever modified by the two triggers above — never
--      directly from application code — ensuring the ledger stays in sync
-- ============================================================

-- ── 1. ticket_types ──────────────────────────────────────────
CREATE TABLE ticket_types (
  id             UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id       UUID          NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name           TEXT          NOT NULL,
  name_ar        TEXT,
  description    TEXT,
  price          NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (price >= 0),
  currency       TEXT          NOT NULL DEFAULT 'SAR',
  capacity       INT           CHECK (capacity > 0),  -- NULL = shares event capacity
  sold_count     INT           NOT NULL DEFAULT 0,
  is_free        BOOLEAN       NOT NULL DEFAULT FALSE,
  sale_starts_at TIMESTAMPTZ,
  sale_ends_at   TIMESTAMPTZ,
  sort_order     INT           NOT NULL DEFAULT 0,
  is_active      BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ticket_types_event_id ON ticket_types(event_id);
COMMENT ON TABLE ticket_types IS 'One row per pricing tier per event (Early Bird, General, VIP…).';

-- ── 2. waitlist ───────────────────────────────────────────────
CREATE TABLE waitlist (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    UUID        NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id     UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  position    INT         NOT NULL,
  notified_at TIMESTAMPTZ,
  expires_at  TIMESTAMPTZ,
  status      TEXT        NOT NULL DEFAULT 'waiting'
                CHECK (status IN ('waiting', 'promoted', 'expired', 'cancelled')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (event_id, user_id)
);

CREATE INDEX idx_waitlist_event_status ON waitlist(event_id, status, position);
COMMENT ON TABLE waitlist IS 'Queue for full events. Position 1 is next in line.';

-- ── 3. payment_transactions ───────────────────────────────────
--   One row per charge attempt. Status transitions:
--     pending → succeeded | failed
--     succeeded → refunded
CREATE TABLE payment_transactions (
  id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID          NOT NULL REFERENCES profiles(id),
  organizer_id     UUID          NOT NULL REFERENCES profiles(id),
  event_id         UUID          REFERENCES events(id) ON DELETE SET NULL,
  booking_id       UUID          REFERENCES bookings(id) ON DELETE SET NULL,
  tip_id           UUID          REFERENCES tips(id) ON DELETE SET NULL,

  type             TEXT          NOT NULL
                     CHECK (type IN ('ticket', 'tip', 'refund', 'payout')),
  status           TEXT          NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending', 'succeeded', 'failed', 'refunded')),

  amount           NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  platform_fee     NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (platform_fee >= 0),
  organizer_net    NUMERIC(10,2) NOT NULL CHECK (organizer_net >= 0),

  currency         TEXT          NOT NULL DEFAULT 'SAR',
  gateway          TEXT          NOT NULL DEFAULT 'simulated'
                     CHECK (gateway IN ('simulated', 'moyasar', 'stripe', 'hyperpay')),
  gateway_ref      TEXT,
  gateway_payload  JSONB,        -- full gateway response stored for audit
  is_simulated     BOOLEAN       NOT NULL DEFAULT TRUE,
  failure_reason   TEXT,

  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_payment_tx_user_id      ON payment_transactions(user_id);
CREATE INDEX idx_payment_tx_organizer_id ON payment_transactions(organizer_id);
CREATE INDEX idx_payment_tx_booking_id   ON payment_transactions(booking_id);
CREATE INDEX idx_payment_tx_status       ON payment_transactions(status);
COMMENT ON TABLE payment_transactions IS 'Immutable payment audit log. Wallet updated by trigger, never directly.';

-- ── 4. organizer_wallet ───────────────────────────────────────
--   One row per organizer, maintained exclusively by triggers.
CREATE TABLE organizer_wallet (
  organizer_id     UUID          PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  balance          NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (balance >= 0),
  total_earned     NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_withdrawn  NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency         TEXT          NOT NULL DEFAULT 'SAR',
  updated_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE organizer_wallet IS 'Current wallet balance. Never write directly — triggers maintain it.';

-- ── 5. wallet_ledger ─────────────────────────────────────────
--   Append-only. Every credit and debit is recorded here.
CREATE TABLE wallet_ledger (
  id                     UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  organizer_id           UUID          NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  payment_transaction_id UUID          REFERENCES payment_transactions(id),
  type                   TEXT          NOT NULL CHECK (type IN ('credit', 'debit')),
  reason                 TEXT          NOT NULL
                           CHECK (reason IN ('tip', 'ticket_sale', 'refund_deducted', 'payout', 'adjustment')),
  amount                 NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  balance_before         NUMERIC(12,2) NOT NULL,
  balance_after          NUMERIC(12,2) NOT NULL,
  note                   TEXT,
  created_at             TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_wallet_ledger_organizer ON wallet_ledger(organizer_id, created_at DESC);
COMMENT ON TABLE wallet_ledger IS 'Append-only balance ledger. Every movement recorded with before/after snapshot.';

-- ── 6. refunds ────────────────────────────────────────────────
CREATE TABLE refunds (
  id                     UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_transaction_id UUID          NOT NULL REFERENCES payment_transactions(id),
  booking_id             UUID          REFERENCES bookings(id),
  requested_by           UUID          NOT NULL REFERENCES profiles(id),
  amount                 NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  reason                 TEXT,
  status                 TEXT          NOT NULL DEFAULT 'pending'
                           CHECK (status IN ('pending', 'approved', 'rejected', 'completed')),
  processed_by           UUID          REFERENCES profiles(id),
  processed_at           TIMESTAMPTZ,
  gateway_ref            TEXT,
  is_simulated           BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at             TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE refunds IS 'Refund requests. Admin approves; completion sets payment_transaction.status = refunded.';

-- ── 7. payouts ────────────────────────────────────────────────
CREATE TABLE payouts (
  id             UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  organizer_id   UUID          NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  amount         NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  currency       TEXT          NOT NULL DEFAULT 'SAR',
  status         TEXT          NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  bank_name      TEXT,
  iban           TEXT,
  requested_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  processed_by   UUID          REFERENCES profiles(id),
  processed_at   TIMESTAMPTZ,
  gateway_ref    TEXT,
  failure_reason TEXT,
  is_simulated   BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_payouts_organizer ON payouts(organizer_id, created_at DESC);
COMMENT ON TABLE payouts IS 'Organizer withdrawal requests. MVP: simulated auto-complete.';

-- ── 8. Alter bookings ─────────────────────────────────────────
--   ticket_type_id is nullable for backward compatibility with
--   existing single-price events.
ALTER TABLE bookings
  ADD COLUMN ticket_type_id UUID REFERENCES ticket_types(id) ON DELETE SET NULL;

-- ── 9. Triggers ───────────────────────────────────────────────

-- 9a. Auto-assign waitlist position on INSERT
CREATE OR REPLACE FUNCTION fn_assign_waitlist_position()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  SELECT COALESCE(MAX(position), 0) + 1
  INTO   NEW.position
  FROM   waitlist
  WHERE  event_id = NEW.event_id AND status = 'waiting';
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_assign_waitlist_position
  BEFORE INSERT ON waitlist
  FOR EACH ROW EXECUTE FUNCTION fn_assign_waitlist_position();

-- 9b. Auto-promote first waitlist entry when a booking is cancelled
CREATE OR REPLACE FUNCTION fn_promote_from_waitlist()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_entry RECORD;
BEGIN
  -- Only act when status transitions TO cancelled
  IF OLD.status = NEW.status OR NEW.status != 'cancelled' THEN
    RETURN NEW;
  END IF;

  SELECT id, user_id
  INTO   v_entry
  FROM   waitlist
  WHERE  event_id = NEW.event_id AND status = 'waiting'
  ORDER  BY position ASC
  LIMIT  1;

  IF v_entry IS NOT NULL THEN
    -- Mark as promoted (app layer sends the notification)
    UPDATE waitlist
    SET    status = 'promoted', notified_at = NOW()
    WHERE  id = v_entry.id;

    -- Create or reactivate booking for the promoted user
    INSERT INTO bookings (user_id, event_id, status)
    VALUES (v_entry.user_id, NEW.event_id, 'confirmed')
    ON CONFLICT (user_id, event_id) DO UPDATE
      SET status = 'confirmed', updated_at = NOW()
    WHERE bookings.status = 'cancelled';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_promote_from_waitlist
  AFTER UPDATE OF status ON bookings
  FOR EACH ROW EXECUTE FUNCTION fn_promote_from_waitlist();

-- 9c. Sync organizer wallet when a payment_transaction is created or updated
--   • INSERT with status = 'succeeded'  → credit (covers simulated flow)
--   • UPDATE old.status != succeeded → new.status = succeeded → credit (covers real gateway webhooks)
--   • UPDATE → status = 'refunded'    → debit
CREATE OR REPLACE FUNCTION fn_sync_wallet_on_payment()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_balance_after NUMERIC(12,2);
  v_reason        TEXT;
BEGIN
  -- ── Credit ───────────────────────────────────────────────────
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

  -- ── Debit (refund) ────────────────────────────────────────────
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

CREATE TRIGGER trg_payment_wallet_sync
  AFTER INSERT OR UPDATE OF status ON payment_transactions
  FOR EACH ROW EXECUTE FUNCTION fn_sync_wallet_on_payment();

-- 9d. Debit wallet when a payout is marked completed
CREATE OR REPLACE FUNCTION fn_sync_wallet_on_payout()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_balance_after NUMERIC(12,2);
BEGIN
  -- Only fire when status transitions TO completed
  IF OLD.status = 'completed' OR NEW.status != 'completed' THEN
    RETURN NEW;
  END IF;

  UPDATE organizer_wallet
  SET    balance         = GREATEST(0, balance - NEW.amount),
         total_withdrawn = total_withdrawn + NEW.amount,
         updated_at      = NOW()
  WHERE  organizer_id = NEW.organizer_id;

  SELECT balance INTO v_balance_after
  FROM   organizer_wallet WHERE organizer_id = NEW.organizer_id;

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
  AFTER UPDATE OF status ON payouts
  FOR EACH ROW EXECUTE FUNCTION fn_sync_wallet_on_payout();

-- ── 10. updated_at auto-touch triggers ───────────────────────
CREATE TRIGGER touch_ticket_types_updated_at
  BEFORE UPDATE ON ticket_types
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TRIGGER touch_payment_transactions_updated_at
  BEFORE UPDATE ON payment_transactions
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TRIGGER touch_refunds_updated_at
  BEFORE UPDATE ON refunds
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TRIGGER touch_payouts_updated_at
  BEFORE UPDATE ON payouts
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ── 11. Row Level Security ────────────────────────────────────

ALTER TABLE ticket_types         ENABLE ROW LEVEL SECURITY;
ALTER TABLE waitlist             ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizer_wallet     ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallet_ledger        ENABLE ROW LEVEL SECURITY;
ALTER TABLE refunds              ENABLE ROW LEVEL SECURITY;
ALTER TABLE payouts              ENABLE ROW LEVEL SECURITY;

-- ticket_types: anyone can read; organizer manages their own event's types
CREATE POLICY "tt_read_all"   ON ticket_types FOR SELECT USING (TRUE);
CREATE POLICY "tt_org_insert" ON ticket_types FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM events WHERE id = event_id AND organizer_id = auth.uid()));
CREATE POLICY "tt_org_update" ON ticket_types FOR UPDATE
  USING (EXISTS (SELECT 1 FROM events WHERE id = event_id AND organizer_id = auth.uid()));
CREATE POLICY "tt_org_delete" ON ticket_types FOR DELETE
  USING (EXISTS (SELECT 1 FROM events WHERE id = event_id AND organizer_id = auth.uid()));
CREATE POLICY "tt_admin"      ON ticket_types FOR ALL USING (is_admin());

-- waitlist: user sees + manages own entries; organizer reads their event waitlists
CREATE POLICY "wl_read_own"    ON waitlist FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "wl_insert_own"  ON waitlist FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "wl_cancel_own"  ON waitlist FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "wl_org_read"    ON waitlist FOR SELECT
  USING (EXISTS (SELECT 1 FROM events WHERE id = event_id AND organizer_id = auth.uid()));
CREATE POLICY "wl_admin"       ON waitlist FOR ALL USING (is_admin());

-- payment_transactions: user sees sent; organizer sees received; admin all
CREATE POLICY "pt_read_user" ON payment_transactions FOR SELECT USING (user_id      = auth.uid());
CREATE POLICY "pt_read_org"  ON payment_transactions FOR SELECT USING (organizer_id = auth.uid());
CREATE POLICY "pt_admin"     ON payment_transactions FOR ALL   USING (is_admin());

-- organizer_wallet: organizer reads own only
CREATE POLICY "ow_read_own" ON organizer_wallet FOR SELECT USING (organizer_id = auth.uid());
CREATE POLICY "ow_admin"    ON organizer_wallet FOR ALL   USING (is_admin());

-- wallet_ledger: organizer reads own only
CREATE POLICY "wledger_read_own" ON wallet_ledger FOR SELECT USING (organizer_id = auth.uid());
CREATE POLICY "wledger_admin"    ON wallet_ledger FOR ALL   USING (is_admin());

-- refunds: requester reads own; organizer reads refunds on their events
CREATE POLICY "ref_read_own"   ON refunds FOR SELECT USING (requested_by = auth.uid());
CREATE POLICY "ref_insert_own" ON refunds FOR INSERT WITH CHECK (requested_by = auth.uid());
CREATE POLICY "ref_admin"      ON refunds FOR ALL   USING (is_admin());

-- payouts: organizer manages own requests
CREATE POLICY "pay_read_own"   ON payouts FOR SELECT USING (organizer_id = auth.uid());
CREATE POLICY "pay_insert_own" ON payouts FOR INSERT WITH CHECK (organizer_id = auth.uid());
CREATE POLICY "pay_admin"      ON payouts FOR ALL   USING (is_admin());
