-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 1: Community Tagging Layer + Membership + Event Notifications
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Enums ────────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE community_level AS ENUM (
    'micro',      -- Level 1: compounds, neighborhoods, universities, companies
    'interest',   -- Level 2: tech, sports, gaming, book clubs
    'district',   -- Level 3: New Cairo, Nasr City
    'city',       -- Level 4: Cairo, Alexandria
    'country'     -- Level 5: Egypt
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE community_type AS ENUM (
    'compound', 'neighborhood', 'university', 'company', 'coworking',
    'tech', 'sports', 'gaming', 'book_club', 'entrepreneur', 'arts', 'other',
    'district', 'city', 'country'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE event_visibility AS ENUM (
    'micro',      -- compound / university scoped (enforced in Phase 2)
    'interest',   -- interest community
    'city',       -- all users in a city (current default behavior)
    'national'    -- platform-wide
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── communities ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS communities (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  name_ar      TEXT,
  slug         TEXT UNIQUE NOT NULL,
  description  TEXT,
  description_ar TEXT,
  level        community_level NOT NULL,
  type         community_type  NOT NULL,
  city         TEXT,
  country      TEXT NOT NULL DEFAULT 'EG',
  cover_url    TEXT,
  member_count INT  NOT NULL DEFAULT 0,
  is_verified  BOOLEAN NOT NULL DEFAULT FALSE,
  is_private   BOOLEAN NOT NULL DEFAULT FALSE,
  created_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS communities_city_idx  ON communities(city);
CREATE INDEX IF NOT EXISTS communities_level_idx ON communities(level);
CREATE INDEX IF NOT EXISTS communities_slug_idx  ON communities(slug);

-- ── community_hierarchy (closure table) ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS community_hierarchy (
  parent_id UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  child_id  UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  depth     INT  NOT NULL DEFAULT 1,
  PRIMARY KEY (parent_id, child_id),
  CHECK (parent_id <> child_id)
);

CREATE INDEX IF NOT EXISTS community_hierarchy_child_idx  ON community_hierarchy(child_id);
CREATE INDEX IF NOT EXISTS community_hierarchy_parent_idx ON community_hierarchy(parent_id);

-- ── event_communities (M2M) ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS event_communities (
  event_id     UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  community_id UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  PRIMARY KEY (event_id, community_id)
);

CREATE INDEX IF NOT EXISTS event_communities_community_idx ON event_communities(community_id);
CREATE INDEX IF NOT EXISTS event_communities_event_idx     ON event_communities(event_id);

-- ── community_memberships ─────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE community_role AS ENUM ('member', 'moderator', 'admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS community_memberships (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role         community_role NOT NULL DEFAULT 'member',
  joined_at    TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  UNIQUE (community_id, user_id)
);

CREATE INDEX IF NOT EXISTS community_memberships_user_idx      ON community_memberships(user_id);
CREATE INDEX IF NOT EXISTS community_memberships_community_idx ON community_memberships(community_id);

-- ── events: add visibility_type ───────────────────────────────────────────────

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS visibility_type event_visibility NOT NULL DEFAULT 'city';

-- ── notification enum: add community_new_event ────────────────────────────────

ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'community_new_event';

-- ── member_count trigger ──────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION fn_update_community_member_count()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE communities SET member_count = member_count + 1 WHERE id = NEW.community_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE communities SET member_count = GREATEST(member_count - 1, 0) WHERE id = OLD.community_id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_community_member_count ON community_memberships;
CREATE TRIGGER trg_community_member_count
  AFTER INSERT OR DELETE ON community_memberships
  FOR EACH ROW EXECUTE FUNCTION fn_update_community_member_count();

-- ── RLS ───────────────────────────────────────────────────────────────────────

ALTER TABLE communities           ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_hierarchy   ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_communities     ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_memberships ENABLE ROW LEVEL SECURITY;

-- communities: public read; only admins write
CREATE POLICY "public read communities"
  ON communities FOR SELECT USING (true);

CREATE POLICY "admin manage communities"
  ON communities FOR ALL
  USING ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');

-- hierarchy: public read
CREATE POLICY "public read community_hierarchy"
  ON community_hierarchy FOR SELECT USING (true);

CREATE POLICY "admin manage community_hierarchy"
  ON community_hierarchy FOR ALL
  USING ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');

-- event_communities: public read; organizer writes for their own events
CREATE POLICY "public read event_communities"
  ON event_communities FOR SELECT USING (true);

CREATE POLICY "organizer manage event_communities"
  ON event_communities FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM events
      WHERE events.id = event_communities.event_id
        AND events.organizer_id = auth.uid()
    )
  );

CREATE POLICY "admin manage event_communities"
  ON event_communities FOR ALL
  USING ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');

-- memberships: users read their own; read own community members (Phase 2 scope)
CREATE POLICY "read own membership"
  ON community_memberships FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "read community members"
  ON community_memberships FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM community_memberships cm2
      WHERE cm2.community_id = community_memberships.community_id
        AND cm2.user_id = auth.uid()
    )
  );

