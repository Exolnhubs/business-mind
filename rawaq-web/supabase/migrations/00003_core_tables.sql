-- ============================================================
-- CORE TABLES
-- ============================================================

-- ----------------------------------------------------------
-- PROFILES
-- Extends Supabase auth.users (1:1 relationship)
-- ----------------------------------------------------------
CREATE TABLE profiles (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name  TEXT NOT NULL,
  avatar_url    TEXT,
  role          user_role NOT NULL DEFAULT 'user',
  gender        gender_type,
  city          TEXT,
  bio           TEXT,
  -- preferences stored as JSONB for flexibility
  -- e.g. {"language": "ar", "notifications": true, "show_gender": false}
  preferences   JSONB NOT NULL DEFAULT '{}',
  is_banned     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE profiles IS 'Public profile for every authenticated user.';

-- ----------------------------------------------------------
-- ORGANIZER PROFILES
-- Extra info for users with role = organizer
-- ----------------------------------------------------------
CREATE TABLE organizer_profiles (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id        UUID NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
  business_name  TEXT NOT NULL,
  business_name_ar TEXT,
  description    TEXT,
  description_ar TEXT,
  logo_url       TEXT,
  website        TEXT,
  phone          TEXT,
  status         organizer_status NOT NULL DEFAULT 'pending',
  verified       BOOLEAN NOT NULL DEFAULT FALSE,
  reviewed_by    UUID REFERENCES profiles(id),
  reviewed_at    TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE organizer_profiles IS 'Additional details for organizer accounts.';

-- ----------------------------------------------------------
-- EVENT CATEGORIES
-- ----------------------------------------------------------
CREATE TABLE event_categories (
  id        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name_en   TEXT NOT NULL UNIQUE,
  name_ar   TEXT NOT NULL UNIQUE,
  icon      TEXT,                    -- icon name / emoji slug
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

COMMENT ON TABLE event_categories IS 'Bilingual event categories.';

-- ----------------------------------------------------------
-- EVENTS
-- ----------------------------------------------------------
CREATE TABLE events (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organizer_id        UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  category_id         UUID REFERENCES event_categories(id) ON DELETE SET NULL,

  -- Content
  title               TEXT NOT NULL,
  title_ar            TEXT,
  description         TEXT,
  description_ar      TEXT,
  cover_image_url     TEXT,

  -- Schedule
  start_at            TIMESTAMPTZ NOT NULL,
  end_at              TIMESTAMPTZ,

  -- Location
  venue_name          TEXT,
  venue_name_ar       TEXT,
  address             TEXT,
  city                TEXT NOT NULL,
  country             TEXT NOT NULL DEFAULT 'SA',
  lat                 DOUBLE PRECISION,
  lng                 DOUBLE PRECISION,
  location            GEOGRAPHY(POINT, 4326),   -- PostGIS point

  -- Capacity & access
  capacity            INT,                       -- NULL = unlimited
  is_free             BOOLEAN NOT NULL DEFAULT TRUE,
  price               NUMERIC(10, 2),            -- NULL if free
  currency            TEXT NOT NULL DEFAULT 'SAR',

  -- Cultural filters
  gender_restriction  gender_type NOT NULL DEFAULT 'mixed',
  is_family_friendly  BOOLEAN NOT NULL DEFAULT TRUE,
  is_private          BOOLEAN NOT NULL DEFAULT FALSE,

  -- Status
  is_published        BOOLEAN NOT NULL DEFAULT FALSE,
  is_cancelled        BOOLEAN NOT NULL DEFAULT FALSE,
  cancelled_reason    TEXT,

  -- Stats (denormalized for performance)
  bookings_count      INT NOT NULL DEFAULT 0,
  views_count         INT NOT NULL DEFAULT 0,
  tips_total          NUMERIC(12, 2) NOT NULL DEFAULT 0,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE events IS 'Core events table. Supports geo-queries via PostGIS.';

-- ----------------------------------------------------------
-- BOOKINGS
-- ----------------------------------------------------------
CREATE TABLE bookings (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  event_id    UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  status      booking_status NOT NULL DEFAULT 'confirmed',
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (user_id, event_id)
);

COMMENT ON TABLE bookings IS 'Event registrations. Enforces capacity and unique booking per user.';

-- ----------------------------------------------------------
-- TIPS
-- ----------------------------------------------------------
CREATE TABLE tips (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id           UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  event_id          UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  organizer_id      UUID NOT NULL REFERENCES profiles(id),
  amount            NUMERIC(10, 2) NOT NULL CHECK (amount > 0),
  currency          TEXT NOT NULL DEFAULT 'SAR',
  -- payment_ref would hold external gateway ref in production
  payment_ref       TEXT,
  is_simulated      BOOLEAN NOT NULL DEFAULT TRUE,  -- MVP: mock payments
  message           TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE tips IS 'Organizer tips. MVP uses simulated payments.';

-- ----------------------------------------------------------
-- COMMENTS
-- ----------------------------------------------------------
CREATE TABLE comments (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  event_id      UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  parent_id     UUID REFERENCES comments(id) ON DELETE CASCADE, -- nullable = top-level
  content       TEXT NOT NULL CHECK (char_length(content) BETWEEN 1 AND 2000),
  content_html  TEXT,                       -- sanitized HTML (optional rich rendering)
  mentions      UUID[] NOT NULL DEFAULT '{}', -- array of profile IDs mentioned
  is_deleted    BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at    TIMESTAMPTZ,
  is_flagged    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE comments IS 'Threaded event comments with mention support.';

-- ----------------------------------------------------------
-- COMMENT REPORTS
-- ----------------------------------------------------------
CREATE TABLE comment_reports (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  comment_id  UUID NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
  reporter_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  reason      report_reason NOT NULL,
  details     TEXT,
  resolved    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (comment_id, reporter_id)
);

-- ----------------------------------------------------------
-- GLOBAL CHAT
-- Separate from event comments — platform-wide feed
-- ----------------------------------------------------------
CREATE TABLE global_chat (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content     TEXT NOT NULL CHECK (char_length(content) BETWEEN 1 AND 1000),
  mentions    UUID[] NOT NULL DEFAULT '{}',
  is_deleted  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE global_chat IS 'Platform-wide real-time chat feed.';

-- ----------------------------------------------------------
-- NOTIFICATIONS
-- ----------------------------------------------------------
CREATE TABLE notifications (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type        notification_type NOT NULL,
  -- flexible payload: event_id, comment_id, actor_id, etc.
  payload     JSONB NOT NULL DEFAULT '{}',
  is_read     BOOLEAN NOT NULL DEFAULT FALSE,
  read_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE notifications IS 'In-app notification inbox per user.';

-- ----------------------------------------------------------
-- DEVICE TOKENS  (FCM push notifications)
-- ----------------------------------------------------------
CREATE TABLE device_tokens (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  token       TEXT NOT NULL,
  platform    TEXT NOT NULL CHECK (platform IN ('ios', 'android', 'web')),
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (user_id, token)
);

-- ----------------------------------------------------------
-- EVENT VIEWS  (analytics)
-- ----------------------------------------------------------
CREATE TABLE event_views (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id    UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id     UUID REFERENCES profiles(id) ON DELETE SET NULL, -- NULL = anonymous
  ip_hash     TEXT,          -- hashed for privacy
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE event_views IS 'Event view analytics. User_id nullable for anonymous views.';
