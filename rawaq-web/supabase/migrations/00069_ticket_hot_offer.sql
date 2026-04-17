-- 00069_ticket_hot_offer.sql
ALTER TABLE ticket_types
  ADD COLUMN IF NOT EXISTS is_hot_offer      BOOLEAN       NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS hot_offer_price   NUMERIC(10,2) CONSTRAINT chk_hot_offer_price_non_negative CHECK (hot_offer_price >= 0),
  ADD COLUMN IF NOT EXISTS hot_offer_ends_at TIMESTAMPTZ;

ALTER TABLE ticket_types
  DROP CONSTRAINT IF EXISTS chk_hot_offer_fields;

ALTER TABLE ticket_types
  ADD CONSTRAINT chk_hot_offer_fields
    CHECK (
      NOT is_hot_offer
      OR (hot_offer_price IS NOT NULL AND hot_offer_ends_at IS NOT NULL)
    );

COMMENT ON COLUMN ticket_types.is_hot_offer      IS 'When true, display hot_offer_price as the effective price until hot_offer_ends_at.';
COMMENT ON COLUMN ticket_types.hot_offer_price   IS 'Promotional price shown while hot offer is active. NULL when is_hot_offer = false.';
COMMENT ON COLUMN ticket_types.hot_offer_ends_at IS 'When this timestamp passes, the offer expires and price reverts to the base price column.';
