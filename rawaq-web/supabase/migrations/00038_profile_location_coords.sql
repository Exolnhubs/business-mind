-- Migration: add lat/lng to profiles for saved/current location
-- Separate from signup_lat/signup_lng (registration snapshot).
-- These are updated whenever the user re-detects their location.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS lng DOUBLE PRECISION;

COMMENT ON COLUMN profiles.lat IS 'User''s saved current latitude (updated on each "detect location" action)';
COMMENT ON COLUMN profiles.lng IS 'User''s saved current longitude (updated on each "detect location" action)';
