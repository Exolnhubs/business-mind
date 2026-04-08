ALTER TABLE communities
  ADD COLUMN IF NOT EXISTS parent_community_id UUID REFERENCES communities(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS communities_parent_idx
  ON communities(parent_community_id);

CREATE OR REPLACE FUNCTION fn_sync_community_hierarchy()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM community_hierarchy
  WHERE child_id = NEW.id;

  IF NEW.parent_community_id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO community_hierarchy (parent_id, child_id, depth)
  VALUES (NEW.parent_community_id, NEW.id, 1)
  ON CONFLICT (parent_id, child_id) DO UPDATE
    SET depth = EXCLUDED.depth;

  INSERT INTO community_hierarchy (parent_id, child_id, depth)
  SELECT parent_id, NEW.id, depth + 1
  FROM community_hierarchy
  WHERE child_id = NEW.parent_community_id
  ON CONFLICT (parent_id, child_id) DO UPDATE
    SET depth = EXCLUDED.depth;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_community_hierarchy ON communities;
CREATE TRIGGER trg_sync_community_hierarchy
  AFTER INSERT OR UPDATE OF parent_community_id
  ON communities
  FOR EACH ROW
  EXECUTE FUNCTION fn_sync_community_hierarchy();

INSERT INTO community_hierarchy (parent_id, child_id, depth)
SELECT c.parent_community_id, c.id, 1
FROM communities c
WHERE c.parent_community_id IS NOT NULL
ON CONFLICT (parent_id, child_id) DO NOTHING;

INSERT INTO community_hierarchy (parent_id, child_id, depth)
SELECT ch.parent_id, c.id, ch.depth + 1
FROM communities c
JOIN community_hierarchy ch ON ch.child_id = c.parent_community_id
WHERE c.parent_community_id IS NOT NULL
ON CONFLICT (parent_id, child_id) DO NOTHING;
