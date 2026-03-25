-- ============================================================
--  Migration 00015 — Profile enhancements
--
--  • profiles.phone        — user-editable phone number
--  • profiles.signup_lat   — latitude captured at registration
--  • profiles.signup_lng   — longitude captured at registration
-- ============================================================

ALTER TABLE profiles
  ADD COLUMN phone      TEXT,
  ADD COLUMN signup_lat DOUBLE PRECISION,
  ADD COLUMN signup_lng DOUBLE PRECISION;
