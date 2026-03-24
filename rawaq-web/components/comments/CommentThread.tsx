'use client'

import { useEffect, useOptimistic, useState, useTransition } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { useAuth } from '@/contexts/auth-context'
import { CommentItem } from './CommentItem'
import { CommentForm } from './CommentForm'
import { EmptyState } from '@/components/ui/EmptyState'
import type { CommentWithAuthor } from '@/types/database'

interface CommentThreadProps {
  eventId: string
  initialComments: CommentWithAuthor[]
  currentUserId: string | null
}

export function CommentThread({ eventId, initialComments, currentUserId }: CommentThreadProps) {
  const { user, profile } = useAuth()
  const supabase = createSupabaseBrowserClient()
  const [comments, setComments] = useState<CommentWithAuthor[]>(initialComments)
  const [, startTransition] = useTransition()

  // Realtime subscription for new comments
  useEffect(() => {
    const channel = supabase
      .channel(`event-comments-${eventId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'comments',
          filter: `event_id=eq.${eventId}`,
        },
        async (payload) => {
          // Fetch author for the new comment
          const { data: author } = await supabase
            .from('profiles')
            .select('id, display_name, avatar_url')
            .eq('id', payload.new.user_id)
            .single()

          const newComment: CommentWithAuthor = {
            ...(payload.new as CommentWithAuthor),
            author: author ?? { id: payload.new.user_id, display_name: 'Unknown', avatar_url: null },
            replies: [],
          }

          startTransition(() => {
            setComments((prev) => {
              if (payload.new.parent_id) {
                // It's a reply — append to parent
                return prev.map((c) =>
                  c.id === payload.new.parent_id
                    ? { ...c, replies: [newComment, ...(c.replies ?? [])] }
                    : c,
                )
              }
              // Top-level comment — prepend only if not already there
              if (prev.some((c) => c.id === newComment.id)) return prev
              return [newComment, ...prev]
            })
          })
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'comments',
          filter: `event_id=eq.${eventId}`,
        },
        (payload) => {
          startTransition(() => {
            setComments((prev) =>
              prev.map((c) => {
                if (c.id === payload.new.id) return { ...c, ...payload.new }
                return {
                  ...c,
                  replies: c.replies?.map((r) =>
                    r.id === payload.new.id ? { ...r, ...payload.new } : r,
                  ),
                }
              }),
            )
          })
        },
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [eventId, supabase])

  async function postComment(content: string, parentId: string | null = null) {
    if (!user) return

    const res = await fetch('/api/comments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event_id: eventId,
        content,
        parent_id: parentId,
        mentions: [],
      }),
    })

    if (!res.ok) return
    const json = await res.json()
    const data = json.data

    // Optimistically add before realtime fires
    const newComment: CommentWithAuthor = {
      ...data,
      author: {
        id: user.id,
        display_name: profile?.display_name ?? 'You',
        avatar_url: profile?.avatar_url ?? null,
      },
      replies: [],
    }

    setComments((prev) => {
      if (parentId) {
        return prev.map((c) =>
          c.id === parentId
            ? { ...c, replies: [newComment, ...(c.replies ?? [])] }
            : c,
        )
      }
      return [newComment, ...prev]
    })
  }

  async function deleteComment(commentId: string) {
    if (!user) return
    await supabase
      .from('comments')
      .update({ is_deleted: true, deleted_at: new Date().toISOString() })
      .eq('id', commentId)
      .eq('user_id', user.id)

    setComments((prev) =>
      prev.map((c) => {
        if (c.id === commentId) return { ...c, is_deleted: true, content: '[deleted]' }
        return {
          ...c,
          replies: c.replies?.map((r) =>
            r.id === commentId ? { ...r, is_deleted: true, content: '[deleted]' } : r,
          ),
        }
      }),
    )
  }

  return (
    <div className="space-y-4">
      {/* Comment input */}
      {user ? (
        <CommentForm onSubmit={(content) => postComment(content, null)} />
      ) : (
        <p className="text-sm text-gray-500 text-center py-4">
          <a href="/login" className="text-brand-600 font-medium hover:underline">Sign in</a> to leave a comment.
        </p>
      )}

      {/* Comments list */}
      {comments.length === 0 ? (
        <EmptyState icon="💬" title="No comments yet" description="Be the first to start the conversation" />
      ) : (
        <div className="space-y-3">
          {comments.map((comment) => (
            <CommentItem
              key={comment.id}
              comment={comment}
              currentUserId={currentUserId}
              onReply={(content) => postComment(content, comment.id)}
              onDelete={deleteComment}
            />
          ))}
        </div>
      )}
    </div>
  )
}
