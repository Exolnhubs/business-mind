-- ============================================================
-- Migration 00035 — Fix donation upsert + notification enum drift
--
-- 1. Convert tips(payment_ref) into a normal unique index so
--    ON CONFLICT (payment_ref) works for real donation finalization.
-- 2. Add notification enum values that exist in application code
--    but were never added to the database enum.
-- ============================================================

DROP INDEX IF EXISTS uq_tips_payment_ref;

CREATE UNIQUE INDEX IF NOT EXISTS uq_tips_payment_ref
  ON tips(payment_ref);

ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'waitlist_promoted';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'new_follower';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'new_review';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'new_attendee';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'new_comment';
