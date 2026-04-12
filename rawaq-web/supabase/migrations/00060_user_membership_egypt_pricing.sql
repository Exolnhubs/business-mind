-- Localize the paid user membership tier for Egypt.
-- Can be adjusted later directly in Supabase without client changes.

INSERT INTO plan_country_prices (plan_id, country_code, currency_code, amount)
VALUES
  ('user_premium', 'EG', 'EGP', 290)
ON CONFLICT (plan_id, country_code) DO UPDATE
SET
  currency_code = EXCLUDED.currency_code,
  amount = EXCLUDED.amount,
  updated_at = NOW();
