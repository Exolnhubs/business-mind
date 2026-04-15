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

type CommentTarget =
  | { eventId: string; happeningId?: never }
  | { eventId?: never; happeningId: string }

interface Props {
  target: CommentTarget
  initialComments: CommentWithAuthor[]
  currentUserId: string | null
  emptyTitle?: string
  loginPrompt?: string
}

export function CommentThread({
  target,
  initialComments,
  currentUserId,
  emptyTitle = 'No comments yet',
  loginPrompt = 'Sign in to comment',
}: Props) {
  const { user, profile } = useAuth()
  const [comments, setComments] = useState<CommentWithAuthor[]>(initialComments)
  // Track IDs we inserted ourselves so the realtime handler doesn't add them again
  const optimisticIds = useRef<Set<string>>(new Set())
  const targetFilter = target.eventId ? `event_id=eq.${target.eventId}` : `happening_id=eq.${target.happeningId}`
  const channelName = target.eventId ? `event-comments-${target.eventId}` : `happening-comments-${target.happeningId}`

  useEffect(() => {
    setComments(initialComments)
  }, [initialComments, targetFilter])

  useEffect(() => {
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'comments', filter: targetFilter },
        async (payload) => {
          // Skip comments we already added optimistically
          if (optimisticIds.current.has(payload.new.id)) {
            optimisticIds.current.delete(payload.new.id)
            return
          }

          const { data: author } = await supabase
            .from('profiles')
            .select('id, display_name, avatar_url, plan_id')
            .eq('id', payload.new.user_id)
            .single()

          const newComment: CommentWithAuthor = {
            ...(payload.new as CommentWithAuthor),
            author: author ?? { id: payload.new.user_id, display_name: 'Unknown', avatar_url: null, plan_id: 'user_free' },
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
  }, [channelName, targetFilter])

  async function postComment(content: string, parentId: string | null = null, mediaUrl?: string) {
    if (!user) return

    const { data, error } = await apiPost<{ id: string }>('/api/comments', {
      ...(target.eventId ? { event_id: target.eventId } : { happening_id: target.happeningId }),
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
      author: { id: user.id, display_name: profile?.display_name ?? 'You', avatar_url: profile?.avatar_url ?? null, plan_id: profile?.plan_id ?? 'user_free' },
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
        : <Text style={styles.loginPrompt}>{loginPrompt}</Text>
      }
      {comments.length === 0
        ? <EmptyState icon="??" title={emptyTitle} />
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


