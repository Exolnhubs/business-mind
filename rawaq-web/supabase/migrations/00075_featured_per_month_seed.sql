-- Seed featured_per_month quota into organizer plan definitions
-- Run this first to check current plan names:
-- SELECT id, name FROM plan_definitions WHERE type = 'organizer';

-- Basic plan gets 0 featured events
UPDATE plan_definitions
SET features = COALESCE(features, '{}'::jsonb) || jsonb_build_object('featured_per_month', 0)
WHERE type = 'organizer'
  AND name ILIKE '%basic%'
  OR name ILIKE '%أساسي%';

-- Pro plan gets 3 featured events per month
UPDATE plan_definitions
SET features = COALESCE(features, '{}'::jsonb) || jsonb_build_object('featured_per_month', 3)
WHERE type = 'organizer'
  AND name ILIKE '%pro%'
  OR name ILIKE '%بروفيشنال%';

-- Elite plan gets 3 featured events per month
UPDATE plan_definitions
SET features = COALESCE(features, '{}'::jsonb) || jsonb_build_object('featured_per_month', 3)
WHERE type = 'organizer'
  AND name ILIKE '%elite%'
  OR name ILIKE '%إيليت%';