CREATE POLICY "user join community"
  ON community_memberships FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "user leave community"
  ON community_memberships FOR DELETE
  USING (user_id = auth.uid());

-- ── Seed: foundational communities ───────────────────────────────────────────

INSERT INTO communities (name, name_ar, slug, level, type, city, country, is_verified) VALUES
  -- Country
  ('Egypt',          'مصر',            'country-egypt',          'country',  'country',  NULL,          'EG', TRUE),
  ('Saudi Arabia',   'المملكة العربية السعودية', 'country-sa', 'country', 'country', NULL, 'SA', TRUE),

  -- Egypt Cities
  ('Cairo',          'القاهرة',         'city-cairo',             'city',     'city',     'Cairo',       'EG', TRUE),
  ('Alexandria',     'الإسكندرية',      'city-alexandria',        'city',     'city',     'Alexandria',  'EG', TRUE),
  ('Giza',           'الجيزة',          'city-giza',              'city',     'city',     'Giza',        'EG', TRUE),

  -- SA Cities
  ('Riyadh',         'الرياض',          'city-riyadh',            'city',     'city',     'Riyadh',      'SA', TRUE),
  ('Jeddah',         'جدة',             'city-jeddah',            'city',     'city',     'Jeddah',      'SA', TRUE),
  ('Dammam',         'الدمام',          'city-dammam',            'city',     'city',     'Dammam',      'SA', TRUE),

  -- Egypt Districts (Cairo)
  ('New Cairo',      'القاهرة الجديدة', 'district-new-cairo',     'district', 'district', 'Cairo',       'EG', TRUE),
  ('Nasr City',      'مدينة نصر',       'district-nasr-city',     'district', 'district', 'Cairo',       'EG', TRUE),
  ('Maadi',          'المعادي',         'district-maadi',         'district', 'district', 'Cairo',       'EG', TRUE),
  ('Zamalek',        'الزمالك',         'district-zamalek',       'district', 'district', 'Cairo',       'EG', TRUE),
  ('Heliopolis',     'مصر الجديدة',     'district-heliopolis',    'district', 'district', 'Cairo',       'EG', TRUE),
  ('6th of October', '6 أكتوبر',        'district-6th-october',   'district', 'district', 'Giza',        'EG', TRUE),
  ('Sheikh Zayed',   'الشيخ زايد',      'district-sheikh-zayed',  'district', 'district', 'Giza',        'EG', TRUE),

  -- Interest Communities (Cairo)
  ('Cairo Tech Community',   'مجتمع التكنولوجيا - القاهرة', 'interest-cairo-tech',      'interest', 'tech',        'Cairo', 'EG', FALSE),
  ('Cairo Sports Community', 'مجتمع الرياضة - القاهرة',     'interest-cairo-sports',    'interest', 'sports',      'Cairo', 'EG', FALSE),
  ('Cairo Gaming Community', 'مجتمع الألعاب - القاهرة',     'interest-cairo-gaming',    'interest', 'gaming',      'Cairo', 'EG', FALSE),
  ('Cairo Book Club',        'نادي الكتاب - القاهرة',       'interest-cairo-books',     'interest', 'book_club',   'Cairo', 'EG', FALSE),
  ('Cairo Entrepreneurs',    'ريادة الأعمال - القاهرة',     'interest-cairo-founders',  'interest', 'entrepreneur','Cairo', 'EG', FALSE),
  ('Cairo Arts & Culture',   'الفنون والثقافة - القاهرة',   'interest-cairo-arts',      'interest', 'arts',        'Cairo', 'EG', FALSE),

  -- Micro Communities (sample compounds)
  ('Madinaty Residents',     'سكان مدينتي',       'micro-madinaty',       'micro', 'compound', 'Cairo', 'EG', FALSE),
  ('Palm Hills',             'بالم هيلز',         'micro-palm-hills',     'micro', 'compound', 'Giza',  'EG', FALSE),
  ('Hyde Park Cairo',        'هايد بارك القاهرة', 'micro-hyde-park',      'micro', 'compound', 'Cairo', 'EG', FALSE),
  ('The American University in Cairo', 'الجامعة الأمريكية', 'micro-auc', 'micro', 'university', 'Cairo', 'EG', FALSE)
