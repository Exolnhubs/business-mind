import type { Metadata } from 'next'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { FlaggedCommentList, type FlaggedComment } from '@/components/admin/FlaggedCommentList'

export const metadata: Metadata = { title: 'Flagged Comments' }

export default async function AdminCommentsPage() {
  const supabase = await createSupabaseServerClient()

  const { data: comments } = await supabase
    .from('comments')
    .select(`
      *,
      author:profiles!user_id(id, display_name, avatar_url),
      event:events!event_id(id, title)
    `)
    .eq('is_flagged', true)
    .eq('is_deleted', false)
    .order('created_at', { ascending: false })
    .limit(50)

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-gray-900">
        Flagged Comments ({comments?.length ?? 0})
      </h2>
      <FlaggedCommentList comments={(comments ?? []) as unknown as FlaggedComment[]} />
    </div>
  )
}
