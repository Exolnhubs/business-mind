-- Country-specific membership pricing overrides.
-- Falls back to plan_definitions.price_sar when no country row exists.

CREATE TABLE plan_country_prices (
  plan_id        TEXT        NOT NULL REFERENCES plan_definitions(id) ON DELETE CASCADE,
  country_code   TEXT        NOT NULL CHECK (char_length(country_code) = 2 AND country_code = upper(country_code)),
  currency_code  TEXT        NOT NULL CHECK (char_length(currency_code) = 3 AND currency_code = upper(currency_code)),
  amount         NUMERIC(10,2) NOT NULL CHECK (amount >= 0),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (plan_id, country_code)
);

INSERT INTO plan_country_prices (plan_id, country_code, currency_code, amount)
VALUES
  ('user_premium', 'SA', 'SAR', 29),
  ('org_basic', 'SA', 'SAR', 0),
  ('org_pro', 'SA', 'SAR', 199),
  ('org_elite', 'SA', 'SAR', 499),
  ('org_pro', 'EG', 'EGP', 2000),
  ('org_elite', 'EG', 'EGP', 4500)
ON CONFLICT (plan_id, country_code) DO UPDATE
SET
  currency_code = EXCLUDED.currency_code,
  amount = EXCLUDED.amount,
  updated_at = NOW();

ALTER TABLE plan_country_prices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "plan_country_prices_read_all"
  ON plan_country_prices
  FOR SELECT
  USING (TRUE);

CREATE POLICY "plan_country_prices_admin_all"
  ON plan_country_prices
  FOR ALL
  USING (is_admin());

CREATE TRIGGER touch_plan_country_prices_updated_at
  BEFORE UPDATE ON plan_country_prices
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
