-- Individual host foundation:
-- - organizer profile discriminator and individual host fields
-- - orthogonal community host grants
-- - individual organizer plan tiers

ALTER TABLE organizer_profiles
  ADD COLUMN IF NOT EXISTS organizer_type TEXT NOT NULL DEFAULT 'company',
  ADD COLUMN IF NOT EXISTS bio TEXT,
  ADD COLUMN IF NOT EXISTS skills_tags TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS sessions_hosted_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cancellation_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS avg_rating NUMERIC(3,2),
  ADD COLUMN IF NOT EXISTS paid_sessions_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS payout_hold_days INT NOT NULL DEFAULT 3;

DO $$ BEGIN
  ALTER TABLE organizer_profiles
    ADD CONSTRAINT organizer_profiles_organizer_type_values
    CHECK (organizer_type IN ('company', 'individual'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_organizer_profiles_type
  ON organizer_profiles(organizer_type)
  WHERE organizer_type = 'individual';

ALTER TYPE community_role ADD VALUE IF NOT EXISTS 'host' BEFORE 'community_admin';

-- Keep host grants separate from community_memberships.role so a member can be
-- both a community_admin and a host without collapsing the governance axis.
CREATE TABLE IF NOT EXISTS community_hosts (
  community_id UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  granted_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (community_id, user_id)
);

CREATE INDEX IF NOT EXISTS community_hosts_user_idx ON community_hosts(user_id);

ALTER TABLE community_hosts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "community_hosts: public read" ON community_hosts;
CREATE POLICY "community_hosts: public read"
  ON community_hosts FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "community_hosts: owner manage" ON community_hosts;
CREATE POLICY "community_hosts: owner manage"
  ON community_hosts FOR ALL
  USING (is_community_owner(community_id) OR is_admin())
  WITH CHECK (is_community_owner(community_id) OR is_admin());

INSERT INTO plan_definitions
  (id, type, name, name_ar, price_sar, events_per_month, attendees_per_event, platform_fee_pct, features, sort_order)
VALUES
  (
    'ind_free',
    'organizer',
    'Individual Free',
    'Individual Free',
    0,
    5,
    30,
    0.1500,
    '{"free_sessions_only": true, "featured_per_month": 0, "payout_hold_days": 7, "organizer_type": "individual"}'::jsonb,
    11
  ),
  (
    'ind_basic',
    'organizer',
    'Individual Basic',
    'Individual Basic',
    49,
    15,
    60,
    0.1200,
    '{"free_sessions_only": false, "featured_per_month": 0, "payout_hold_days": 3, "organizer_type": "individual"}'::jsonb,
    12
  ),
  (
    'ind_pro',
    'organizer',
    'Individual Pro',
    'Individual Pro',
    129,
    40,
    100,
    0.0800,
    '{"free_sessions_only": false, "featured_per_month": 1, "payout_hold_days": 1, "organizer_type": "individual"}'::jsonb,
    13
  )
ON CONFLICT (id) DO NOTHING;
