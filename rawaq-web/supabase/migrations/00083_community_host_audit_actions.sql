ALTER TYPE community_audit_action ADD VALUE IF NOT EXISTS 'assign_host_role' AFTER 'revoke_community_admin';
ALTER TYPE community_audit_action ADD VALUE IF NOT EXISTS 'revoke_host_role' AFTER 'assign_host_role';
