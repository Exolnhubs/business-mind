-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================
-- Pattern: enable RLS on every table, then grant via policies.
-- Service-role key bypasses RLS (use only in trusted server code).
-- ============================================================

-- ============================================================
-- PROFILES
-- ============================================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Allow the handle_new_user trigger (SECURITY DEFINER / service role)
-- to create a profile row on every new sign-up.
-- The FK profiles.id → auth.users(id) ensures only real auth users get a row;
-- the PK prevents duplicates. Without this policy, Supabase cloud's postgres
-- role can still have RLS enforced, blocking the trigger insert and causing
-- "Database error creating new user".
CREATE POLICY "profiles: insert on signup"
  ON profiles FOR INSERT
  WITH CHECK (TRUE);

-- Anyone can read public profiles (needed for event pages, mentions)
CREATE POLICY "profiles: public read"
  ON profiles FOR SELECT
  USING (TRUE);

-- Users can update only their own profile
CREATE POLICY "profiles: own update"
  ON profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    -- Prevent self-promotion to admin
    AND role = (SELECT role FROM profiles WHERE id = auth.uid())
  );

-- Only admin can change roles or ban users
CREATE POLICY "profiles: admin full access"
  ON profiles FOR ALL
  USING (is_admin());

-- ============================================================
-- ORGANIZER PROFILES
-- ============================================================
ALTER TABLE organizer_profiles ENABLE ROW LEVEL SECURITY;

-- Public read (needed for event detail pages)
CREATE POLICY "organizer_profiles: public read"
  ON organizer_profiles FOR SELECT
  USING (TRUE);

-- Organizer can insert/update their own record
CREATE POLICY "organizer_profiles: own write"
  ON organizer_profiles FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "organizer_profiles: own update"
  ON organizer_profiles FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    -- Organizer cannot self-approve or self-verify
    AND status = (SELECT status FROM organizer_profiles WHERE user_id = auth.uid())
    AND verified = (SELECT verified FROM organizer_profiles WHERE user_id = auth.uid())
  );

-- Admin full access
CREATE POLICY "organizer_profiles: admin full"
  ON organizer_profiles FOR ALL
  USING (is_admin());

-- ============================================================
-- EVENT CATEGORIES
-- ============================================================
ALTER TABLE event_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "event_categories: public read"
  ON event_categories FOR SELECT
  USING (is_active = TRUE);

CREATE POLICY "event_categories: admin write"
  ON event_categories FOR ALL
  USING (is_admin());

-- ============================================================
-- EVENTS
-- ============================================================
ALTER TABLE events ENABLE ROW LEVEL SECURITY;

-- Anyone can see published, non-cancelled events
CREATE POLICY "events: public read published"
  ON events FOR SELECT
  USING (
    is_published = TRUE
    AND is_cancelled = FALSE
    -- Respect privacy: is_private events only visible to admin or organizer
    AND (
      is_private = FALSE
      OR organizer_id = auth.uid()
      OR is_admin()
    )
  );

-- Organizer can see their own events (including drafts)
CREATE POLICY "events: organizer read own"
  ON events FOR SELECT
  USING (organizer_id = auth.uid());

-- Organizer can create events (must be approved organizer)
CREATE POLICY "events: organizer insert"
  ON events FOR INSERT
  WITH CHECK (
    auth.uid() = organizer_id
    AND EXISTS (
      SELECT 1 FROM organizer_profiles
      WHERE user_id = auth.uid() AND status = 'approved'
    )
  );

-- Organizer can update/delete their own events
CREATE POLICY "events: organizer update"
  ON events FOR UPDATE
  USING (auth.uid() = organizer_id)
  WITH CHECK (auth.uid() = organizer_id);

CREATE POLICY "events: organizer delete"
  ON events FOR DELETE
  USING (auth.uid() = organizer_id);

-- Admin full access
CREATE POLICY "events: admin full"
  ON events FOR ALL
  USING (is_admin());

-- ============================================================
-- BOOKINGS
-- ============================================================
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;

-- Users can read their own bookings
CREATE POLICY "bookings: own read"
  ON bookings FOR SELECT
  USING (auth.uid() = user_id);

-- Organizer can read bookings for their events
CREATE POLICY "bookings: organizer read event bookings"
  ON bookings FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM events
      WHERE events.id = bookings.event_id
        AND events.organizer_id = auth.uid()
    )
  );

