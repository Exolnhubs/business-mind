-- Preserve community memberships through moderation actions.
-- This makes bans/removals reversible and keeps role hierarchy enforceable.

DO $$ BEGIN
  CREATE TYPE community_membership_status AS ENUM ('active', 'timed_out', 'removed', 'banned');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE community_memberships
  ADD COLUMN IF NOT EXISTS status community_membership_status NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS timeout_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS status_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS community_memberships_status_idx
  ON community_memberships(community_id, status);

UPDATE community_memberships
SET status = 'active',
    timeout_until = NULL,
    status_updated_at = COALESCE(status_updated_at, NOW())
WHERE status IS NULL;

CREATE OR REPLACE FUNCTION fn_update_community_member_count()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'active' THEN
      UPDATE communities SET member_count = member_count + 1 WHERE id = NEW.community_id;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.status = 'active' THEN
      UPDATE communities SET member_count = GREATEST(member_count - 1, 0) WHERE id = OLD.community_id;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.status = 'active' AND NEW.status <> 'active' THEN
      UPDATE communities SET member_count = GREATEST(member_count - 1, 0) WHERE id = NEW.community_id;
    ELSIF OLD.status <> 'active' AND NEW.status = 'active' THEN
      UPDATE communities SET member_count = member_count + 1 WHERE id = NEW.community_id;
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_community_member_count ON community_memberships;
CREATE TRIGGER trg_community_member_count
  AFTER INSERT OR UPDATE OF status OR DELETE ON community_memberships
  FOR EACH ROW EXECUTE FUNCTION fn_update_community_member_count();

UPDATE communities c
SET member_count = active_counts.count
FROM (
  SELECT community_id, COUNT(*)::INT AS count
  FROM community_memberships
  WHERE status = 'active'
  GROUP BY community_id
) active_counts
WHERE c.id = active_counts.community_id;

UPDATE communities
SET member_count = 0
WHERE id NOT IN (
  SELECT DISTINCT community_id
  FROM community_memberships
  WHERE status = 'active'
);

CREATE OR REPLACE FUNCTION public.is_member_of_community(p_community_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM community_memberships
    WHERE community_id = p_community_id
      AND user_id = auth.uid()
      AND status = 'active'
  );
$$;

REVOKE ALL ON FUNCTION public.is_member_of_community(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_member_of_community(UUID) TO authenticated;

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
        AND status = 'active'
        AND role IN ('owner', 'community_admin')
    );
$$;

CREATE OR REPLACE FUNCTION get_user_communities(p_user_id UUID)
RETURNS TABLE (
  community_id UUID,
  community_name TEXT,
  community_slug TEXT,
  community_level community_level,
  community_type community_type
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    c.id,
    c.name,
    c.slug,
    c.level,
    c.type
  FROM community_memberships cm
  JOIN communities c ON c.id = cm.community_id
  WHERE cm.user_id = p_user_id
    AND cm.status = 'active'
  ORDER BY c.level, c.name;
$$;

DROP POLICY IF EXISTS "happenings: member read" ON happenings;
CREATE POLICY "happenings: member read"
  ON happenings FOR SELECT
  USING (
    expires_at > now()
    AND (
      EXISTS (SELECT 1 FROM communities WHERE id = happenings.community_id AND type = 'country')
      OR public.is_member_of_community(happenings.community_id)
      OR is_admin()
    )
  );

DROP POLICY IF EXISTS "happenings: member insert" ON happenings;
CREATE POLICY "happenings: member insert"
  ON happenings FOR INSERT
  WITH CHECK (
    author_id = auth.uid()
    AND public.is_member_of_community(community_id)
  );

DROP POLICY IF EXISTS "happening_rsvps: member insert" ON happening_rsvps;
CREATE POLICY "happening_rsvps: member insert"
  ON happening_rsvps FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM happenings h
      WHERE h.id = happening_rsvps.happening_id
        AND h.expires_at > now()
        AND public.is_member_of_community(h.community_id)
    )
  );

DROP POLICY IF EXISTS "happening_reactions: member insert" ON happening_reactions;
CREATE POLICY "happening_reactions: member insert"
  ON happening_reactions FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM happenings h
      WHERE h.id = happening_reactions.happening_id
        AND h.expires_at > now()
        AND public.is_member_of_community(h.community_id)
    )
  );

COMMENT ON COLUMN community_memberships.status IS 'Active membership state. Bans/removals preserve the membership row for reversible governance.';
COMMENT ON COLUMN community_memberships.timeout_until IS 'For timed-out members, the timestamp when active participation can be restored.';
