-- Add 'owner' value to the user_role enum (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'owner'
      AND enumtypid = 'user_role'::regtype
  ) THEN
    ALTER TYPE user_role ADD VALUE 'owner';
  END IF;
END $$;

-- Platform-wide key/value settings (one row per setting key)
CREATE TABLE IF NOT EXISTS platform_settings (
  key         TEXT PRIMARY KEY,
  value       JSONB        NOT NULL,
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_by  UUID         REFERENCES profiles(id) ON DELETE SET NULL
);

-- Seed sensible defaults (safe to re-run)
INSERT INTO platform_settings (key, value) VALUES
  ('organizer_applications_enabled', 'true'::jsonb),
  ('maintenance_mode',               'false'::jsonb),
  ('maintenance_message',            '""'::jsonb),
  ('default_platform_fee_pct',       '0.10'::jsonb)
ON CONFLICT (key) DO NOTHING;
