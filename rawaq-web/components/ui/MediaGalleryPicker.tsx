'use client'

import { useCallback, useEffect, useState } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { useAuth } from '@/contexts/auth-context'
import { Modal } from './Modal'
import { Spinner } from './Spinner'

interface GalleryImage {
  name: string
  publicUrl: string
}

interface MediaGalleryPickerProps {
  open: boolean
  onSelect: (publicUrl: string) => void
  onClose: () => void
}

export function MediaGalleryPicker({ open, onSelect, onClose }: MediaGalleryPickerProps) {
  const { user } = useAuth()
  const supabase = createSupabaseBrowserClient()
  const [images, setImages] = useState<GalleryImage[]>([])
  const [loading, setLoading] = useState(false)

  const loadImages = useCallback(async () => {
    if (!user) return
    setLoading(true)
    try {
      const { data, error } = await supabase.storage
        .from('comment-media')
        .list(user.id, { limit: 50, sortBy: { column: 'created_at', order: 'desc' } })

      if (error || !data) return

      const imgs: GalleryImage[] = data
        .filter((f) => f.name !== '.emptyFolderPlaceholder')
        .map((f) => {
          const { data: { publicUrl } } = supabase.storage
            .from('comment-media')
            .getPublicUrl(`${user.id}/${f.name}`)
          return { name: f.name, publicUrl }
        })

      setImages(imgs)
    } finally {
      setLoading(false)
    }
  }, [user, supabase])

  useEffect(() => {
    if (open) loadImages()
  }, [open, loadImages])

  return (
    <Modal open={open} onClose={onClose} title="My uploads" className="max-w-2xl">
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Spinner />
        </div>
      ) : images.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-2 text-center">
          <span className="text-4xl">🖼️</span>
          <p className="text-sm text-gray-500">No uploads yet</p>
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-2 max-h-[60vh] overflow-y-auto">
          {images.map((img) => (
            <button
              key={img.name}
              type="button"
              onClick={() => { onSelect(img.publicUrl); onClose() }}
              className="aspect-square rounded-lg overflow-hidden border-2 border-transparent hover:border-brand-500 focus:outline-none focus:border-brand-500 transition-colors"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.publicUrl} alt="" className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </Modal>
  )
}
