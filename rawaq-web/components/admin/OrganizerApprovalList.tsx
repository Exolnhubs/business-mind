'use client'

import { useState } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/Badge'
import { Spinner } from '@/components/ui/Spinner'
import { formatDate } from '@/lib/utils'
import type { OrganizerStatus } from '@/types/database'

interface OrganizerWithUser {
  id: string
  user_id: string
  business_name: string
  business_name_ar: string | null
  description: string | null
  status: OrganizerStatus
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
  showActions?: boolean
}

export function OrganizerApprovalList({ organizers, showActions = true }: OrganizerApprovalListProps) {
  const supabase = createSupabaseBrowserClient()
  const router = useRouter()
  const [loadingId, setLoadingId] = useState<string | null>(null)

  async function updateStatus(orgId: string, status: OrganizerStatus) {
    setLoadingId(orgId)
    await supabase
      .from('organizer_profiles')
      .update({ status, reviewed_at: new Date().toISOString() })
      .eq('id', orgId)
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
          <div key={org.id} className="card p-4 flex items-start gap-4">
            {/* Avatar */}
            <div className="w-10 h-10 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center font-bold text-sm shrink-0 uppercase">
              {(org.user?.display_name ?? org.business_name)[0]}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-semibold text-gray-900 text-sm">{org.business_name}</p>
                <Badge variant={badge.variant}>{badge.label}</Badge>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                {org.user?.display_name} · {org.user?.city ?? 'Unknown city'} · Applied {formatDate(org.created_at)}
              </p>
              {org.description && (
                <p className="text-xs text-gray-600 mt-1 line-clamp-2">{org.description}</p>
              )}
            </div>

            {/* Actions */}
            {showActions && org.status === 'pending' && (
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={() => updateStatus(org.id, 'approved')}
                  disabled={isLoading}
                  className="btn-primary text-xs px-3 py-1.5"
                >
                  {isLoading ? <Spinner size="sm" /> : '✓ Approve'}
                </button>
                <button
                  onClick={() => updateStatus(org.id, 'rejected')}
                  disabled={isLoading}
                  className="btn-danger text-xs px-3 py-1.5"
                >
                  ✗ Reject
                </button>
              </div>
            )}
            {showActions && org.status === 'approved' && (
              <button
                onClick={() => updateStatus(org.id, 'suspended')}
                disabled={isLoading}
                className="btn-secondary text-xs px-3 py-1.5 shrink-0"
              >
                Suspend
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}
