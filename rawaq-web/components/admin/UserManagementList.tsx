'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/Badge'
import { Spinner } from '@/components/ui/Spinner'
import { formatDate } from '@/lib/utils'
import type { UserRole, WarningSeverity } from '@/types/database'

interface UserRow {
  id: string
  display_name: string
  avatar_url: string | null
  role: UserRole
  city: string | null
  is_banned: boolean
  created_at: string
}

type WarnForm = { severity: WarningSeverity; reason: string; internal_note: string }
const DEFAULT_WARN: WarnForm = { severity: 'medium', reason: '', internal_note: '' }

export function UserManagementList({ users }: { users: UserRow[] }) {
  const router = useRouter()
  const [loadingId, setLoadingId]   = useState<string | null>(null)
  const [warnUserId, setWarnUserId] = useState<string | null>(null)
  const [warnForm, setWarnForm]     = useState<WarnForm>(DEFAULT_WARN)
  const [warnError, setWarnError]   = useState('')

  async function toggleBan(userId: string, isBanned: boolean) {
    setLoadingId(userId)
    await fetch(`/api/admin/users/${userId}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ is_banned: !isBanned }),
    })
    router.refresh()
    setLoadingId(null)
  }

  async function submitWarn(userId: string) {
    if (!warnForm.reason.trim()) { setWarnError('Reason is required.'); return }
    setLoadingId(userId)
    const res = await fetch(`/api/admin/users/${userId}/warn`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(warnForm),
    })
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      setWarnError(j.error ?? 'Failed to issue warning.')
    } else {
      setWarnUserId(null)
      setWarnForm(DEFAULT_WARN)
      setWarnError('')
    }
    setLoadingId(null)
  }

  return (
    <div className="card overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50">
            <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">User</th>
            <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden sm:table-cell">Role</th>
            <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden md:table-cell">Joined</th>
            <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {users.map((user) => {
            const loading  = loadingId === user.id
            const isWarnOpen = warnUserId === user.id
            return (
              <>
                <tr key={user.id} className="hover:bg-gray-50/50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-xs font-bold uppercase shrink-0">
                        {user.display_name[0]}
                      </div>
                      <div>
                        <p className="font-medium text-gray-900 text-xs">{user.display_name}</p>
                        <p className="text-gray-400 text-xs">{user.city ?? '—'}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell">
                    <Badge variant={user.role === 'admin' ? 'red' : user.role === 'organizer' ? 'brand' : 'gray'}>
                      {user.role}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs hidden md:table-cell">
                    {formatDate(user.created_at)}
                  </td>
                  <td className="px-4 py-3">
                    {user.is_banned ? <Badge variant="red">Banned</Badge> : <Badge variant="green">Active</Badge>}
                  </td>
                  <td className="px-4 py-3 text-end">
                    {user.role !== 'admin' && (
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => {
                            setWarnUserId(isWarnOpen ? null : user.id)
                            setWarnForm(DEFAULT_WARN)
                            setWarnError('')
                          }}
                          disabled={loading}
                          className="text-xs font-medium px-3 py-1.5 rounded-lg border border-yellow-200 text-yellow-700 hover:bg-yellow-50 transition-colors"
                        >
                          ⚠️ Warn
                        </button>
                        <button
                          onClick={() => toggleBan(user.id, user.is_banned)}
                          disabled={loading}
                          className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors ${
                            user.is_banned
                              ? 'border-green-200 text-green-700 hover:bg-green-50'
                              : 'border-red-200 text-red-600 hover:bg-red-50'
                          }`}
                        >
                          {loading ? <Spinner size="sm" /> : user.is_banned ? 'Unban' : 'Ban'}
                        </button>
                      </div>
                    )}
                  </td>
                </tr>

                {/* Inline warn form */}
                {isWarnOpen && (
                  <tr key={`warn-${user.id}`}>
                    <td colSpan={5} className="px-4 pb-3 pt-0 bg-yellow-50">
                      <div className="border border-yellow-200 rounded-lg p-3 space-y-2">
                        <p className="text-xs font-semibold text-yellow-800">
                          Issue warning to {user.display_name}
                        </p>
                        <div className="flex gap-2 flex-wrap">
                          <select
                            value={warnForm.severity}
                            onChange={(e) => setWarnForm((f) => ({ ...f, severity: e.target.value as WarningSeverity }))}
                            className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-yellow-400"
                          >
                            <option value="low">Low severity</option>
                            <option value="medium">Medium severity</option>
                            <option value="high">High severity</option>
                          </select>
                        </div>
                        <input
                          type="text"
                          placeholder="Reason (shown to user) *"
                          value={warnForm.reason}
                          onChange={(e) => { setWarnForm((f) => ({ ...f, reason: e.target.value })); setWarnError('') }}
                          className="w-full text-xs border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-yellow-400"
                        />
                        <input
                          type="text"
                          placeholder="Internal note (admin only, optional)"
                          value={warnForm.internal_note}
                          onChange={(e) => setWarnForm((f) => ({ ...f, internal_note: e.target.value }))}
                          className="w-full text-xs border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-yellow-400"
                        />
                        {warnError && <p className="text-xs text-red-600">{warnError}</p>}
                        <div className="flex gap-2">
                          <button
                            onClick={() => submitWarn(user.id)}
                            disabled={loading}
                            className="text-xs font-medium px-3 py-1.5 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 disabled:opacity-50"
                          >
                            {loading ? <Spinner size="sm" /> : 'Issue Warning'}
                          </button>
                          <button
                            onClick={() => { setWarnUserId(null); setWarnError('') }}
                            className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
