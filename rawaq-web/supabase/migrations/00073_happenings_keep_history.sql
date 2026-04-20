-- ── Migration 00073: Keep happenings as permanent history ─────────────────────
--
-- Happenings are ephemeral in the main community feed (RLS policy gates on
-- expires_at > now()), but deleting them breaks the user profile activity feed.
-- Solution: disable the cleanup cron and make the function a no-op.
-- The main feed RLS already handles visibility; the admin-client profile API
-- can then show all happenings as permanent history.
-- ─────────────────────────────────────────────────────────────────────────────

-- Remove the scheduled cleanup job
DO $$
BEGIN
  PERFORM cron.unschedule('cleanup-expired-happenings');
EXCEPTION WHEN OTHERS THEN
  NULL; -- job doesn't exist or pg_cron unavailable
END;
$$;

-- Replace with no-op so any existing callers don't error
CREATE OR REPLACE FUNCTION fn_cleanup_expired_happenings()
RETURNS void LANGUAGE sql SECURITY DEFINER AS $$
  SELECT 1;
$$;
