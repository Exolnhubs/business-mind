-- ============================================================
-- Auto-create organizer_profiles on organizer signup
-- Also adds suspend_reason column for admin notes
-- ============================================================

-- Add optional suspend_reason column for admin notes
ALTER TABLE organizer_profiles
  ADD COLUMN IF NOT EXISTS suspend_reason TEXT;

-- ----------------------------------------------------------
-- Trigger: auto-create organizer_profiles when a profile
-- with role='organizer' is inserted or role is updated to
-- 'organizer' (e.g. admin promotes a user).
-- business_name defaults to display_name as a placeholder
-- the organizer can update later.
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_auto_create_organizer_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_business_name TEXT;
  v_meta          JSONB;
BEGIN
  -- Try to pull business_name from auth.users metadata (set during signup)
  SELECT raw_user_meta_data INTO v_meta
  FROM auth.users
  WHERE id = NEW.id;

  v_business_name := COALESCE(
    NULLIF(TRIM(v_meta->>'business_name'), ''),
    NEW.display_name
  );

  -- INSERT: new organizer profile
  IF TG_OP = 'INSERT' AND NEW.role = 'organizer' THEN
    INSERT INTO organizer_profiles (user_id, business_name, status)
    VALUES (NEW.id, v_business_name, 'pending')
    ON CONFLICT (user_id) DO NOTHING;

  -- UPDATE: role changed to organizer
  ELSIF TG_OP = 'UPDATE'
    AND OLD.role <> 'organizer'
    AND NEW.role = 'organizer'
  THEN
    INSERT INTO organizer_profiles (user_id, business_name, status)
    VALUES (NEW.id, v_business_name, 'pending')
    ON CONFLICT (user_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_auto_create_organizer_profile
  AFTER INSERT OR UPDATE OF role ON profiles
  FOR EACH ROW EXECUTE FUNCTION fn_auto_create_organizer_profile();

-- ----------------------------------------------------------
-- Back-fill: create pending organizer_profiles for any
-- existing organizer accounts that don't have one yet.
-- ----------------------------------------------------------
INSERT INTO organizer_profiles (user_id, business_name, status)
SELECT p.id, p.display_name, 'pending'
FROM profiles p
WHERE p.role = 'organizer'
  AND NOT EXISTS (
    SELECT 1 FROM organizer_profiles op WHERE op.user_id = p.id
  )
ON CONFLICT (user_id) DO NOTHING;
