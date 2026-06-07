-- 00095 · Host communities: organizer-owned "host" community + opt-in + idempotent RPC

-- 1. Discriminator on communities
ALTER TABLE communities
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'standard'
    CHECK (kind IN ('standard', 'host'));

CREATE INDEX IF NOT EXISTS communities_kind_idx ON communities(kind);

-- At most one host community per owner
CREATE UNIQUE INDEX IF NOT EXISTS communities_one_host_per_owner
  ON communities(owner_user_id)
  WHERE kind = 'host';

-- 2. Opt-in pointer + flag on organizer_profiles
ALTER TABLE organizer_profiles
  ADD COLUMN IF NOT EXISTS host_community_id UUID REFERENCES communities(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS host_community_enabled BOOLEAN NOT NULL DEFAULT FALSE;

-- 3. Idempotent, concurrency-safe creation + enable
CREATE OR REPLACE FUNCTION ensure_host_community(
  p_owner   UUID,
  p_name    TEXT,
  p_name_ar TEXT,
  p_country TEXT
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id   UUID;
  v_slug TEXT;
BEGIN
  -- Reuse existing host community if present
  SELECT id INTO v_id
  FROM communities
  WHERE owner_user_id = p_owner AND kind = 'host'
  LIMIT 1;

  IF v_id IS NULL THEN
    v_id   := gen_random_uuid();
    v_slug := 'host-' || replace(v_id::text, '-', '');

    INSERT INTO communities (
      id, name, name_ar, slug, level, type, country,
      is_verified, is_private, approval_status, kind,
      owner_user_id, created_by
    )
    VALUES (
      v_id, p_name, p_name_ar, v_slug, 'interest', 'other', UPPER(COALESCE(p_country, 'SA')),
      false, false, 'approved', 'host',
      p_owner, p_owner
    )
    ON CONFLICT (owner_user_id) WHERE kind = 'host'
    DO NOTHING;

    -- If a concurrent caller won the race, pick up their row
    IF NOT FOUND THEN
      SELECT id INTO v_id
      FROM communities
      WHERE owner_user_id = p_owner AND kind = 'host'
      LIMIT 1;
    END IF;
  END IF;

  -- Ensure owner membership exists & active
  INSERT INTO community_memberships (community_id, user_id, role, status, timeout_until, status_updated_at)
  VALUES (v_id, p_owner, 'owner', 'active', NULL, NOW())
  ON CONFLICT (community_id, user_id)
  DO UPDATE SET status = 'active', role = 'owner', status_updated_at = NOW();

  -- Flip the opt-in pointer/flag
  UPDATE organizer_profiles
  SET host_community_id = v_id, host_community_enabled = true
  WHERE user_id = p_owner;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION ensure_host_community(UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ensure_host_community(UUID, TEXT, TEXT, TEXT) TO authenticated, service_role;

-- 4. Integrity guard: host_community_id must point to an owned host community
CREATE OR REPLACE FUNCTION fn_validate_host_community_pointer()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.host_community_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM communities c
      WHERE c.id = NEW.host_community_id
        AND c.kind = 'host'
        AND c.owner_user_id = NEW.user_id
    ) THEN
      RAISE EXCEPTION 'host_community_id must reference a host community owned by this organizer';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_host_community_pointer ON organizer_profiles;
CREATE TRIGGER trg_validate_host_community_pointer
  BEFORE INSERT OR UPDATE OF host_community_id ON organizer_profiles
  FOR EACH ROW EXECUTE FUNCTION fn_validate_host_community_pointer();
