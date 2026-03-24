-- ============================================================
-- Booking cancellation trigger via pg_net
--
-- Fires whenever a booking row transitions to status='cancelled'
-- from any client (mobile direct Supabase, web API, etc.).
-- Calls the Next.js API so the notification pipeline runs.
--
-- IMPORTANT: Set the app_url below to your production URL, or
-- store it as a Supabase secret and read it with vault.decrypted_secrets.
--
-- Requires: pg_net extension (enabled in Supabase by default on Pro/Team).
-- If pg_net is unavailable on your plan, remove this migration and
-- rely solely on the /api/bookings/[id] PATCH route for web cancellations.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION notify_booking_cancelled()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  app_url TEXT := current_setting('app.settings.app_url', TRUE);
  api_url TEXT;
BEGIN
  -- Only fire on transition TO cancelled (not on initial insert as cancelled)
  IF (TG_OP = 'UPDATE' AND OLD.status <> 'cancelled' AND NEW.status = 'cancelled') THEN
    -- Fall back to hardcoded URL if setting not configured
    IF app_url IS NULL OR app_url = '' THEN
      app_url := 'https://your-app.vercel.app';  -- ← UPDATE this
    END IF;

    api_url := app_url || '/api/bookings/' || NEW.id;

    PERFORM net.http_patch(
      url     := api_url,
      body    := '{"status":"cancelled"}'::jsonb,
      headers := '{"Content-Type":"application/json","x-supabase-trigger":"1"}'::jsonb
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER on_booking_cancelled
  AFTER UPDATE ON bookings
  FOR EACH ROW
  EXECUTE FUNCTION notify_booking_cancelled();

-- To configure the app URL without editing this file, run:
-- ALTER DATABASE postgres SET "app.settings.app_url" = 'https://your-app.vercel.app';
