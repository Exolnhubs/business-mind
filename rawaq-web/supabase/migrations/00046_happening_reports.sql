-- ── Migration 00046: Happening reports (basic trust/safety) ──────────────────

CREATE TABLE happening_reports (
  happening_id uuid NOT NULL REFERENCES happenings(id) ON DELETE CASCADE,
  reporter_id  uuid NOT NULL REFERENCES profiles(id),
  reason       report_reason NOT NULL DEFAULT 'other',
  details      text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (happening_id, reporter_id)
);

ALTER TABLE happening_reports ENABLE ROW LEVEL SECURITY;

-- Reporter can insert own report
CREATE POLICY "happening_reports: insert own"
  ON happening_reports FOR INSERT
  WITH CHECK (reporter_id = auth.uid());

-- Reporter can read own reports
CREATE POLICY "happening_reports: read own"
  ON happening_reports FOR SELECT
  USING (reporter_id = auth.uid());

-- Admin full access
CREATE POLICY "happening_reports: admin full"
  ON happening_reports FOR ALL
  USING (is_admin());

CREATE INDEX happening_reports_happening_idx ON happening_reports(happening_id);
