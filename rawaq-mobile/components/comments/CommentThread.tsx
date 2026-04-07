import { useEffect, useRef, useState } from 'react'
import { View, Text, StyleSheet, Alert } from 'react-native'
import { supabase } from '@/lib/supabase'
import { apiPost } from '@/lib/api'
import { useAuth } from '@/contexts/auth-context'
import { CommentItem } from './CommentItem'
import { CommentForm } from './CommentForm'
import { EmptyState } from '@/components/ui/EmptyState'
import { Colors, Spacing, FontSize } from '@/theme'
import type { CommentWithAuthor } from '@/types/database'

interface Props {
  eventId: string
  initialComments: CommentWithAuthor[]
  currentUserId: string | null
}

export function CommentThread({ eventId, initialComments, currentUserId }: Props) {
  const { user, profile } = useAuth()
  const [comments, setComments] = useState<CommentWithAuthor[]>(initialComments)
  // Track IDs we inserted ourselves so the realtime handler doesn't add them again
  const optimisticIds = useRef<Set<string>>(new Set())

  useEffect(() => {
    const channel = supabase
      .channel(`event-comments-${eventId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'comments', filter: `event_id=eq.${eventId}` },
        async (payload) => {
          // Skip comments we already added optimistically
          if (optimisticIds.current.has(payload.new.id)) {
            optimisticIds.current.delete(payload.new.id)
            return
          }

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

          setComments((prev) => {
            if (payload.new.parent_id) {
              return prev.map((c) =>
                c.id === payload.new.parent_id
                  ? {
                      ...c,
                      replies: (c.replies ?? []).some((r) => r.id === newComment.id)
                        ? c.replies
                        : [newComment, ...(c.replies ?? [])],
                    }
                  : c,
              )
            }
            if (prev.some((c) => c.id === newComment.id)) return prev
            return [newComment, ...prev]
          })
        },
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [eventId])

  async function postComment(content: string, parentId: string | null = null, mediaUrl?: string) {
    if (!user) return

    const { data, error } = await apiPost('/api/comments', {
      event_id: eventId,
      content,
      parent_id: parentId ?? undefined,
      media_url: mediaUrl ?? undefined,
      mentions: [],
    })

    if (error || !data) {
      Alert.alert('Error', error ?? 'Failed to post comment. Please try again.')
      return
    }
    // Register this ID so the realtime handler won't double-add it
    optimisticIds.current.add(data.id)
    const newComment: CommentWithAuthor = {
      ...(data as unknown as Omit<CommentWithAuthor, 'author' | 'replies'>),
      author: { id: user.id, display_name: profile?.display_name ?? 'You', avatar_url: profile?.avatar_url ?? null },
      replies: [],
    }
    setComments((prev) => {
      if (parentId) {
        return prev.map((c) =>
          c.id === parentId ? { ...c, replies: [newComment, ...(c.replies ?? [])] } : c,
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
        return { ...c, replies: c.replies?.map((r) => r.id === commentId ? { ...r, is_deleted: true, content: '[deleted]' } : r) }
      }),
    )
  }

  return (
    <View>
      {user
        ? <CommentForm onSubmit={(content, mediaUrl) => postComment(content, null, mediaUrl)} />
        : <Text style={styles.loginPrompt}>Sign in to comment</Text>
      }
      {comments.length === 0
        ? <EmptyState icon="💬" title="No comments yet" />
        : comments.map((c) => (
          <CommentItem
            key={c.id}
            comment={c}
            currentUserId={currentUserId}
            onReply={(content, mediaUrl) => postComment(content, c.id, mediaUrl)}
            onDelete={deleteComment}
          />
        ))
      }
    </View>
  )
}

const styles = StyleSheet.create({
  loginPrompt: { fontSize: FontSize.sm, color: Colors.gray[500], textAlign: 'center', paddingVertical: Spacing.lg },
})
