-- ============================================================
-- INDEXES
-- ============================================================

-- profiles
CREATE INDEX idx_profiles_role        ON profiles(role);
CREATE INDEX idx_profiles_city        ON profiles(city);
CREATE INDEX idx_profiles_is_banned   ON profiles(is_banned);

-- organizer_profiles
CREATE INDEX idx_organizer_profiles_status ON organizer_profiles(status);
CREATE INDEX idx_organizer_profiles_user   ON organizer_profiles(user_id);

-- events — primary query patterns
CREATE INDEX idx_events_organizer     ON events(organizer_id);
CREATE INDEX idx_events_category      ON events(category_id);
CREATE INDEX idx_events_city          ON events(city);
CREATE INDEX idx_events_start_at      ON events(start_at);
CREATE INDEX idx_events_is_published  ON events(is_published);
CREATE INDEX idx_events_is_cancelled  ON events(is_cancelled);
CREATE INDEX idx_events_gender        ON events(gender_restriction);
CREATE INDEX idx_events_family        ON events(is_family_friendly);

-- Composite: browse feed (published + not cancelled + ordered by date)
CREATE INDEX idx_events_feed
  ON events(is_published, is_cancelled, start_at DESC)
  WHERE is_published = TRUE AND is_cancelled = FALSE;

-- Full-text search on events (English + Arabic)
CREATE INDEX idx_events_fts ON events
  USING GIN (
    to_tsvector('simple',
      COALESCE(title, '') || ' ' ||
      COALESCE(title_ar, '') || ' ' ||
      COALESCE(description, '') || ' ' ||
      COALESCE(city, '')
    )
  );

-- PostGIS spatial index
CREATE INDEX idx_events_location ON events USING GIST (location);

-- bookings
CREATE INDEX idx_bookings_user    ON bookings(user_id);
CREATE INDEX idx_bookings_event   ON bookings(event_id);
CREATE INDEX idx_bookings_status  ON bookings(status);

-- tips
CREATE INDEX idx_tips_user        ON tips(user_id);
CREATE INDEX idx_tips_event       ON tips(event_id);
CREATE INDEX idx_tips_organizer   ON tips(organizer_id);

-- comments
CREATE INDEX idx_comments_event   ON comments(event_id);
CREATE INDEX idx_comments_user    ON comments(user_id);
CREATE INDEX idx_comments_parent  ON comments(parent_id);
CREATE INDEX idx_comments_created ON comments(created_at DESC);
-- GIN index for mention lookups
CREATE INDEX idx_comments_mentions ON comments USING GIN (mentions);

-- global_chat
CREATE INDEX idx_global_chat_user    ON global_chat(user_id);
CREATE INDEX idx_global_chat_created ON global_chat(created_at DESC);
CREATE INDEX idx_global_chat_mentions ON global_chat USING GIN (mentions);

-- notifications
CREATE INDEX idx_notifications_user    ON notifications(user_id);
CREATE INDEX idx_notifications_unread  ON notifications(user_id, is_read)
  WHERE is_read = FALSE;
CREATE INDEX idx_notifications_type    ON notifications(type);

-- device_tokens
CREATE INDEX idx_device_tokens_user   ON device_tokens(user_id);
CREATE INDEX idx_device_tokens_active ON device_tokens(user_id, is_active)
  WHERE is_active = TRUE;

-- event_views
CREATE INDEX idx_event_views_event   ON event_views(event_id);
CREATE INDEX idx_event_views_user    ON event_views(user_id);
CREATE INDEX idx_event_views_created ON event_views(created_at DESC);
