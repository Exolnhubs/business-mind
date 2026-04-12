-- Ticket types inherit their currency from the parent event.
-- Keep ticket_types focused on pricing tiers only.

ALTER TABLE ticket_types
DROP COLUMN IF EXISTS currency;
