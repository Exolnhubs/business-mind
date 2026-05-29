/**
 * Audit-log helper.
 *
 * Wraps `audit_logs` inserts so that high-impact admin actions are recorded
 * consistently and so that an audit-write failure surfaces as a real error
 * (instead of being silently swallowed). For a financial-adjacent platform,
 * the audit log is part of the action — if we can't record it, we don't
 * complete it.
 */

import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import * as Sentry from '@sentry/nextjs'

export type AuditAction =
  | 'ban_user'
  | 'unban_user'
  | 'warn_user'
  | 'delete_user'
  | 'approve_organizer'
  | 'reject_organizer'
  | 'suspend_organizer'
  | 'complete_refund'
  | 'complete_payout'

export interface LogAdminActionInput {
  adminId: string
  action: AuditAction
  targetType: 'user' | 'organizer' | 'refund' | 'payout'
  targetId: string
  meta?: Record<string, unknown>
}

/**
 * Insert a row into `audit_logs`. Throws on failure so the caller's
 * try/catch + handleApiError converts it into a 500 visible in Sentry.
 */
export async function logAdminAction(input: LogAdminActionInput): Promise<void> {
  const admin = createSupabaseAdminClient()

  const { error } = await admin
    .from('audit_logs')
    .insert({
      admin_id:    input.adminId,
      action:      input.action,
      target_type: input.targetType,
      target_id:   input.targetId,
      meta:        input.meta ?? null,
    } as never)

  if (error) {
    Sentry.captureException(error, {
      extra: {
        scope: 'logAdminAction',
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId,
      },
    })
    throw new Error(`Failed to write audit log for '${input.action}': ${error.message}`)
  }
}
