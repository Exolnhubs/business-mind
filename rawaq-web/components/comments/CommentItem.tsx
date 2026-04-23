'use client'

import { useState } from 'react'
import Link from 'next/link'
import { formatRelativeTime } from '@/lib/utils'
import { CommentForm } from './CommentForm'
import { PlanBadge } from '@/components/ui/PlanBadge'
import type { CommentWithAuthor } from '@/types/database'

interface CommentItemProps {
  comment: CommentWithAuthor
  currentUserId: string | null
  onReply: (content: string, mediaUrl?: string) => Promise<void>
  onDelete: (commentId: string) => Promise<void>
  isReply?: boolean
}

function isVideo(url: string) {
  return /\.(mp4|mov|webm)$/i.test(url)
}

export function CommentItem({ comment, currentUserId, onReply, onDelete, isReply }: CommentItemProps) {
  const [showReply, setShowReply] = useState(false)
  const [showReplies, setShowReplies] = useState(true)

  const isOwner = currentUserId === comment.user_id
  const isDeleted = comment.is_deleted
  const replyCount = comment.replies?.length ?? 0

  async function handleReply(content: string, mediaUrl?: string) {
    await onReply(content, mediaUrl)
    setShowReply(false)
  }

  return (
    <div className={`flex gap-3 ${isReply ? 'ms-8 ps-4 border-s-2 border-gray-100' : ''}`}>
      {/* Avatar */}
      <Link href={comment.author?.id ? `/user/${comment.author.id}` : '#'} className="shrink-0">
        <div className="w-8 h-8 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-xs font-bold uppercase hover:opacity-80 transition-opacity">
          {comment.author?.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={comment.author.avatar_url} alt="" loading="lazy" className="w-full h-full object-cover rounded-full" />
          ) : (
            (comment.author?.display_name ?? '?')[0]
          )}
        </div>
      </Link>

      <div className="flex-1 min-w-0">
        {/* Header */}
        <div className="flex items-center gap-2 mb-0.5">
          <span className="inline-flex items-center gap-1">
            <Link
              href={comment.author?.id ? `/user/${comment.author.id}` : '#'}
              className="text-sm font-semibold text-gray-900 hover:text-brand-600 transition-colors"
            >
              {comment.author?.display_name ?? 'Unknown'}
            </Link>
            <PlanBadge planId={comment.author?.plan_id} size={14} />
          </span>
          <span className="text-xs text-gray-400">
            {formatRelativeTime(comment.created_at)}
          </span>
        </div>

        {/* Content */}
        {isDeleted ? (
          <p className="text-sm text-gray-400 italic">[deleted]</p>
        ) : (
          <>
            {comment.content && (
              <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">{comment.content}</p>
            )}
            {comment.media_url && (
              <div className="mt-2 rounded-xl overflow-hidden max-w-xs">
                {isVideo(comment.media_url) ? (
                  <video src={comment.media_url} controls className="w-full max-h-56 object-cover rounded-xl" />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={comment.media_url} alt="attachment" loading="lazy" className="w-full max-h-56 object-cover rounded-xl" />
                )}
              </div>
            )}
          </>
        )}

        {/* Actions */}
        {!isDeleted && (
          <div className="flex items-center gap-3 mt-1.5">
            {currentUserId && !isReply && (
              <button
                onClick={() => setShowReply((v) => !v)}
                className="text-xs text-gray-400 hover:text-brand-600 font-medium transition-colors"
              >
                Reply
              </button>
            )}
            {isOwner && (
              <button
                onClick={() => onDelete(comment.id)}
                className="text-xs text-gray-400 hover:text-red-500 font-medium transition-colors"
              >
                Delete
              </button>
            )}
          </div>
        )}

        {/* Reply form */}
        {showReply && (
          <div className="mt-3">
            <CommentForm
              onSubmit={handleReply}
              placeholder={`Reply to ${comment.author?.display_name ?? 'comment'}…`}
              autoFocus
              onCancel={() => setShowReply(false)}
            />
          </div>
        )}

        {/* Replies */}
        {replyCount > 0 && (
          <div className="mt-3 space-y-3">
            <button
              onClick={() => setShowReplies((v) => !v)}
              className="text-xs text-brand-600 font-medium hover:underline"
            >
              {showReplies ? '▾' : '▸'} {replyCount} {replyCount === 1 ? 'reply' : 'replies'}
            </button>

            {showReplies &&
              comment.replies?.map((reply) => (
                <CommentItem
                  key={reply.id}
                  comment={reply}
                  currentUserId={currentUserId}
                  onReply={onReply}
                  onDelete={onDelete}
                  isReply
                />
              ))}
          </div>
        )}
      </div>
    </div>
  )
}
