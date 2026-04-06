-- Fix recursive RLS between events, event_communities, and community_memberships.
-- The original Phase 1/2 policies can recurse when:
-- 1) events policy checks community membership
-- 2) community_memberships policy queries community_memberships again
-- 3) event_communities FOR ALL policy references events during events visibility checks

-- Helper: evaluate membership without re-entering table RLS.
CREATE OR REPLACE FUNCTION public.is_member_of_community(p_community_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM community_memberships
    WHERE community_id = p_community_id
      AND user_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public.is_member_of_community(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_member_of_community(UUID) TO authenticated;

-- event_communities: keep SELECT public, but split organizer writes so SELECT
-- does not evaluate a policy that queries events while events RLS is being checked.
DROP POLICY IF EXISTS "organizer manage event_communities" ON event_communities;

CREATE POLICY "organizer insert event_communities"
  ON event_communities FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM events
      WHERE events.id = event_communities.event_id
        AND events.organizer_id = auth.uid()
    )
  );

CREATE POLICY "organizer update event_communities"
  ON event_communities FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM events
      WHERE events.id = event_communities.event_id
        AND events.organizer_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM events
      WHERE events.id = event_communities.event_id
        AND events.organizer_id = auth.uid()
    )
  );

CREATE POLICY "organizer delete event_communities"
  ON event_communities FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM events
      WHERE events.id = event_communities.event_id
        AND events.organizer_id = auth.uid()
    )
  );

-- community_memberships: replace self-recursive SELECT policy with helper.
DROP POLICY IF EXISTS "read community members" ON community_memberships;

CREATE POLICY "read community members"
  ON community_memberships FOR SELECT
  USING (public.is_member_of_community(community_id));

-- events: replace direct join to community_memberships with helper-based check.
DROP POLICY IF EXISTS "events: public read published" ON events;

CREATE POLICY "events: public read published"
  ON events FOR SELECT
  USING (
    is_published = TRUE
    AND is_cancelled = FALSE
    AND (
      is_private = FALSE
      OR organizer_id = auth.uid()
      OR is_admin()
    )
    AND (
      visibility_type IN ('city', 'national')
      OR organizer_id = auth.uid()
      OR is_admin()
      OR (
        visibility_type IN ('micro', 'interest')
        AND EXISTS (
          SELECT 1
          FROM event_communities ec
          WHERE ec.event_id = events.id
            AND public.is_member_of_community(ec.community_id)
        )
      )
    )
  );
