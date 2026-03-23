'use client'

import { useState, useRef, type FormEvent } from 'react'
import { Spinner } from '@/components/ui/Spinner'

interface CommentFormProps {
  onSubmit: (content: string) => Promise<void>
  placeholder?: string
  autoFocus?: boolean
  onCancel?: () => void
}

export function CommentForm({ onSubmit, placeholder = 'Write a comment…', autoFocus, onCancel }: CommentFormProps) {
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(false)
  const ref = useRef<HTMLTextAreaElement>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const trimmed = content.trim()
    if (!trimmed) return
    setLoading(true)
    await onSubmit(trimmed)
    setContent('')
    setLoading(false)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <textarea
        ref={ref}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        rows={3}
        className="input resize-none"
        maxLength={2000}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            handleSubmit(e as unknown as FormEvent)
          }
        }}
      />
      <div className="flex items-center gap-2 justify-end">
        {onCancel && (
          <button type="button" onClick={onCancel} className="btn-ghost text-xs">
            Cancel
          </button>
        )}
        <button type="submit" disabled={!content.trim() || loading} className="btn-primary text-xs px-4 py-2">
          {loading ? <Spinner size="sm" /> : 'Post'}
        </button>
      </div>
    </form>
  )
}
