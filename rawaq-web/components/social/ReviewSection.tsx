'use client'

import { useState, useTransition } from 'react'
import { SafeImage } from '@/components/ui/SafeImage'
import { formatDate } from '@/lib/utils'
import type { UserReviewWithReviewer } from '@/types/database'

// ── Star picker ────────────────────────────────────────────────────────────
function StarPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [hover, setHover] = useState(0)
  return (
    <span className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((s) => (
        <button
          key={s}
          type="button"
          className={`text-2xl transition-colors ${
            s <= (hover || value) ? 'text-amber-400' : 'text-gray-200'
          }`}
          onMouseEnter={() => setHover(s)}
          onMouseLeave={() => setHover(0)}
          onClick={() => onChange(s)}
          aria-label={`Rate ${s} star${s !== 1 ? 's' : ''}`}
        >
          ★
        </button>
      ))}
    </span>
  )
}

// ── Static stars display ───────────────────────────────────────────────────
function Stars({ rating, size = 'sm' }: { rating: number; size?: 'sm' | 'md' }) {
  const sz = size === 'md' ? 'text-base' : 'text-xs'
  return (
    <span className={sz}>
      {[1, 2, 3, 4, 5].map((s) => (
        <span key={s} className={s <= Math.round(rating) ? 'text-amber-400' : 'text-gray-200'}>★</span>
      ))}
    </span>
  )
}

// ── Single review card ─────────────────────────────────────────────────────
function ReviewCard({
  review,
  isOwn,
  onEdit,
  onDelete,
}: {
  review: UserReviewWithReviewer
  isOwn: boolean
  onEdit: () => void
  onDelete: () => void
}) {
  const initials = review.reviewer.display_name
    .split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase()

  return (
    <div className="flex gap-3">
      <div className="relative w-9 h-9 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-sm font-bold shrink-0 overflow-hidden">
        {review.reviewer.avatar_url
          ? <SafeImage src={review.reviewer.avatar_url} alt={review.reviewer.display_name} fill sizes="36px" className="object-cover" />
          : initials}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div>
            <span className="text-sm font-semibold text-gray-900">{review.reviewer.display_name}</span>
            <div className="flex items-center gap-1.5 mt-0.5">
              <Stars rating={review.rating} />
              <span className="text-xs text-amber-600 font-medium">{review.rating}/5</span>
              <span className="text-xs text-gray-400">· {formatDate(review.created_at)}</span>
            </div>
          </div>
          {isOwn && (
            <div className="flex gap-2 shrink-0">
              <button onClick={onEdit} className="text-xs text-brand-600 hover:underline">Edit</button>
              <button onClick={onDelete} className="text-xs text-red-500 hover:underline">Delete</button>
            </div>
          )}
        </div>
        {review.content && (
          <p className="text-sm text-gray-600 mt-1 leading-relaxed">{review.content}</p>
        )}
      </div>
    </div>
  )
}

