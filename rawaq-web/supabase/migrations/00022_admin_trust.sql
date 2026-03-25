-- ─────────────────────────────────────────────────────────────────────────────
-- 00022 · Admin & Trust: event_reports, audit_logs, user_warnings
-- ─────────────────────────────────────────────────────────────────────────────

-- ── New enum values ───────────────────────────────────────────────────────────
-- Audit action enum
DO $$ BEGIN
  CREATE TYPE audit_action AS ENUM (
    'ban_user',
    'unban_user',
    'warn_user',
    'delete_user',
    'approve_organizer',
    'reject_organizer',
    'suspend_organizer',
    'publish_event',
    'unpublish_event',
    'cancel_event',
    'resolve_report',
    'dismiss_report',
    'assign_plan'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Warning severity enum
DO $$ BEGIN
  CREATE TYPE warning_severity AS ENUM ('low', 'medium', 'high');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Report status enum
DO $$ BEGIN
  CREATE TYPE report_status AS ENUM ('pending', 'resolved', 'dismissed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── event_reports ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS event_reports (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    UUID         NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  reporter_id UUID         NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  reason      report_reason NOT NULL,
  details     TEXT,
  status      report_status NOT NULL DEFAULT 'pending',
  resolved_by UUID         REFERENCES profiles(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  resolution_note TEXT,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (event_id, reporter_id)
);

-- ── audit_logs ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_logs (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id    UUID         NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  action      audit_action NOT NULL,
  target_type TEXT         NOT NULL,           -- 'user', 'event', 'organizer', 'report'
  target_id   UUID         NOT NULL,
  meta        JSONB        NOT NULL DEFAULT '{}', -- snapshot of relevant fields
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── user_warnings ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_warnings (
  id          UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID             NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  issued_by   UUID             NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  severity    warning_severity NOT NULL DEFAULT 'medium',
  reason      TEXT             NOT NULL,
  internal_note TEXT,                          -- admin-only note, not shown to user
  acknowledged BOOLEAN         NOT NULL DEFAULT FALSE,
  acknowledged_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ      NOT NULL DEFAULT NOW()
);

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_event_reports_event    ON event_reports(event_id);
CREATE INDEX IF NOT EXISTS idx_event_reports_reporter ON event_reports(reporter_id);
CREATE INDEX IF NOT EXISTS idx_event_reports_status   ON event_reports(status);
CREATE INDEX IF NOT EXISTS idx_audit_logs_admin       ON audit_logs(admin_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_target      ON audit_logs(target_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action      ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created     ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_warnings_user     ON user_warnings(user_id);
CREATE INDEX IF NOT EXISTS idx_user_warnings_issued   ON user_warnings(issued_by);

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE event_reports  ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs     ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_warnings  ENABLE ROW LEVEL SECURITY;

-- event_reports: any authenticated user can insert their own report
CREATE POLICY "event_reports: own insert"
  ON event_reports FOR INSERT
  WITH CHECK (auth.uid() = reporter_id);

-- event_reports: users can read their own reports
CREATE POLICY "event_reports: own read"
  ON event_reports FOR SELECT
  USING (auth.uid() = reporter_id);

-- event_reports: admin full access
CREATE POLICY "event_reports: admin full"
  ON event_reports FOR ALL
  USING (is_admin());

-- audit_logs: append-only for admins (no update/delete)
CREATE POLICY "audit_logs: admin insert"
  ON audit_logs FOR INSERT
  WITH CHECK (is_admin());

CREATE POLICY "audit_logs: admin read"
  ON audit_logs FOR SELECT
  USING (is_admin());

-- user_warnings: admin full access
CREATE POLICY "user_warnings: admin full"
  ON user_warnings FOR ALL
  USING (is_admin());

-- user_warnings: users can read their own warnings (so they can acknowledge)
CREATE POLICY "user_warnings: own read"
  ON user_warnings FOR SELECT
  USING (auth.uid() = user_id);

-- user_warnings: users can acknowledge their own warnings
CREATE POLICY "user_warnings: own acknowledge"
  ON user_warnings FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND acknowledged = TRUE  -- can only flip to true, not revert
  );
