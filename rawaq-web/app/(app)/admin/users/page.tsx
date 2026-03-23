import type { Metadata } from 'next'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { UserManagementList } from '@/components/admin/UserManagementList'

export const metadata: Metadata = { title: 'User Management' }

export default async function AdminUsersPage() {
  const supabase = await createSupabaseServerClient()

  const { data: users } = await supabase
    .from('profiles')
    .select('id, display_name, avatar_url, role, city, is_banned, created_at')
    .order('created_at', { ascending: false })
    .limit(50)

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-gray-900">Users ({users?.length ?? 0})</h2>
      <UserManagementList users={users ?? []} />
    </div>
  )
}
