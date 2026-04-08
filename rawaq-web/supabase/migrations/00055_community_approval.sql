ALTER TABLE communities
  ADD COLUMN IF NOT EXISTS approval_status TEXT NOT NULL DEFAULT 'approved';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'communities_approval_status_check'
  ) THEN
    ALTER TABLE communities
      ADD CONSTRAINT communities_approval_status_check
      CHECK (approval_status IN ('approved', 'pending', 'dismissed'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS communities_approval_status_idx
  ON communities(approval_status);
