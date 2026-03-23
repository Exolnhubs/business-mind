import { useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { formatRelativeTime } from '@/lib/utils'
import { CommentForm } from './CommentForm'
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/theme'
import type { CommentWithAuthor } from '@/types/database'

interface Props {
  comment: CommentWithAuthor
  currentUserId: string | null
  onReply: (content: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
  isReply?: boolean
}

export function CommentItem({ comment, currentUserId, onReply, onDelete, isReply }: Props) {
  const [showReply, setShowReply] = useState(false)
  const [showReplies, setShowReplies] = useState(true)
  const isOwner = currentUserId === comment.user_id
  const replyCount = comment.replies?.length ?? 0

  return (
    <View style={[styles.container, isReply && styles.replyContainer]}>
      {/* Avatar */}
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>
          {(comment.author?.display_name ?? '?')[0].toUpperCase()}
        </Text>
      </View>

      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.name}>{comment.author?.display_name ?? 'Unknown'}</Text>
          <Text style={styles.time}>{formatRelativeTime(comment.created_at)}</Text>
        </View>

        {comment.is_deleted
          ? <Text style={styles.deleted}>[deleted]</Text>
          : <Text style={styles.text}>{comment.content}</Text>
        }

        {!comment.is_deleted && (
          <View style={styles.actions}>
            {currentUserId && !isReply && (
              <TouchableOpacity onPress={() => setShowReply((v) => !v)}>
                <Text style={styles.action}>Reply</Text>
              </TouchableOpacity>
            )}
            {isOwner && (
              <TouchableOpacity onPress={() => onDelete(comment.id)}>
                <Text style={[styles.action, styles.deleteAction]}>Delete</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {showReply && (
          <CommentForm
            onSubmit={async (content) => { await onReply(content); setShowReply(false) }}
            placeholder={`Reply to ${comment.author?.display_name}…`}
            onCancel={() => setShowReply(false)}
            autoFocus
          />
        )}

        {replyCount > 0 && (
          <TouchableOpacity onPress={() => setShowReplies((v) => !v)} style={styles.repliesToggle}>
            <Text style={styles.repliesToggleText}>
              {showReplies ? '▾' : '▸'} {replyCount} {replyCount === 1 ? 'reply' : 'replies'}
            </Text>
          </TouchableOpacity>
        )}

        {showReplies && comment.replies?.map((reply) => (
          <CommentItem
            key={reply.id}
            comment={reply}
            currentUserId={currentUserId}
            onReply={onReply}
            onDelete={onDelete}
            isReply
          />
        ))}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.md },
  replyContainer: { marginLeft: Spacing['3xl'], borderLeftWidth: 2, borderLeftColor: Colors.gray[100], paddingLeft: Spacing.sm },
  avatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.brand[100], justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  avatarText: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.brand[700] },
  content: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: 4 },
  name: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.gray[900] },
  time: { fontSize: FontSize.xs, color: Colors.gray[400] },
  text: { fontSize: FontSize.sm, color: Colors.gray[700], lineHeight: 20 },
  deleted: { fontSize: FontSize.sm, color: Colors.gray[400], fontStyle: 'italic' },
  actions: { flexDirection: 'row', gap: Spacing.md, marginTop: 6 },
  action: { fontSize: FontSize.xs, color: Colors.gray[400], fontWeight: FontWeight.medium },
  deleteAction: { color: Colors.red.text },
  repliesToggle: { marginTop: Spacing.sm },
  repliesToggleText: { fontSize: FontSize.xs, color: Colors.brand[600], fontWeight: FontWeight.medium },
})
