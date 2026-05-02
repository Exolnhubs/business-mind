-- ============================================================
-- Fix: read trigger secret from Supabase Vault instead of
-- app.settings (ALTER DATABASE SET is blocked on hosted plans).
--
-- Before applying:
--   1. Supabase Dashboard → Vault → add secret named
--      'internal_trigger_secret' with a random value
--   2. Set that same value as INTERNAL_TRIGGER_SECRET in Vercel
-- ============================================================

CREATE OR REPLACE FUNCTION notify_booking_cancelled()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  app_url        TEXT;
  trigger_secret TEXT;
BEGIN
  IF (TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM 'cancelled' AND NEW.status = 'cancelled') THEN
    BEGIN
      app_url := coalesce(
        nullif(current_setting('app.settings.app_url', TRUE), ''),
        'https://rawaq-meet.vercel.app'
      );

      SELECT decrypted_secret INTO trigger_secret
      FROM vault.decrypted_secrets
      WHERE name = 'internal_trigger_secret'
      LIMIT 1;

      PERFORM net.http_post(
        url     := app_url || '/api/internal/booking-cancelled',
        body    := jsonb_build_object(
          'booking_id', NEW.id,
          'user_id',    NEW.user_id,
          'event_id',   NEW.event_id
        ),
        headers := jsonb_build_object(
          'Content-Type',       'application/json',
          'x-internal-trigger', coalesce(trigger_secret, '')
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
