-- Add new notification types for organizer rejection and suspension
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'organizer_rejected';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'organizer_suspended';
