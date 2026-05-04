-- ── Migration 00081: Happenings — capacity & join approval ───────────────────

-- 1. Add capacity and requires_approval to happenings
ALTER TABLE happenings
  ADD COLUMN capacity          integer NOT NULL DEFAULT 10,
  ADD COLUMN requires_approval boolean NOT NULL DEFAULT false;

ALTER TABLE happenings
  ADD CONSTRAINT happenings_capacity_range CHECK (capacity >= 1 AND capacity <= 50);

-- 2. Add status to happening_rsvps (existing rows keep 'approved')
ALTER TABLE happening_rsvps
  ADD COLUMN status text NOT NULL DEFAULT 'approved';

ALTER TABLE happening_rsvps
  ADD CONSTRAINT happening_rsvps_status_check
    CHECK (status IN ('pending', 'approved', 'rejected'));

CREATE INDEX idx_happening_rsvps_pending
  ON happening_rsvps(happening_id, status)
  WHERE status = 'pending';

-- 3. Rewrite the rsvp_count trigger so it only counts 'approved' rows,
--    and fires on UPDATE so status transitions keep the count in sync.
CREATE OR REPLACE FUNCTION fn_happening_rsvp_count()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'approved' THEN
      UPDATE happenings SET rsvp_count = rsvp_count + 1 WHERE id = NEW.happening_id;
    END IF;

  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.status != 'approved' AND NEW.status = 'approved' THEN
      UPDATE happenings SET rsvp_count = rsvp_count + 1 WHERE id = NEW.happening_id;
    ELSIF OLD.status = 'approved' AND NEW.status != 'approved' THEN
      UPDATE happenings SET rsvp_count = GREATEST(rsvp_count - 1, 0) WHERE id = NEW.happening_id;
    END IF;

  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.status = 'approved' THEN
      UPDATE happenings SET rsvp_count = GREATEST(rsvp_count - 1, 0) WHERE id = OLD.happening_id;
    END IF;
  END IF;

  RETURN NULL;
END;
$$;

-- Recreate trigger to also fire on UPDATE OF status
DROP TRIGGER IF EXISTS trg_happening_rsvp_count ON happening_rsvps;
CREATE TRIGGER trg_happening_rsvp_count
  AFTER INSERT OR UPDATE OF status OR DELETE ON happening_rsvps
  FOR EACH ROW EXECUTE FUNCTION fn_happening_rsvp_count();

-- 4. Notification type for RSVP approval
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'happening_rsvp_approved';
