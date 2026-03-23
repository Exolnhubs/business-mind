-- ============================================================
-- ENUMS
-- ============================================================

CREATE TYPE user_role AS ENUM ('user', 'organizer', 'admin');
CREATE TYPE gender_type AS ENUM ('male', 'female', 'mixed');
CREATE TYPE booking_status AS ENUM ('pending', 'confirmed', 'cancelled', 'waitlisted');
CREATE TYPE notification_type AS ENUM (
  'booking_confirmed',
  'booking_cancelled',
  'event_reminder',
  'comment_reply',
  'mention',
  'organizer_approved',
  'event_cancelled',
  'tip_received'
);
CREATE TYPE report_reason AS ENUM (
  'spam',
  'inappropriate',
  'harassment',
  'misinformation',
  'other'
);
CREATE TYPE organizer_status AS ENUM ('pending', 'approved', 'rejected', 'suspended');
