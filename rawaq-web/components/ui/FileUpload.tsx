'use client'

import { useRef, useState } from 'react'

export type UploadType = 'avatar' | 'event-cover' | 'comment-media'

interface FileUploadProps {
  type: UploadType
  value?: string | null
  onChange: (url: string) => void
  label?: string
  accept?: string
  maxSizeMB?: number
  className?: string
  /** Render as a compact square (for avatars) */
  compact?: boolean
}

const TYPE_DEFAULTS: Record<UploadType, { accept: string; maxSizeMB: number; hint: string }> = {
  'avatar':        { accept: 'image/jpeg,image/png,image/webp,image/gif', maxSizeMB: 5,  hint: 'JPG, PNG, WEBP or GIF · max 5 MB' },
  'event-cover':   { accept: 'image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime', maxSizeMB: 50, hint: 'Image or video · max 50 MB' },
  'comment-media': { accept: 'image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime', maxSizeMB: 10, hint: 'Image or video · max 10 MB' },
}

function isVideo(url: string) {
  return /\.(mp4|mov|webm)$/i.test(url)
}

export function FileUpload({
  type, value, onChange, label, accept, maxSizeMB, className = '', compact = false,
}: FileUploadProps) {
  const defaults  = TYPE_DEFAULTS[type]
  const finalAccept  = accept   ?? defaults.accept
  const finalMaxMB   = maxSizeMB ?? defaults.maxSizeMB
  const finalHint    = defaults.hint

  const inputRef   = useRef<HTMLInputElement>(null)
  const [progress, setProgress]   = useState<'idle' | 'uploading' | 'done' | 'error'>('idle')
  const [errMsg,   setErrMsg]     = useState('')
  const [dragging, setDragging]   = useState(false)

  async function handleFile(file: File) {
    setErrMsg('')

    // Client-side validation before hitting the server
    if (file.size > finalMaxMB * 1024 * 1024) {
      setErrMsg(`File too large. Max ${finalMaxMB} MB allowed.`)
      return
    }

    const fd = new FormData()
    fd.append('file', file)
    fd.append('type', type)

    setProgress('uploading')
    try {
      const res  = await fetch('/api/upload', { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok) {
        setErrMsg(json.error ?? 'Upload failed.')
        setProgress('error')
        return
      }
      onChange(json.data.url)
      setProgress('done')
    } catch {
      setErrMsg('Network error. Please try again.')
      setProgress('error')
    }
  }

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
    // reset so the same file can be re-selected
    e.target.value = ''
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) handleFile(file)
  }

  if (compact) {
    // Avatar-style: circular preview + click to change
    return (
      <div className={`flex flex-col items-center gap-2 ${className}`}>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="relative group w-20 h-20 rounded-full overflow-hidden border-2 border-dashed border-gray-300 hover:border-brand-400 transition-colors bg-gray-50 focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value} alt="Avatar" className="w-full h-full object-cover" />
          ) : (
            <span className="text-2xl text-gray-400 flex items-center justify-center h-full">📷</span>
          )}
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <span className="text-white text-xs font-medium">Change</span>
          </div>
        </button>

        {progress === 'uploading' && (
          <span className="text-xs text-brand-600 animate-pulse">Uploading…</span>
        )}
        {errMsg && <span className="text-xs text-red-600 text-center">{errMsg}</span>}
        <span className="text-xs text-gray-400">{finalHint}</span>

        <input
          ref={inputRef}
          type="file"
          accept={finalAccept}
          onChange={onInputChange}
          className="hidden"
        />
      </div>
    )
  }

  // Full drop-zone style (event cover, comment media)
  return (
    <div className={className}>
      {label && <p className="label mb-1">{label}</p>}

      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={`relative cursor-pointer rounded-xl border-2 border-dashed transition-colors
          ${dragging ? 'border-brand-400 bg-brand-50' : 'border-gray-200 hover:border-brand-400 hover:bg-gray-50'}
          ${value ? 'p-0 overflow-hidden' : 'p-6'}`}
      >
        {value ? (
          <div className="relative group">
            {isVideo(value) ? (
              <video src={value} className="w-full max-h-56 object-cover rounded-xl" controls />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={value} alt="Cover" className="w-full max-h-56 object-cover rounded-xl" />
            )}
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-xl flex items-center justify-center">
              <span className="text-white text-sm font-medium">Click to replace</span>
            </div>
          </div>
        ) : (
          <div className="text-center space-y-1">
            <p className="text-3xl">{type === 'event-cover' ? '🖼️' : '📎'}</p>
            <p className="text-sm font-medium text-gray-700">
              {progress === 'uploading' ? 'Uploading…' : 'Click or drag to upload'}
            </p>
            <p className="text-xs text-gray-400">{finalHint}</p>
          </div>
        )}

        {progress === 'uploading' && (
          <div className="absolute inset-0 bg-white/70 rounded-xl flex items-center justify-center">
            <span className="text-sm text-brand-600 font-medium animate-pulse">Uploading…</span>
          </div>
        )}
      </div>

      {errMsg && <p className="text-xs text-red-600 mt-1">{errMsg}</p>}

      <input
        ref={inputRef}
        type="file"
        accept={finalAccept}
        onChange={onInputChange}
        className="hidden"
      />
    </div>
  )
}
