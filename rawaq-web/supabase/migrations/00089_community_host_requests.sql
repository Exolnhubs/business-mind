-- Community host requests: individual hosts can self-request to host a community.
-- Community owners approve or reject requests from the moderation panel.

CREATE TABLE IF NOT EXISTS community_host_requests (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id  uuid        NOT NULL REFERENCES communities(id)   ON DELETE CASCADE,
  user_id       uuid        NOT NULL REFERENCES profiles(id)       ON DELETE CASCADE,
  message       text,
  status        text        NOT NULL DEFAULT 'pending'
                             CHECK (status IN ('pending', 'approved', 'rejected')),
  responded_by  uuid        REFERENCES profiles(id),
  responded_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (community_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_chr_community_status
  ON community_host_requests (community_id, status);
CREATE INDEX IF NOT EXISTS idx_chr_user
  ON community_host_requests (user_id);

-- Row-level security (adjust policies to match your project conventions)
ALTER TABLE community_host_requests ENABLE ROW LEVEL SECURITY;

-- Service-role (admin client) can do anything
DROP POLICY IF EXISTS "service_role_all" ON community_host_requests;
CREATE POLICY "service_role_all" ON community_host_requests
  AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
