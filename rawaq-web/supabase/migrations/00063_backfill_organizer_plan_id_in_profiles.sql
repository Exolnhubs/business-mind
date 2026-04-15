-- Backfill organizer plan_id into profiles
--
-- Root cause: assignMembershipPlan only wrote plan upgrades to organizer_profiles.plan_id,
-- never to profiles.plan_id. This means organizer profiles always show plan_id = 'user_free'
-- in badge queries and the mobile plan display, regardless of their actual subscription tier.
--
-- Fix: mirror organizer_profiles.plan_id → profiles.plan_id for all organizer accounts.
-- Going forward, assignMembershipPlan has been updated to keep these in sync.

UPDATE profiles p
SET    plan_id = op.plan_id
FROM   organizer_profiles op
WHERE  op.user_id = p.id
  AND  p.role    = 'organizer'
  AND  p.plan_id != op.plan_id;
