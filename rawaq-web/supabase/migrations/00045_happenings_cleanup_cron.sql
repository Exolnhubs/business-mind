-- ── Migration 00045: Schedule happenings cleanup via pg_cron ──────────────────
--
-- Requires pg_cron extension (enabled by default on Supabase Pro/Team).
-- If pg_cron is not available, use the cleanup-happenings Edge Function instead.
-- The Edge Function and this cron job both call fn_cleanup_expired_happenings()
-- and are safe to run in parallel (idempotent delete).
-- ─────────────────────────────────────────────────────────────────────────────

-- Enable pg_cron if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Grant usage to postgres role (required on Supabase)
GRANT USAGE ON SCHEMA cron TO postgres;

-- Schedule cleanup every 15 minutes
-- Removes happenings that expired more than 1 hour ago (grace period for late reads)
SELECT cron.schedule(
  'cleanup-expired-happenings',
  '*/15 * * * *',
  $$ SELECT fn_cleanup_expired_happenings(); $$
);
