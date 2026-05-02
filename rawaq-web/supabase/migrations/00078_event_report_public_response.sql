-- 00078_event_report_public_response.sql
-- Adds a public-facing response field for admins to communicate report outcomes to users.
-- Distinct from resolution_note (internal only).

ALTER TABLE event_reports
  ADD COLUMN public_response TEXT;
