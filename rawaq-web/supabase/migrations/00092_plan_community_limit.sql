-- Add community_limit column to plan_definitions.
-- Drives how many communities an individual host can be active in simultaneously.
-- NULL means unlimited.

ALTER TABLE plan_definitions
  ADD COLUMN IF NOT EXISTS community_limit INTEGER DEFAULT NULL;

UPDATE plan_definitions SET community_limit = 1 WHERE id = 'ind_free';
UPDATE plan_definitions SET community_limit = 3 WHERE id = 'ind_basic';
-- ind_pro stays NULL (unlimited)
