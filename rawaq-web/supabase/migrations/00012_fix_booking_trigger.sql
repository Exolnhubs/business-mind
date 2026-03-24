-- ============================================================
-- Fix: replace broken http_patch trigger with http_post
--
-- pg_net only exposes net.http_post / net.http_get — there is no
-- net.http_patch. The previous trigger was silently rolling back
-- every booking cancellation. This migration drops it and replaces
-- it with a POST-based trigger that calls a dedicated internal
-- endpoint. The EXCEPTION block ensures the notification side-effect
-- can NEVER block or roll back the booking update itself.
-- ============================================================

-- Drop old broken trigger + function
DROP TRIGGER IF EXISTS on_booking_cancelled ON bookings;
DROP FUNCTION IF EXISTS notify_booking_cancelled();

CREATE OR REPLACE FUNCTION notify_booking_cancelled()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  app_url TEXT;
BEGIN
  IF (TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM 'cancelled' AND NEW.status = 'cancelled') THEN
    BEGIN
      app_url := coalesce(
        nullif(current_setting('app.settings.app_url', TRUE), ''),
        'https://your-app.vercel.app'   -- ← update or run the ALTER DATABASE below
      );

      PERFORM net.http_post(
        url     := app_url || '/api/internal/booking-cancelled',
        body    := jsonb_build_object(
          'booking_id', NEW.id,
          'user_id',    NEW.user_id,
          'event_id',   NEW.event_id
        ),
        headers := jsonb_build_object(
          'Content-Type',       'application/json',
          'x-internal-trigger', current_setting('app.settings.trigger_secret', TRUE)
        )
      );
    EXCEPTION WHEN OTHERS THEN
      -- Notification is a side-effect; never abort the booking transaction
      NULL;
    END;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER on_booking_cancelled
  AFTER UPDATE ON bookings
  FOR EACH ROW
  EXECUTE FUNCTION notify_booking_cancelled();

-- Run these once in your Supabase SQL editor to configure without editing migrations:
-- ALTER DATABASE postgres SET "app.settings.app_url"        = 'https://your-app.vercel.app';
-- ALTER DATABASE postgres SET "app.settings.trigger_secret" = 'your-trigger-secret-here';
