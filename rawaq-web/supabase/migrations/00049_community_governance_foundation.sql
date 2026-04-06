-- Community governance foundation:
-- - community-scoped happening moderation workflow
-- - community-scoped member warnings and sanctions
-- - community-scoped audit trail

DO $$ BEGIN
  CREATE TYPE community_sanction_type AS ENUM ('timeout', 'removed', 'banned');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE community_audit_action AS ENUM (
    'assign_community_admin',
    'revoke_community_admin',
    'resolve_happening_report',
    'dismiss_happening_report',
    'delete_happening',
    'warn_member',
    'timeout_member',
    'remove_member',
    'ban_member',
    'unban_member',
    'revoke_sanction'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION is_community_owner(
  p_community_id UUID,
  p_user_id UUID DEFAULT auth.uid()
) RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM communities
    WHERE id = p_community_id
      AND owner_user_id = p_user_id
  );
$$;

CREATE OR REPLACE FUNCTION is_community_manager(
  p_community_id UUID,
  p_user_id UUID DEFAULT auth.uid()
) RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    is_admin()
    OR EXISTS (
      SELECT 1
      FROM communities
      WHERE id = p_community_id
        AND owner_user_id = p_user_id
    )
    OR EXISTS (
      SELECT 1
      FROM community_memberships
      WHERE community_id = p_community_id
        AND user_id = p_user_id
        AND role IN ('owner', 'community_admin')
    );
$$;

ALTER TABLE happening_reports
  ADD COLUMN IF NOT EXISTS community_id UUID REFERENCES communities(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS status report_status NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS resolved_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS resolution_note TEXT;

UPDATE happening_reports hr
SET community_id = h.community_id
FROM happenings h
WHERE h.id = hr.happening_id
  AND hr.community_id IS NULL;

CREATE OR REPLACE FUNCTION fn_sync_happening_report_community_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.community_id IS NULL THEN
    SELECT community_id
    INTO NEW.community_id
    FROM happenings
    WHERE id = NEW.happening_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_happening_report_community_id ON happening_reports;
CREATE TRIGGER trg_sync_happening_report_community_id
  BEFORE INSERT OR UPDATE OF happening_id ON happening_reports
  FOR EACH ROW
  EXECUTE FUNCTION fn_sync_happening_report_community_id();

CREATE INDEX IF NOT EXISTS happening_reports_community_idx ON happening_reports(community_id);
CREATE INDEX IF NOT EXISTS happening_reports_status_idx ON happening_reports(status);
CREATE INDEX IF NOT EXISTS happening_reports_assigned_idx ON happening_reports(assigned_to);

DROP POLICY IF EXISTS "happening_reports: admin full" ON happening_reports;

CREATE POLICY "happening_reports: community manager read"
  ON happening_reports FOR SELECT
  USING (community_id IS NOT NULL AND is_community_manager(community_id));

CREATE POLICY "happening_reports: community manager update"
  ON happening_reports FOR UPDATE
  USING (community_id IS NOT NULL AND is_community_manager(community_id))
  WITH CHECK (community_id IS NOT NULL AND is_community_manager(community_id));

CREATE POLICY "happening_reports: community manager delete"
  ON happening_reports FOR DELETE
  USING (community_id IS NOT NULL AND is_community_manager(community_id));

CREATE TABLE IF NOT EXISTS community_member_warnings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  issued_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  severity warning_severity NOT NULL DEFAULT 'medium',
  reason TEXT NOT NULL,
  internal_note TEXT,
  acknowledged BOOLEAN NOT NULL DEFAULT FALSE,
  acknowledged_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS community_member_warnings_community_idx ON community_member_warnings(community_id);
CREATE INDEX IF NOT EXISTS community_member_warnings_user_idx ON community_member_warnings(user_id);
CREATE INDEX IF NOT EXISTS community_member_warnings_issued_idx ON community_member_warnings(issued_by);

ALTER TABLE community_member_warnings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "community_member_warnings: manager full"
  ON community_member_warnings FOR ALL
  USING (is_community_manager(community_id))
  WITH CHECK (is_community_manager(community_id));

CREATE POLICY "community_member_warnings: own read"
  ON community_member_warnings FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "community_member_warnings: own acknowledge"
  ON community_member_warnings FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND acknowledged = TRUE
  );

CREATE TABLE IF NOT EXISTS community_member_sanctions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  issued_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  sanction_type community_sanction_type NOT NULL,
  reason TEXT NOT NULL,
  internal_note TEXT,
  starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ends_at TIMESTAMPTZ,
  revoked_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  revoked_at TIMESTAMPTZ,
  revoke_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (ends_at IS NULL OR ends_at >= starts_at)
);

CREATE INDEX IF NOT EXISTS community_member_sanctions_community_idx ON community_member_sanctions(community_id);
CREATE INDEX IF NOT EXISTS community_member_sanctions_user_idx ON community_member_sanctions(user_id);
CREATE INDEX IF NOT EXISTS community_member_sanctions_type_idx ON community_member_sanctions(sanction_type);
CREATE INDEX IF NOT EXISTS community_member_sanctions_active_idx
  ON community_member_sanctions(community_id, user_id, sanction_type, ends_at)
  WHERE revoked_at IS NULL;

ALTER TABLE community_member_sanctions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "community_member_sanctions: manager full"
  ON community_member_sanctions FOR ALL
  USING (is_community_manager(community_id))
  WITH CHECK (is_community_manager(community_id));

CREATE POLICY "community_member_sanctions: own read"
  ON community_member_sanctions FOR SELECT
  USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS community_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  actor_user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  action community_audit_action NOT NULL,
  target_type TEXT NOT NULL,
  target_id UUID NOT NULL,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS community_audit_logs_community_idx ON community_audit_logs(community_id, created_at DESC);
CREATE INDEX IF NOT EXISTS community_audit_logs_actor_idx ON community_audit_logs(actor_user_id);
CREATE INDEX IF NOT EXISTS community_audit_logs_action_idx ON community_audit_logs(action);

ALTER TABLE community_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "community_audit_logs: manager insert"
  ON community_audit_logs FOR INSERT
  WITH CHECK (is_community_manager(community_id));

CREATE POLICY "community_audit_logs: manager read"
  ON community_audit_logs FOR SELECT
  USING (is_community_manager(community_id));
