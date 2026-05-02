'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { TicketFlipLoader } from '@/components/ui/TicketFlipLoader'
import { clientPatchJson, isToastHandledError } from '@/lib/client-fetch'
import type { Community, CommunityApprovalStatus } from '@/types/database'

type PendingCommunity = Pick<
  Community,
  'id' | 'name' | 'name_ar' | 'slug' | 'level' | 'city' | 'created_at' | 'approval_status' | 'parent_community_id'
> & {
  creator?: { id: string; display_name: string | null } | null
}

export default function AdminCommunitiesPage() {
  const [communities, setCommunities] = useState<PendingCommunity[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  async function loadPending() {
    setLoading(true)
    try {
      const res = await fetch('/api/communities?approval_status=pending&level=district&per_page=50')
      if (res.ok) {
        const json = await res.json() as { data: PendingCommunity[] }
        setCommunities(json.data ?? [])
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadPending()
  }, [])

  async function updateApproval(slug: string, approvalStatus: CommunityApprovalStatus) {
    setActionLoading(`${slug}:${approvalStatus}`)
    try {
      await clientPatchJson(`/api/communities/${slug}`, { approval_status: approvalStatus })
      setCommunities((prev) => prev.filter((entry) => entry.slug !== slug))
    } catch (error) {
      if (!isToastHandledError(error)) {
        window.alert(error instanceof Error ? error.message : 'Failed to update community approval state')
      }
    } finally {
      setActionLoading(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Community Approvals</h1>
          <p className="mt-1 text-sm text-gray-500">Review pending district communities before they appear publicly.</p>
        </div>
        <button
          onClick={() => void loadPending()}
          disabled={loading}
          className="rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
        >
          Refresh
        </button>
      </div>

      <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
        {loading ? (
          <div className="flex justify-center py-16"><TicketFlipLoader size="md" /></div>
        ) : communities.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-6 py-10 text-center">
            <p className="text-sm font-medium text-gray-700">No pending district communities right now.</p>
            <p className="mt-1 text-xs text-gray-500">New submissions will show up here for approval or dismissal.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {communities.map((community) => (
              <div key={community.id} className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Link href={`/communities/${community.slug}`} className="text-base font-semibold text-gray-900 hover:text-brand-600">
                        {community.name}
                      </Link>
                      <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700">
                        Pending review
                      </span>
                    </div>
                    {community.name_ar && <p className="mt-1 text-sm text-gray-500" dir="rtl">{community.name_ar}</p>}
                    <p className="mt-2 text-xs text-gray-500">
                      {community.level}
                      {community.city ? ` · ${community.city}` : ''}
                      {community.creator?.display_name ? ` · by ${community.creator.display_name}` : ''}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button
                      onClick={() => void updateApproval(community.slug, 'approved')}
                      disabled={actionLoading === `${community.slug}:approved`}
                      className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                    >
                      {actionLoading === `${community.slug}:approved` ? '...' : 'Approve'}
                    </button>
                    <button
                      onClick={() => void updateApproval(community.slug, 'dismissed')}
                      disabled={actionLoading === `${community.slug}:dismissed`}
                      className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                    >
                      {actionLoading === `${community.slug}:dismissed` ? '...' : 'Dismiss'}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
