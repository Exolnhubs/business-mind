-- Migration 00084: Happening owner RSVP and request notifications

ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'happening_rsvp_request';

INSERT INTO happening_rsvps (happening_id, user_id, status)
SELECT h.id, h.author_id, 'approved'
FROM happenings h
WHERE h.type = 'open_invite'
ON CONFLICT (happening_id, user_id) DO UPDATE
  SET status = 'approved'
  WHERE happening_rsvps.status <> 'approved';
