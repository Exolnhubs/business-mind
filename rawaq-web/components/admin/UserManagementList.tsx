'use client'

import { useState } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/Badge'
import { Spinner } from '@/components/ui/Spinner'
import { formatDate } from '@/lib/utils'
import type { UserRole } from '@/types/database'

interface UserRow {
  id: string
  display_name: string
  avatar_url: string | null
  role: UserRole
  city: string | null
  is_banned: boolean
  created_at: string
}

export function UserManagementList({ users }: { users: UserRow[] }) {
  const supabase = createSupabaseBrowserClient()
  const router = useRouter()
  const [loadingId, setLoadingId] = useState<string | null>(null)

  async function toggleBan(userId: string, isBanned: boolean) {
    setLoadingId(userId)
    await supabase.from('profiles').update({ is_banned: !isBanned }).eq('id', userId)
    router.refresh()
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
            const loading = loadingId === user.id
            return (
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
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
