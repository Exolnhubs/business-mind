-- Widen plan_definitions.type check to include 'individual', then fix the
-- ind_* rows that were seeded in 00082 with type='organizer' by mistake.

-- 1. Drop old constraint, add new one that includes 'individual'
ALTER TABLE plan_definitions
  DROP CONSTRAINT IF EXISTS plan_definitions_type_check;

ALTER TABLE plan_definitions
  ADD CONSTRAINT plan_definitions_type_check
    CHECK (type IN ('user', 'organizer', 'individual'));

-- 2. Correct the type + metadata for all three individual-host plans
UPDATE plan_definitions SET
  type                = 'individual',
  name                = 'Individual Free',
  name_ar             = 'مضيف مجاني',
  price_sar           = 0,
  events_per_month    = 5,
  attendees_per_event = 30,
  platform_fee_pct    = 0.15,
  features            = '{"organizer_type":"individual","free_sessions_only":true,"payout_hold_days":7,"featured_per_month":0}'::jsonb,
  is_active           = true,
  sort_order          = 10,
  updated_at          = now()
WHERE id = 'ind_free';

UPDATE plan_definitions SET
  type                = 'individual',
  name                = 'Individual Basic',
  name_ar             = 'مضيف أساسي',
  price_sar           = 49,
  events_per_month    = 15,
  attendees_per_event = 60,
  platform_fee_pct    = 0.12,
  features            = '{"organizer_type":"individual","free_sessions_only":false,"payout_hold_days":3,"featured_per_month":0}'::jsonb,
  is_active           = true,
  sort_order          = 11,
  updated_at          = now()
WHERE id = 'ind_basic';

UPDATE plan_definitions SET
  type                = 'individual',
  name                = 'Individual Pro',
  name_ar             = 'مضيف احترافي',
  price_sar           = 99,
  events_per_month    = 40,
  attendees_per_event = 100,
  platform_fee_pct    = 0.08,
  features            = '{"organizer_type":"individual","free_sessions_only":false,"payout_hold_days":1,"featured_per_month":1}'::jsonb,
  is_active           = true,
  sort_order          = 12,
  updated_at          = now()
WHERE id = 'ind_pro';
