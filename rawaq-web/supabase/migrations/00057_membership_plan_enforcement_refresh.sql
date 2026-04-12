-- Align shipped plan quotas and feature flags with actual enforced behavior.

UPDATE plan_definitions
SET attendees_per_event = 50,
    features = '{"basic_analytics": true}'::jsonb
WHERE id = 'org_basic';

UPDATE plan_definitions
SET attendees_per_event = 200,
    features = '{"basic_analytics": true, "ticket_scanner": true}'::jsonb
WHERE id = 'org_pro';

UPDATE plan_definitions
SET features = '{"basic_analytics": true, "ticket_scanner": true}'::jsonb
WHERE id = 'org_elite';

UPDATE plan_definitions
SET features = '{"saves_limit": 20}'::jsonb
WHERE id = 'user_free';

UPDATE plan_definitions
SET features = '{"unlimited_saves": true, "premium_only_access": true}'::jsonb
WHERE id = 'user_premium';
