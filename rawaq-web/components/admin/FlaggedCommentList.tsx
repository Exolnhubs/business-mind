'use client'

import { useState } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Spinner } from '@/components/ui/Spinner'
import { formatRelativeTime } from '@/lib/utils'

interface FlaggedComment {
  id: string
  content: string
  is_flagged: boolean
  is_deleted: boolean
  created_at: string
  author: { id: string; display_name: string; avatar_url: string | null } | null
  event: { id: string; title: string } | null
}

export function FlaggedCommentList({ comments }: { comments: FlaggedComment[] }) {
  const supabase = createSupabaseBrowserClient()
  const router = useRouter()
  const [loadingId, setLoadingId] = useState<string | null>(null)

  async function dismiss(commentId: string) {
    setLoadingId(commentId)
    await supabase.from('comments').update({ is_flagged: false }).eq('id', commentId)
    router.refresh()
    setLoadingId(null)
  }

  async function deleteComment(commentId: string) {
    setLoadingId(commentId)
    await supabase.from('comments').update({
      is_deleted: true,
      deleted_at: new Date().toISOString(),
      is_flagged: false,
    }).eq('id', commentId)
    router.refresh()
    setLoadingId(null)
  }

  if (!comments.length) {
    return (
      <div className="text-center py-12">
        <div className="text-4xl mb-2">✅</div>
        <p className="text-gray-500 text-sm">No flagged comments — you're all clear!</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {comments.map((comment) => {
        const loading = loadingId === comment.id
        return (
          <div key={comment.id} className="card p-4 space-y-3 border-s-4 border-red-300">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-gray-900">
                    {comment.author?.display_name ?? 'Unknown'}
                  </span>
                  <span className="text-xs text-gray-400">{formatRelativeTime(comment.created_at)}</span>
                </div>
                {comment.event && (
                  <a
                    href={`/events/${comment.event.id}`}
                    className="text-xs text-brand-600 hover:underline"
                    target="_blank"
                    rel="noreferrer"
                  >
                    on: {comment.event.title}
                  </a>
                )}
              </div>

              <div className="flex gap-2 shrink-0">
                <button
                  onClick={() => dismiss(comment.id)}
                  disabled={loading}
                  className="btn-secondary text-xs px-3 py-1.5"
                >
                  {loading ? <Spinner size="sm" /> : 'Dismiss'}
                </button>
                <button
                  onClick={() => deleteComment(comment.id)}
                  disabled={loading}
                  className="btn-danger text-xs px-3 py-1.5"
                >
                  Delete
                </button>
              </div>
            </div>

            <p className="text-sm text-gray-700 bg-red-50 rounded-lg px-3 py-2">
              {comment.content}
            </p>
          </div>
        )
      })}
    </div>
  )
}
