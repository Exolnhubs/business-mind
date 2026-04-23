'use client'

import { useState, type FormEvent } from 'react'
import { Spinner } from '@/components/ui/Spinner'
import { FileUpload } from '@/components/ui/FileUpload'
import { MediaGalleryPicker } from '@/components/ui/MediaGalleryPicker'

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
  const [showGallery, setShowGallery] = useState(false)
  const [showAttachMenu, setShowAttachMenu] = useState(false)
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
    setShowAttachMenu(false)
    setLoading(false)
  }

  function removeAttachment() {
    setMediaUrl(undefined)
    setShowUpload(false)
    setShowAttachMenu(false)
  }

  return (
    <>
      <MediaGalleryPicker
        open={showGallery}
        onSelect={(url) => { setMediaUrl(url); setShowUpload(false) }}
        onClose={() => setShowGallery(false)}
      />

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

        {/* Gallery-selected image preview */}
        {!showUpload && mediaUrl && (
          <div className="relative inline-block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={mediaUrl} alt="Attachment" loading="lazy" className="h-24 rounded-lg object-cover border border-gray-200" />
            <button
              type="button"
              onClick={removeAttachment}
              className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-gray-700 text-white rounded-full text-xs flex items-center justify-center hover:bg-red-600 transition-colors"
              aria-label="Remove attachment"
            >
              ✕
            </button>
          </div>
        )}

        <div className="flex items-center gap-2 justify-between">
          {/* Attach button with dropdown menu */}
          <div className="relative">
            {mediaUrl ? (
              <button
                type="button"
                onClick={removeAttachment}
                className="text-xs text-red-500 hover:text-red-700 transition-colors"
              >
                📎 Remove attachment
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setShowAttachMenu((v) => !v)}
                className="text-xs text-gray-400 hover:text-brand-600 transition-colors"
                title="Attach image or video"
              >
                📎 Attach media
              </button>
            )}

            {showAttachMenu && !mediaUrl && (
              <>
                {/* Close menu on outside click */}
                <div className="fixed inset-0 z-10" onClick={() => setShowAttachMenu(false)} aria-hidden="true" />
                <div className="absolute left-0 bottom-full mb-1 z-20 bg-white border border-gray-200 rounded-xl shadow-lg py-1 w-48">
                  <button
                    type="button"
                    onClick={() => { setShowAttachMenu(false); setShowGallery(true) }}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    🖼️ Choose from uploads
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowAttachMenu(false); setShowUpload(true) }}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    ⬆️ Upload new image
                  </button>
                </div>
              </>
            )}
          </div>

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
    </>
  )
}
