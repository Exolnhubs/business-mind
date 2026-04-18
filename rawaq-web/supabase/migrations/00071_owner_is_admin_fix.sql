-- Update is_admin() to treat 'owner' as elevated as 'admin'
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND role IN ('admin', 'owner')
  )
$$;

-- Add updated_at auto-update trigger for platform_settings
CREATE TRIGGER touch_platform_settings_updated_at
  BEFORE UPDATE ON platform_settings
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