// ── Write / edit form ──────────────────────────────────────────────────────
function ReviewForm({
  reviewedId,
  initial,
  onSaved,
  onCancel,
}: {
  reviewedId: string
  initial?: { rating: number; content: string | null }
  onSaved: (review: { rating: number; content: string | null }) => void
  onCancel?: () => void
}) {
  const [rating, setRating]   = useState(initial?.rating ?? 0)
  const [content, setContent] = useState(initial?.content ?? '')
  const [error, setError]     = useState('')
  const [pending, start]      = useTransition()

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (rating === 0) { setError('Please choose a star rating.'); return }
    setError('')
    start(async () => {
      const res = await fetch(`/api/users/${reviewedId}/reviews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating, content: content.trim() || null }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        setError(j.message ?? 'Failed to save review.')
        return
      }
      onSaved({ rating, content: content.trim() || null })
    })
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Your rating</label>
        <StarPicker value={rating} onChange={setRating} />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">
          Comment <span className="text-gray-400 font-normal">(optional)</span>
        </label>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          maxLength={1000}
          rows={3}
          placeholder="Share your experience with this user…"
          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-300 resize-none"
        />
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="btn-primary text-sm px-4 py-1.5 disabled:opacity-60"
        >
          {pending ? 'Saving…' : initial ? 'Update review' : 'Submit review'}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="text-sm text-gray-500 hover:text-gray-700 px-3 py-1.5">
            Cancel
          </button>
        )}
      </div>
    </form>
  )
}

// ── Rating summary bar ─────────────────────────────────────────────────────
function RatingSummary({ reviews }: { reviews: UserReviewWithReviewer[] }) {
  if (reviews.length === 0) return null
  const counts = [5, 4, 3, 2, 1].map((s) => ({
    star: s,
    count: reviews.filter((r) => r.rating === s).length,
  }))
  return (
    <div className="space-y-1">
      {counts.map(({ star, count }) => (
        <div key={star} className="flex items-center gap-2 text-xs text-gray-500">
          <span className="w-3 text-right">{star}</span>
          <span className="text-amber-400 text-xs">★</span>
          <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-amber-400 rounded-full"
              style={{ width: reviews.length ? `${(count / reviews.length) * 100}%` : '0%' }}
            />
          </div>
          <span className="w-4 text-right">{count}</span>
        </div>
      ))}
    </div>
  )
}

// ── Main export ────────────────────────────────────────────────────────────
export interface ReviewSectionProps {
  reviewedId: string
  reviews: UserReviewWithReviewer[]
  totalReviews: number
  avgRating: number | null
  viewerReview: { rating: number; content: string | null } | null
  isLoggedIn: boolean
  isSelf: boolean
}

export function ReviewSection({
  reviewedId,
  reviews: initialReviews,
  totalReviews: initialTotal,
  avgRating: initialAvg,
  viewerReview: initialViewerReview,
  isLoggedIn,
  isSelf,
}: ReviewSectionProps) {
  const [reviews, setReviews]           = useState(initialReviews)
  const [totalReviews, setTotalReviews] = useState(initialTotal)
  const [avgRating, setAvgRating]       = useState(initialAvg)
  const [viewerReview, setViewerReview] = useState(initialViewerReview)
  const [showForm, setShowForm]         = useState(false)
  const [editing, setEditing]           = useState(false)
  const [page, setPage]                 = useState(1)
  const [loadingMore, startLoadMore]    = useTransition()

  function handleSaved(saved: { rating: number; content: string | null }) {
    setViewerReview(saved)
    setShowForm(false)
    setEditing(false)
    // Reload reviews from server to get proper reviewer info
    fetch(`/api/users/${reviewedId}/reviews?page=1`)
      .then((r) => r.json())
      .then((j) => {
        setReviews(j.data ?? [])
        setTotalReviews(j.total_reviews ?? j.total ?? 0)
        setAvgRating(j.avg_rating ?? null)
        setPage(1)
      })
      .catch(() => {})
  }

  function loadMore() {
    const next = page + 1
    startLoadMore(async () => {
      const res = await fetch(`/api/users/${reviewedId}/reviews?page=${next}`)
      if (!res.ok) return
      const j = await res.json()
      setReviews((prev) => [...prev, ...(j.data ?? [])])
      setPage(next)
    })
  }

  const hasMore = reviews.length < totalReviews

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold text-gray-900">
          Reviews
          {totalReviews > 0 && (
            <span className="ml-1.5 text-sm font-normal text-gray-400">({totalReviews})</span>
          )}
        </h2>
        {isLoggedIn && !isSelf && !viewerReview && !showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="text-sm text-brand-600 hover:underline font-medium"
          >
            + Write a review
          </button>
        )}
      </div>

      {/* Summary */}
      {avgRating !== null && totalReviews > 0 && (
        <div className="card p-4 flex gap-6 items-center">
          <div className="text-center shrink-0">
            <div className="text-3xl font-bold text-gray-900">{avgRating.toFixed(1)}</div>
            <Stars rating={avgRating} size="md" />
            <div className="text-xs text-gray-400 mt-0.5">{totalReviews} review{totalReviews !== 1 ? 's' : ''}</div>
          </div>
          <div className="flex-1">
            <RatingSummary reviews={reviews} />
          </div>
        </div>
      )}

      {/* Viewer's existing review */}
      {viewerReview && !editing && (
        <div className="card p-4 border-brand-200 bg-brand-50/30">
          <p className="text-xs text-brand-600 font-medium mb-2">Your review</p>
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="flex items-center gap-1.5">
                <Stars rating={viewerReview.rating} />
                <span className="text-xs text-amber-600 font-medium">{viewerReview.rating}/5</span>
              </div>
              {viewerReview.content && (
                <p className="text-sm text-gray-600 mt-1">{viewerReview.content}</p>
              )}
            </div>
            <div className="flex gap-2 shrink-0">
              <button
                onClick={() => setEditing(true)}
                className="text-xs text-brand-600 hover:underline"
              >
                Edit
              </button>
              <DeleteReviewButton reviewedId={reviewedId} onDeleted={() => {
                setViewerReview(null)
                fetch(`/api/users/${reviewedId}/reviews?page=1`)
                  .then((r) => r.json())
                  .then((j) => {
                    setReviews(j.data ?? [])
                    setTotalReviews(j.total_reviews ?? j.total ?? 0)
                    setAvgRating(j.avg_rating ?? null)
                    setPage(1)
                  })
                  .catch(() => {})
              }} />
            </div>
          </div>
        </div>
      )}

      {/* Write / edit form */}
      {(showForm || editing) && (
        <div className="card p-4">
          <ReviewForm
            reviewedId={reviewedId}
            initial={editing ? viewerReview ?? undefined : undefined}
            onSaved={handleSaved}
            onCancel={() => { setShowForm(false); setEditing(false) }}
          />
        </div>
      )}

      {/* Not logged in prompt */}
      {!isLoggedIn && (
        <p className="text-sm text-gray-400 text-center py-2">
          <a href="/login" className="text-brand-600 hover:underline">Sign in</a> to leave a review.
        </p>
      )}

      {/* Reviews list */}
      {reviews.length > 0 ? (
        <div className="card p-4 divide-y divide-gray-100 space-y-0">
          {reviews.map((r, i) => (
            <div key={r.id} className={i > 0 ? 'pt-4 mt-4' : ''}>
              <ReviewCard
                review={r}
                isOwn={false}
                onEdit={() => {}}
                onDelete={() => {}}
              />
            </div>
          ))}
          {hasMore && (
            <div className="pt-4 mt-4 text-center">
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="text-sm text-brand-600 hover:underline disabled:opacity-60"
              >
                {loadingMore ? 'Loading…' : `Load more (${totalReviews - reviews.length} remaining)`}
              </button>
            </div>
          )}
        </div>
      ) : (
        totalReviews === 0 && !showForm && (
          <div className="text-center py-8 text-sm text-gray-400">
            No reviews yet.{isLoggedIn && !isSelf ? ' Be the first to leave one!' : ''}
          </div>
        )
      )}
    </div>
  )
}

// ── Delete button (async) ─────────────────────────────────────────────────
function DeleteReviewButton({ reviewedId, onDeleted }: { reviewedId: string; onDeleted: () => void }) {
  const [pending, start] = useTransition()
  const [confirm, setConfirm] = useState(false)

  if (confirm) {
    return (
      <span className="flex gap-1.5 items-center text-xs">
        <span className="text-gray-500">Sure?</span>
        <button
          disabled={pending}
          onClick={() => start(async () => {
            const res = await fetch(`/api/users/${reviewedId}/reviews`, { method: 'DELETE' })
            if (res.ok) onDeleted()
            else setConfirm(false)
          })}
          className="text-red-500 hover:underline disabled:opacity-60"
        >
          {pending ? '…' : 'Delete'}
        </button>
        <button onClick={() => setConfirm(false)} className="text-gray-400 hover:underline">Cancel</button>
      </span>
    )
  }

  return (
    <button onClick={() => setConfirm(true)} className="text-xs text-red-400 hover:underline">
      Delete
    </button>
  )
}