-- Authenticated users can create their own bookings
CREATE POLICY "bookings: own insert"
  ON bookings FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND NOT EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND is_banned = TRUE
    )
  );

-- Users can cancel (update status) their own bookings
CREATE POLICY "bookings: own update"
  ON bookings FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Admin full access
CREATE POLICY "bookings: admin full"
  ON bookings FOR ALL
  USING (is_admin());

-- ============================================================
-- TIPS
-- ============================================================
ALTER TABLE tips ENABLE ROW LEVEL SECURITY;

-- Users can see their own sent tips
CREATE POLICY "tips: own read"
  ON tips FOR SELECT
  USING (auth.uid() = user_id);

-- Organizer can see tips received
CREATE POLICY "tips: organizer read received"
  ON tips FOR SELECT
  USING (auth.uid() = organizer_id);

-- Authenticated users can tip
CREATE POLICY "tips: own insert"
  ON tips FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND NOT EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND is_banned = TRUE
    )
  );

CREATE POLICY "tips: admin full"
  ON tips FOR ALL
  USING (is_admin());

-- ============================================================
-- COMMENTS
-- ============================================================
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;

-- Anyone can read non-deleted comments on published events
CREATE POLICY "comments: public read"
  ON comments FOR SELECT
  USING (
    is_deleted = FALSE
    AND EXISTS (
      SELECT 1 FROM events
      WHERE events.id = comments.event_id
        AND events.is_published = TRUE
        AND events.is_cancelled = FALSE
    )
  );

-- Authenticated, non-banned users can comment
CREATE POLICY "comments: auth insert"
  ON comments FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND NOT EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND is_banned = TRUE
    )
  );

-- Users can soft-delete their own comments
CREATE POLICY "comments: own soft delete"
  ON comments FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Organizer can flag/delete comments on their events
CREATE POLICY "comments: organizer moderate"
  ON comments FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM events
      WHERE events.id = comments.event_id
        AND events.organizer_id = auth.uid()
    )
  );

CREATE POLICY "comments: admin full"
  ON comments FOR ALL
  USING (is_admin());

-- ============================================================
-- COMMENT REPORTS
-- ============================================================
ALTER TABLE comment_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "comment_reports: own insert"
  ON comment_reports FOR INSERT
  WITH CHECK (auth.uid() = reporter_id);

CREATE POLICY "comment_reports: admin full"
  ON comment_reports FOR ALL
  USING (is_admin());

-- ============================================================
-- GLOBAL CHAT
-- ============================================================
ALTER TABLE global_chat ENABLE ROW LEVEL SECURITY;

CREATE POLICY "global_chat: public read"
  ON global_chat FOR SELECT
  USING (is_deleted = FALSE);

CREATE POLICY "global_chat: auth insert"
  ON global_chat FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND NOT EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND is_banned = TRUE
    )
  );

CREATE POLICY "global_chat: own soft delete"
  ON global_chat FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "global_chat: admin full"
  ON global_chat FOR ALL
  USING (is_admin());

-- ============================================================
-- NOTIFICATIONS
-- ============================================================
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notifications: own read"
  ON notifications FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "notifications: own update"
  ON notifications FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Insert is handled server-side (service role), not by clients directly
CREATE POLICY "notifications: admin full"
  ON notifications FOR ALL
  USING (is_admin());

-- ============================================================
-- DEVICE TOKENS
-- ============================================================
ALTER TABLE device_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "device_tokens: own read"
  ON device_tokens FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "device_tokens: own write"
  ON device_tokens FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "device_tokens: own update"
  ON device_tokens FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "device_tokens: own delete"
  ON device_tokens FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "device_tokens: admin full"
  ON device_tokens FOR ALL
  USING (is_admin());

-- ============================================================
-- EVENT VIEWS
-- ============================================================
ALTER TABLE event_views ENABLE ROW LEVEL SECURITY;

-- Anyone can insert a view (tracking)
CREATE POLICY "event_views: insert"
  ON event_views FOR INSERT
  WITH CHECK (TRUE);

-- Only admins and the event organizer can read analytics
CREATE POLICY "event_views: organizer read"
  ON event_views FOR SELECT
  USING (
    is_admin()
    OR EXISTS (
      SELECT 1 FROM events
      WHERE events.id = event_views.event_id
        AND events.organizer_id = auth.uid()
    )
  );