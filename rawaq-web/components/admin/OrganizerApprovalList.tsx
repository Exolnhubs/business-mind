'use client'

import { useState } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/Badge'
import { Spinner } from '@/components/ui/Spinner'
import { formatDate } from '@/lib/utils'
import type { OrganizerStatus } from '@/types/database'

export interface OrganizerWithUser {
  id: string
  user_id: string
  business_name: string
  business_name_ar: string | null
  description: string | null
  bio: string | null
  organizer_type: 'company' | 'individual' | null
  status: OrganizerStatus
  suspend_reason: string | null
  created_at: string
  user: {
    id: string
    display_name: string
    avatar_url: string | null
    city: string | null
    created_at?: string
  } | null
}

const STATUS_BADGE: Record<OrganizerStatus, { variant: 'green' | 'red' | 'yellow' | 'gray'; label: string }> = {
  pending:   { variant: 'yellow', label: 'Pending' },
  approved:  { variant: 'green',  label: 'Approved' },
  rejected:  { variant: 'red',    label: 'Rejected' },
  suspended: { variant: 'red',    label: 'Suspended' },
}

interface OrganizerApprovalListProps {
  organizers: OrganizerWithUser[]
}

export function OrganizerApprovalList({ organizers }: OrganizerApprovalListProps) {
  const supabase = createSupabaseBrowserClient()
  const router = useRouter()
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [suspendReason, setSuspendReason] = useState<Record<string, string>>({})
  const [showReasonFor, setShowReasonFor] = useState<string | null>(null)

  async function updateStatus(
    orgId: string,
    orgType: 'company' | 'individual' | null,
    status: OrganizerStatus,
    reason?: string,
  ) {
    setLoadingId(orgId)
    if (orgType === 'individual') {
      // Must go through the API — it updates profiles.role, clears cache, and sends notification
      await fetch(`/api/admin/individual-hosts/${orgId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, note: reason ?? undefined }),
      })
    } else {
      await supabase
        .from('organizer_profiles')
        .update({
          status,
          reviewed_at: new Date().toISOString(),
          suspend_reason: status === 'suspended' ? (reason ?? null) : null,
        })
        .eq('id', orgId)
    }
    setShowReasonFor(null)
    router.refresh()
    setLoadingId(null)
  }

  if (!organizers.length) {
    return <p className="text-sm text-gray-400 py-4">No organizers here.</p>
  }

  return (
    <div className="space-y-3">
      {organizers.map((org) => {
        const badge = STATUS_BADGE[org.status]
        const isLoading = loadingId === org.id

        return (
          <div key={org.id} className="card p-4">
            <div className="flex items-start gap-4">
              {/* Avatar */}
              <div className="w-10 h-10 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center font-bold text-sm shrink-0 uppercase">
                {(org.user?.display_name ?? org.business_name)[0]}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-semibold text-gray-900 text-sm">{org.business_name}</p>
                  <Badge variant={badge.variant}>{badge.label}</Badge>
                  {org.organizer_type === 'individual' && (
                    <Badge variant="gray">Individual Host</Badge>
                  )}
                </div>
                <p className="text-xs text-gray-500 mt-0.5">
                  {org.user?.display_name} · {org.user?.city ?? 'Unknown city'} · Applied {formatDate(org.created_at)}
                </p>
                {(org.organizer_type === 'individual' ? org.bio : org.description) && (
                  <p className="text-xs text-gray-600 mt-1 line-clamp-2">
                    {org.organizer_type === 'individual' ? org.bio : org.description}
                  </p>
                )}
                {org.status === 'suspended' && org.suspend_reason && (
                  <p className="text-xs text-red-600 mt-1 bg-red-50 rounded px-2 py-1">
                    Reason: {org.suspend_reason}
                  </p>
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-2 shrink-0 flex-wrap justify-end">
                {org.status === 'pending' && (
                  <>
                    <button
                      onClick={() => updateStatus(org.id, org.organizer_type, 'approved')}
                      disabled={isLoading}
                      className="btn-primary text-xs px-3 py-1.5"
                    >
                      {isLoading ? <Spinner size="sm" /> : '✓ Approve'}
                    </button>
                    <button
                      onClick={() => updateStatus(org.id, org.organizer_type, 'rejected')}
                      disabled={isLoading}
                      className="btn-danger text-xs px-3 py-1.5"
                    >
                      ✗ Reject
                    </button>
                  </>
                )}

                {org.status === 'approved' && (
                  <button
                    onClick={() => setShowReasonFor(org.id)}
                    disabled={isLoading}
                    className="btn-secondary text-xs px-3 py-1.5"
                  >
                    Suspend
                  </button>
                )}

                {org.status === 'suspended' && (
                  <button
                    onClick={() => updateStatus(org.id, org.organizer_type, 'approved')}
                    disabled={isLoading}
                    className="btn-primary text-xs px-3 py-1.5"
                  >
                    {isLoading ? <Spinner size="sm" /> : 'Reactivate'}
                  </button>
                )}

                {org.status === 'rejected' && (
                  <button
                    onClick={() => updateStatus(org.id, org.organizer_type, 'approved')}
                    disabled={isLoading}
                    className="btn-primary text-xs px-3 py-1.5"
                  >
                    {isLoading ? <Spinner size="sm" /> : 'Approve'}
                  </button>
                )}
              </div>
            </div>

            {/* Suspend reason form */}
            {showReasonFor === org.id && (
              <div className="mt-3 pt-3 border-t border-gray-100 flex gap-2">
                <input
                  type="text"
                  value={suspendReason[org.id] ?? ''}
                  onChange={(e) => setSuspendReason((r) => ({ ...r, [org.id]: e.target.value }))}
                  placeholder="Reason for suspension (optional)"
                  className="input flex-1 text-xs py-1.5"
                />
                <button
                  onClick={() => updateStatus(org.id, org.organizer_type, 'suspended', suspendReason[org.id])}
                  disabled={isLoading}
                  className="btn-danger text-xs px-3 py-1.5 shrink-0"
                >
                  {isLoading ? <Spinner size="sm" /> : 'Confirm Suspend'}
                </button>
                <button
                  onClick={() => setShowReasonFor(null)}
                  className="btn-secondary text-xs px-3 py-1.5 shrink-0"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
