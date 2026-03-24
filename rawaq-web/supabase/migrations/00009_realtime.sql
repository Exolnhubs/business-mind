-- ============================================================
-- Enable Supabase Realtime for real-time chat and comments
-- Replica identity FULL ensures all column values are
-- available in the change event payload (needed for UPDATE/DELETE).
-- ============================================================

ALTER TABLE global_chat REPLICA IDENTITY FULL;
ALTER TABLE comments    REPLICA IDENTITY FULL;

-- Add tables to the Supabase realtime publication so that
-- postgres_changes subscriptions start receiving events.
ALTER PUBLICATION supabase_realtime ADD TABLE global_chat;
ALTER PUBLICATION supabase_realtime ADD TABLE comments;
