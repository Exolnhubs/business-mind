'use client'

import { useState, useRef, type FormEvent } from 'react'
import { Spinner } from '@/components/ui/Spinner'
import { FileUpload } from '@/components/ui/FileUpload'

interface CommentFormProps {
  onSubmit: (content: string, mediaUrl?: string) => Promise<void>
  placeholder?: string
  autoFocus?: boolean
  onCancel?: () => void
}

export function CommentForm({ onSubmit, placeholder = 'Write a comment…', autoFocus, onCancel }: CommentFormProps) {
  const [content, setContent] = useState('')
  const [mediaUrl, setMediaUrl] = useState<string | undefined>(undefined)
  const [showUpload, setShowUpload] = useState(false)
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)

  const canSubmit = !!content.trim() || !!mediaUrl

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    setLoading(true)
    await onSubmit(content.trim(), mediaUrl)
    setContent('')
    setMediaUrl(undefined)
    setShowUpload(false)
    setLoading(false)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <textarea
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

      {showUpload && (
        <FileUpload
          type="comment-media"
          value={mediaUrl ?? null}
          onChange={(url) => setMediaUrl(url)}
          onUploadingChange={setUploading}
        />
      )}

      <div className="flex items-center gap-2 justify-between">
        <button
          type="button"
          onClick={() => { setShowUpload((v) => !v); if (showUpload) setMediaUrl(undefined) }}
          className="text-xs text-gray-400 hover:text-brand-600 transition-colors"
          title="Attach image or video"
        >
          📎 {showUpload ? 'Remove attachment' : 'Attach media'}
        </button>

        <div className="flex items-center gap-2">
          {onCancel && (
            <button type="button" onClick={onCancel} className="btn-ghost text-xs">
              Cancel
            </button>
          )}
          <button type="submit" disabled={!canSubmit || loading || uploading} className="btn-primary text-xs px-4 py-2">
            {loading ? <Spinner size="sm" /> : 'Post'}
          </button>
        </div>
      </div>
    </form>
  )
}
