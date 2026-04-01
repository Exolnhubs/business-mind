-- Migration: user referral system
-- Tables: referral_codes, referrals, user_coupons
-- Coupon awards piggy-back on the existing promo_codes table so the
-- already-working promo validation in /api/payments/initiate and the
-- mobile validatePromo flow apply with zero changes.
-- Two triggers:
--   trg_award_signup_coupon      — fires on INSERT referrals   → 15% coupon to referrer
--   trg_award_conversion_coupon  — fires on payment_transactions status→succeeded → 25% coupon
-- ──────────────────────────────────────────────────────────────────────────────

-- 1. notification_type enum extension
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'referral_signup_reward';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'referral_conversion_reward';

-- ── 2. referral_codes ─────────────────────────────────────────────────────────
CREATE TABLE referral_codes (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
  code       TEXT        NOT NULL UNIQUE,
  clicks     INT         NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_referral_codes_code ON referral_codes(code);

-- ── 3. referrals ──────────────────────────────────────────────────────────────
CREATE TABLE referrals (
  id                        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id               UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  referred_id               UUID        NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
  code_id                   UUID        NOT NULL REFERENCES referral_codes(id),
  signup_coupon_awarded     BOOLEAN     NOT NULL DEFAULT FALSE,
  conversion_coupon_awarded BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT no_self_referral CHECK (referrer_id <> referred_id)
);
CREATE INDEX idx_referrals_referrer ON referrals(referrer_id);
CREATE INDEX idx_referrals_referred ON referrals(referred_id);

-- ── 4. user_coupons (linking table for the rewards dashboard) ─────────────────
-- The actual validation-time record lives in promo_codes.
-- user_coupons lets us show the user "your earned coupons" with metadata.
CREATE TABLE user_coupons (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  promo_code_id UUID        NOT NULL UNIQUE REFERENCES promo_codes(id) ON DELETE CASCADE,
  referral_id   UUID        REFERENCES referrals(id) ON DELETE SET NULL,
  reason        TEXT        NOT NULL CHECK (reason IN ('referral_signup', 'referral_conversion')),
  expires_at    TIMESTAMPTZ NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_user_coupons_user  ON user_coupons(user_id);
CREATE INDEX idx_user_coupons_promo ON user_coupons(promo_code_id);

-- ── 5. Trigger: award 15% coupon when referral row is inserted ────────────────
CREATE OR REPLACE FUNCTION fn_award_signup_coupon()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_code     TEXT;
  v_promo_id UUID;
BEGIN
  IF NEW.signup_coupon_awarded THEN RETURN NEW; END IF;

  v_code := 'REF15-' || UPPER(SUBSTRING(NEW.id::TEXT FROM 1 FOR 8));

  INSERT INTO promo_codes (
    code, event_id, created_by, discount_type, discount_value,
    max_uses, min_order_amount, expires_at, is_active
  ) VALUES (
    v_code, NULL, NEW.referrer_id, 'percent', 15,
    1, 0, NOW() + INTERVAL '90 days', TRUE
  )
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_promo_id;

  IF v_promo_id IS NULL THEN
    SELECT id INTO v_promo_id FROM promo_codes WHERE code = v_code;
  END IF;

  INSERT INTO user_coupons (user_id, promo_code_id, referral_id, reason, expires_at)
  VALUES (NEW.referrer_id, v_promo_id, NEW.id, 'referral_signup', NOW() + INTERVAL '90 days')
  ON CONFLICT (promo_code_id) DO NOTHING;

  UPDATE referrals SET signup_coupon_awarded = TRUE WHERE id = NEW.id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_award_signup_coupon
  AFTER INSERT ON referrals
  FOR EACH ROW EXECUTE FUNCTION fn_award_signup_coupon();

-- ── 6. Trigger: award 25% coupon on referred user's first paid booking ─────────
CREATE OR REPLACE FUNCTION fn_award_conversion_coupon()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_referral referrals%ROWTYPE;
  v_code     TEXT;
  v_promo_id UUID;
BEGIN
  -- Only on first-time succeeded ticket payment
  IF NEW.status <> 'succeeded' OR NEW.type <> 'ticket' THEN RETURN NEW; END IF;
  -- Avoid re-running on non-status updates
  IF TG_OP = 'UPDATE' AND OLD.status = NEW.status THEN RETURN NEW; END IF;

  SELECT * INTO v_referral
  FROM referrals
  WHERE referred_id = NEW.user_id AND conversion_coupon_awarded = FALSE
  FOR UPDATE;

  IF NOT FOUND THEN RETURN NEW; END IF;

  -- Mark first to act as a boolean mutex under concurrency
  UPDATE referrals SET conversion_coupon_awarded = TRUE WHERE id = v_referral.id;

  v_code := 'REF25-' || UPPER(SUBSTRING(v_referral.id::TEXT FROM 1 FOR 8));

  INSERT INTO promo_codes (
    code, event_id, created_by, discount_type, discount_value,
    max_uses, min_order_amount, expires_at, is_active
  ) VALUES (
    v_code, NULL, v_referral.referrer_id, 'percent', 25,
    1, 0, NOW() + INTERVAL '90 days', TRUE
  )
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_promo_id;

  IF v_promo_id IS NULL THEN
    SELECT id INTO v_promo_id FROM promo_codes WHERE code = v_code;
  END IF;

  INSERT INTO user_coupons (user_id, promo_code_id, referral_id, reason, expires_at)
  VALUES (v_referral.referrer_id, v_promo_id, v_referral.id, 'referral_conversion', NOW() + INTERVAL '90 days')
  ON CONFLICT (promo_code_id) DO NOTHING;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_award_conversion_coupon
  AFTER INSERT OR UPDATE OF status ON payment_transactions
  FOR EACH ROW EXECUTE FUNCTION fn_award_conversion_coupon();

-- ── 7. Helper: atomic click increment (used by /api/referral/click) ──────────
CREATE OR REPLACE FUNCTION increment_referral_clicks(p_code TEXT)
RETURNS VOID LANGUAGE SQL SECURITY DEFINER AS $$
  UPDATE referral_codes SET clicks = clicks + 1 WHERE code = p_code;
$$;

-- ── 8. RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE referral_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rc_own"   ON referral_codes FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "rc_admin" ON referral_codes FOR ALL   USING (is_admin());

ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ref_own"   ON referrals FOR SELECT USING (referrer_id = auth.uid() OR referred_id = auth.uid());
CREATE POLICY "ref_admin" ON referrals FOR ALL    USING (is_admin());

ALTER TABLE user_coupons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "uc_own"   ON user_coupons FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "uc_admin" ON user_coupons FOR ALL   USING (is_admin());
