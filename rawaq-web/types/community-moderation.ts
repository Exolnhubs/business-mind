import type { CommunityRole } from '@/types/database'

export type CommunityAdminEntry = {
  user_id: string
  role: CommunityRole
  joined_at: string
  profile: { id: string; display_name: string; avatar_url: string | null } | null
}

export type HappeningReportEntry = {
  happening_id: string
  reporter_id: string
  reason: string
  details: string | null
  status: 'pending' | 'resolved' | 'dismissed'
  assigned_to: string | null
  resolved_by: string | null
  resolved_at: string | null
  resolution_note: string | null
  created_at: string
  happening: {
    id: string
    body: string
    author_id: string
    created_at: string
    author: { id: string; display_name: string; avatar_url: string | null } | null
  } | null
  reporter: { id: string; display_name: string; avatar_url: string | null } | null
  assignee: { id: string; display_name: string; avatar_url: string | null } | null
  resolver: { id: string; display_name: string; avatar_url: string | null } | null
}

export type CommunityAuditLogEntry = {
  id: string
  action: string
  target_type: string
  target_id: string
  meta: Record<string, unknown>
  created_at: string
  actor_user_id: string
  actor: { id: string; display_name: string; avatar_url: string | null } | null
}

export type CommunityWarningEntry = {
  id: string
  severity: 'low' | 'medium' | 'high'
  reason: string
  internal_note: string | null
  created_at: string
}

export type CommunitySanctionEntry = {
  id: string
  sanction_type: 'timeout' | 'removed' | 'banned'
  reason: string
  starts_at: string
  ends_at: string | null
  revoked_at: string | null
  revoke_note: string | null
  created_at: string
}

export type MemberHistoryState = {
  member: { id: string; display_name: string; avatar_url: string | null; joined_at: string }
  warnings: CommunityWarningEntry[]
  sanctions: CommunitySanctionEntry[]
}
