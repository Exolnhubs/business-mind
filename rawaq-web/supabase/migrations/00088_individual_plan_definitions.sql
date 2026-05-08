-- Add ind_free, ind_basic, ind_pro rows to plan_definitions for individual hosts.
-- Uses INSERT ... ON CONFLICT DO UPDATE so re-running is safe.

INSERT INTO plan_definitions (
  id, type, name, name_ar,
  price_sar, billing_interval,
  events_per_month, attendees_per_event,
  platform_fee_pct, features, is_active, sort_order
) VALUES
  (
    'ind_free', 'individual', 'Individual Free', 'مضيف مجاني',
    0, 'monthly',
    5, 30,
    0.15,
    '{
      "organizer_type": "individual",
      "free_sessions_only": true,
      "payout_hold_days": 7,
      "featured_per_month": 0
    }'::jsonb,
    true, 10
  ),
  (
    'ind_basic', 'individual', 'Individual Basic', 'مضيف أساسي',
    49, 'monthly',
    15, 60,
    0.12,
    '{
      "organizer_type": "individual",
      "free_sessions_only": false,
      "payout_hold_days": 3,
      "featured_per_month": 0
    }'::jsonb,
    true, 11
  ),
  (
    'ind_pro', 'individual', 'Individual Pro', 'مضيف احترافي',
    99, 'monthly',
    40, 100,
    0.08,
    '{
      "organizer_type": "individual",
      "free_sessions_only": false,
      "payout_hold_days": 1,
      "featured_per_month": 1
    }'::jsonb,
    true, 12
  )
ON CONFLICT (id) DO UPDATE SET
  is_active           = EXCLUDED.is_active,
  name                = EXCLUDED.name,
  name_ar             = EXCLUDED.name_ar,
  price_sar           = EXCLUDED.price_sar,
  events_per_month    = EXCLUDED.events_per_month,
  attendees_per_event = EXCLUDED.attendees_per_event,
  platform_fee_pct    = EXCLUDED.platform_fee_pct,
  features            = EXCLUDED.features,
  sort_order          = EXCLUDED.sort_order,
  updated_at          = now();