ON CONFLICT (slug) DO NOTHING;

-- ── Seed: hierarchy links ─────────────────────────────────────────────────────

-- Helper to get ID by slug
CREATE OR REPLACE FUNCTION _get_community_id(p_slug TEXT) RETURNS UUID AS $$
  SELECT id FROM communities WHERE slug = p_slug;
$$ LANGUAGE sql;

INSERT INTO community_hierarchy (parent_id, child_id, depth)
SELECT _get_community_id('country-egypt'), _get_community_id(child_slug), 1
FROM (VALUES
  ('city-cairo'), ('city-alexandria'), ('city-giza'),
  ('interest-cairo-tech'), ('interest-cairo-sports'), ('interest-cairo-gaming'),
  ('interest-cairo-books'), ('interest-cairo-founders'), ('interest-cairo-arts')
) t(child_slug)
WHERE _get_community_id('country-egypt') IS NOT NULL
  AND _get_community_id(child_slug) IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO community_hierarchy (parent_id, child_id, depth)
SELECT _get_community_id('city-cairo'), _get_community_id(child_slug), 1
FROM (VALUES
  ('district-new-cairo'), ('district-nasr-city'), ('district-maadi'),
  ('district-zamalek'), ('district-heliopolis'),
  ('interest-cairo-tech'), ('interest-cairo-sports'), ('interest-cairo-gaming'),
  ('interest-cairo-books'), ('interest-cairo-founders'), ('interest-cairo-arts')
) t(child_slug)
WHERE _get_community_id('city-cairo') IS NOT NULL
  AND _get_community_id(child_slug) IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO community_hierarchy (parent_id, child_id, depth)
SELECT _get_community_id('city-giza'), _get_community_id(child_slug), 1
FROM (VALUES
  ('district-6th-october'), ('district-sheikh-zayed'), ('micro-palm-hills')
) t(child_slug)
WHERE _get_community_id('city-giza') IS NOT NULL
  AND _get_community_id(child_slug) IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO community_hierarchy (parent_id, child_id, depth)
SELECT _get_community_id('district-new-cairo'), _get_community_id(child_slug), 1
FROM (VALUES ('micro-madinaty'), ('micro-hyde-park'), ('micro-auc')) t(child_slug)
WHERE _get_community_id('district-new-cairo') IS NOT NULL
  AND _get_community_id(child_slug) IS NOT NULL
ON CONFLICT DO NOTHING;

-- Clean up helper function
DROP FUNCTION IF EXISTS _get_community_id(TEXT);

-- ── RPC: get communities for a user ──────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_user_communities(p_user_id UUID)
RETURNS TABLE (
  community_id UUID,
  community_name TEXT,
  community_slug TEXT,
  community_level community_level,
  community_type community_type
) LANGUAGE sql SECURITY DEFINER AS $$
  SELECT c.id, c.name, c.slug, c.level, c.type
  FROM community_memberships cm
  JOIN communities c ON c.id = cm.community_id
  WHERE cm.user_id = p_user_id
  ORDER BY c.level, c.name;
$$;
