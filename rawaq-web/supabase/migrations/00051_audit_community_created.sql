DO $$ BEGIN
  ALTER TYPE community_audit_action ADD VALUE 'community_created';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
