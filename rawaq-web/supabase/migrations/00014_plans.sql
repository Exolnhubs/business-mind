-- ============================================================
--  Migration 00014 — Multi-tier membership system
--
--  New tables:
--    plan_definitions        — static plan catalogue (admin-editable via UI)
--    subscriptions           — one active record per user
--    organizer_monthly_usage — rolling monthly published-event quota tracker
--
--  Altered tables:
--    profiles                — ADD plan_id (user tier)
--    organizer_profiles      — ADD plan_id (organizer tier)
--    tips                    — ADD platform_fee_pct, platform_fee_amount
--    bookings                — ADD platform_fee_pct, platform_fee_amount (paid tickets)
--    events                  — ADD is_premium_only
-- ============================================================

-- ── 1. plan_definitions ──────────────────────────────────────
CREATE TABLE plan_definitions (
  id                  TEXT          PRIMARY KEY,
  type                TEXT          NOT NULL CHECK (type IN ('user', 'organizer')),
  name                TEXT          NOT NULL,
  name_ar             TEXT          NOT NULL,
  price_sar           NUMERIC(10,2) NOT NULL DEFAULT 0,
  billing_interval    TEXT          NOT NULL DEFAULT 'monthly',
  events_per_month    INT,                    -- NULL = unlimited
  attendees_per_event INT,                    -- NULL = unlimited
  platform_fee_pct    NUMERIC(5,4)  NOT NULL DEFAULT 0, -- e.g. 0.1000 = 10 %
  features            JSONB         NOT NULL DEFAULT '{}',
  is_active           BOOLEAN       NOT NULL DEFAULT TRUE,
  sort_order          INT           NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ── 2. Seed plan definitions ─────────────────────────────────
--    Prices / quotas / fees are stored here so the admin panel
--    can update them without a code deploy.
INSERT INTO plan_definitions
  (id, type, name, name_ar, price_sar, events_per_month, attendees_per_event, platform_fee_pct, features, sort_order)
VALUES
  -- ── User tiers ──────────────────────────────────────────────
  ('user_free',
   'user', 'Free', 'مجاني', 0, NULL, NULL, 0.0000,
   '{"saves_limit": 20}',
   1),

  ('user_premium',
   'user', 'Premium', 'بريميوم', 29, NULL, NULL, 0.0000,
   '{"early_access": true, "premium_badge": true, "ad_free": true, "unlimited_saves": true}',
   2),

  -- ── Organizer tiers ─────────────────────────────────────────
  ('org_basic',
   'organizer', 'Basic', 'أساسي', 0, 3, 100, 0.1000,
   '{"basic_analytics": true}',
   1),

  ('org_pro',
   'organizer', 'Pro', 'بروفيشنال', 199, 15, 1000, 0.0600,
   '{"basic_analytics": true, "full_analytics": true, "ticket_scanner": true, "team_members": 3, "featured_slots": 1}',
   2),

  ('org_elite',
   'organizer', 'Elite', 'إيليت', 499, NULL, NULL, 0.0300,
   '{"basic_analytics": true, "full_analytics": true, "analytics_export": true, "ticket_scanner": true, "featured_slots": 5, "priority_support": true, "custom_branding": true}',
   3);

-- ── 3. subscriptions ─────────────────────────────────────────
CREATE TABLE subscriptions (
  id                   UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID          NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  plan_id              TEXT          NOT NULL REFERENCES plan_definitions(id),
  status               TEXT          NOT NULL DEFAULT 'active'
                         CHECK (status IN ('active', 'cancelled', 'expired', 'past_due')),
  current_period_start TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  current_period_end   TIMESTAMPTZ   NOT NULL,
  cancelled_at         TIMESTAMPTZ,
  payment_ref          TEXT,
  is_simulated         BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at           TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX idx_subscriptions_status  ON subscriptions(status);

-- ── 4. organizer_monthly_usage ───────────────────────────────
CREATE TABLE organizer_monthly_usage (
  organizer_id   UUID  NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  month          DATE  NOT NULL,  -- always first day of the month
  events_created INT   NOT NULL DEFAULT 0,
  PRIMARY KEY (organizer_id, month)
);

-- ── 5. Alter existing tables ──────────────────────────────────

-- profiles: user tier (plan_definitions rows already seeded above)
ALTER TABLE profiles
  ADD COLUMN plan_id TEXT NOT NULL DEFAULT 'user_free'
  REFERENCES plan_definitions(id);

-- organizer_profiles: organizer tier
ALTER TABLE organizer_profiles
  ADD COLUMN plan_id TEXT NOT NULL DEFAULT 'org_basic'
  REFERENCES plan_definitions(id);

-- tips: record the platform cut locked in at the time of tip
ALTER TABLE tips
  ADD COLUMN platform_fee_pct    NUMERIC(5,4)  NOT NULL DEFAULT 0,
  ADD COLUMN platform_fee_amount NUMERIC(10,2) NOT NULL DEFAULT 0;

-- bookings: record platform cut for paid-ticket revenue (ready for real payments)
ALTER TABLE bookings
  ADD COLUMN platform_fee_pct    NUMERIC(5,4)  NOT NULL DEFAULT 0,
  ADD COLUMN platform_fee_amount NUMERIC(10,2) NOT NULL DEFAULT 0;

-- events: organizer may restrict booking to Premium users only
ALTER TABLE events
  ADD COLUMN is_premium_only BOOLEAN NOT NULL DEFAULT FALSE;

-- ── 6. Helper: get organizer platform fee percentage ─────────
CREATE OR REPLACE FUNCTION get_organizer_platform_fee(p_organizer_id UUID)
RETURNS NUMERIC(5,4)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT COALESCE(pd.platform_fee_pct, 0.1000)
  FROM   organizer_profiles op
  JOIN   plan_definitions   pd ON pd.id = op.plan_id
  WHERE  op.user_id = p_organizer_id;
$$;

-- ── 7. Triggers: track monthly published events per organizer ─

-- 7a. On INSERT — event created already published
CREATE OR REPLACE FUNCTION fn_track_event_published_insert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.is_published = TRUE THEN
    INSERT INTO organizer_monthly_usage (organizer_id, month, events_created)
    VALUES (NEW.organizer_id, date_trunc('month', NOW())::DATE, 1)
    ON CONFLICT (organizer_id, month)
    DO UPDATE SET events_created = organizer_monthly_usage.events_created + 1;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_event_published_insert
  AFTER INSERT ON events
  FOR EACH ROW EXECUTE FUNCTION fn_track_event_published_insert();

-- 7b. On UPDATE — draft promoted to published
CREATE OR REPLACE FUNCTION fn_track_event_published_update()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF OLD.is_published = FALSE AND NEW.is_published = TRUE THEN
    INSERT INTO organizer_monthly_usage (organizer_id, month, events_created)
    VALUES (NEW.organizer_id, date_trunc('month', NOW())::DATE, 1)
    ON CONFLICT (organizer_id, month)
    DO UPDATE SET events_created = organizer_monthly_usage.events_created + 1;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_event_published_update
  AFTER UPDATE OF is_published ON events
  FOR EACH ROW EXECUTE FUNCTION fn_track_event_published_update();

-- ── 8. Row Level Security ─────────────────────────────────────

ALTER TABLE plan_definitions        ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions           ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizer_monthly_usage ENABLE ROW LEVEL SECURITY;

-- plan_definitions: everyone can read; only admin can write
CREATE POLICY "plans_read_all"  ON plan_definitions FOR SELECT USING (TRUE);
CREATE POLICY "plans_admin_all" ON plan_definitions FOR ALL    USING (is_admin());

-- subscriptions: user reads own record; admin has full access
CREATE POLICY "subs_read_own"  ON subscriptions FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "subs_admin_all" ON subscriptions FOR ALL    USING (is_admin());

-- organizer_monthly_usage: organizer reads own; admin has full access
CREATE POLICY "usage_read_own"  ON organizer_monthly_usage FOR SELECT USING (organizer_id = auth.uid());
CREATE POLICY "usage_admin_all" ON organizer_monthly_usage FOR ALL    USING (is_admin());

-- ── 9. updated_at auto-touch triggers for new tables ─────────
CREATE TRIGGER touch_plan_definitions_updated_at
  BEFORE UPDATE ON plan_definitions
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TRIGGER touch_subscriptions_updated_at
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
