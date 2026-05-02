-- ============================================================
-- Fix: update hardcoded fallback URL in booking-cancelled trigger
--
-- ALTER DATABASE SET is blocked on Supabase hosted plans.
-- Recreating the function is the only way to update the fallback.
-- ============================================================

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
        'https://rawaq-meet.vercel.app'
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
