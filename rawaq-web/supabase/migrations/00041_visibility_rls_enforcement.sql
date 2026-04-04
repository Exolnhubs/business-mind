-- ── Migration 00041: Enforce event visibility_type in RLS ─────────────────────
--
-- visibility_type semantics:
--   national → public (anyone can see)
--   city     → public (default, backward-compatible)
--   interest → members of at least one tagged community OR organizer/admin
--   micro    → members of at least one tagged community OR organizer/admin
--
-- The original "events: public read published" policy ignored visibility_type.
-- This migration replaces it with a visibility-aware version.
-- ─────────────────────────────────────────────────────────────────────────────

-- Drop old catch-all policy
DROP POLICY IF EXISTS "events: public read published" ON events;

-- New policy: respects visibility_type
CREATE POLICY "events: public read published"
  ON events FOR SELECT
  USING (
    is_published   = TRUE
    AND is_cancelled = FALSE
    AND (
      -- private gate unchanged
      is_private = FALSE
      OR organizer_id = auth.uid()
      OR is_admin()
    )
    AND (
      -- public visibility levels: open to anyone
      visibility_type IN ('city', 'national')

      -- organizer always sees their own events
      OR organizer_id = auth.uid()

      -- admin always sees everything
      OR is_admin()

      -- restricted levels: must be a member of at least one tagged community
      OR (
        visibility_type IN ('micro', 'interest')
        AND EXISTS (
          SELECT 1
          FROM event_communities ec
          JOIN community_memberships cm
            ON cm.community_id = ec.community_id
          WHERE ec.event_id  = events.id
            AND cm.user_id   = auth.uid()
        )
      )
    )
  );
