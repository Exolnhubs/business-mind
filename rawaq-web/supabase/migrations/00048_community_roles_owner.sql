-- Normalize community authority model:
-- - explicit owner on communities
-- - explicit community-scoped admin role
-- - keep platform admin separate from community roles

ALTER TABLE communities
  ADD COLUMN IF NOT EXISTS owner_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

UPDATE communities
SET owner_user_id = created_by
WHERE owner_user_id IS NULL
  AND created_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS communities_owner_user_idx
  ON communities(owner_user_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'community_role_v2'
  ) THEN
    CREATE TYPE community_role_v2 AS ENUM ('member', 'community_admin', 'owner');
  END IF;
END $$;

ALTER TABLE community_memberships
  ALTER COLUMN role DROP DEFAULT;

ALTER TABLE community_memberships
  ALTER COLUMN role TYPE community_role_v2
  USING (
    CASE role::text
      WHEN 'member' THEN 'member'::community_role_v2
      WHEN 'moderator' THEN 'community_admin'::community_role_v2
      WHEN 'admin' THEN 'community_admin'::community_role_v2
      ELSE 'member'::community_role_v2
    END
  );

ALTER TABLE community_memberships
  ALTER COLUMN role SET DEFAULT 'member'::community_role_v2;

INSERT INTO community_memberships (community_id, user_id, role)
SELECT id, owner_user_id, 'owner'::community_role_v2
FROM communities
WHERE owner_user_id IS NOT NULL
ON CONFLICT (community_id, user_id) DO NOTHING;

UPDATE community_memberships cm
SET role = 'owner'::community_role_v2
FROM communities c
WHERE c.id = cm.community_id
  AND c.owner_user_id IS NOT NULL
  AND c.owner_user_id = cm.user_id;

DROP TYPE community_role;
ALTER TYPE community_role_v2 RENAME TO community_role;

COMMENT ON COLUMN communities.owner_user_id IS 'Canonical owner of the community. Distinct from platform administrators.';
COMMENT ON COLUMN community_memberships.role IS 'Community-scoped role only. Platform admin authority is separate.';
