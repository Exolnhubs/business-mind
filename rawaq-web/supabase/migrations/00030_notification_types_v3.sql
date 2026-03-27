-- Add notification types for new features
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'event_updated';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'new_event_published';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'event_sold_out';
