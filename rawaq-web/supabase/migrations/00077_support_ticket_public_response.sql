-- 00077_support_ticket_public_response.sql
-- Adds a public-facing response field for admins to communicate ticket outcomes to users.
-- Distinct from admin_notes (internal only).

ALTER TABLE support_tickets
  ADD COLUMN public_response TEXT;
