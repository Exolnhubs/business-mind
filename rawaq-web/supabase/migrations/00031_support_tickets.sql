-- Support tickets raised via the in-app AI customer support chat
CREATE TABLE IF NOT EXISTS support_tickets (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number  TEXT        UNIQUE NOT NULL
                             DEFAULT 'TKT-' || UPPER(SUBSTRING(REPLACE(gen_random_uuid()::TEXT, '-', ''), 1, 6)),
  user_id        UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  category       TEXT        NOT NULL CHECK (category IN ('general', 'refund', 'harassment', 'legal', 'technical')),
  subject        TEXT        NOT NULL,
  description    TEXT        NOT NULL,
  status         TEXT        NOT NULL DEFAULT 'open'
                             CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  admin_notes    TEXT,
  resolved_by    UUID        REFERENCES profiles(id),
  resolved_at    TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_support_ticket_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_support_ticket_updated_at ON support_tickets;
CREATE TRIGGER trg_support_ticket_updated_at
  BEFORE UPDATE ON support_tickets
  FOR EACH ROW EXECUTE FUNCTION update_support_ticket_updated_at();

-- Indexes
CREATE INDEX IF NOT EXISTS idx_support_tickets_user    ON support_tickets (user_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status  ON support_tickets (status);
CREATE INDEX IF NOT EXISTS idx_support_tickets_created ON support_tickets (created_at DESC);

-- RLS
ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;

-- Users can read their own tickets
CREATE POLICY "support_tickets: user read own"
  ON support_tickets FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own tickets (via API with service role — policy is belt-and-suspenders)
CREATE POLICY "support_tickets: user insert own"
  ON support_tickets FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Admins have full access
CREATE POLICY "support_tickets: admin all"
  ON support_tickets FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
