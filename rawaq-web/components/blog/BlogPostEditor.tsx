'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useLocale } from '@/contexts/locale-context'
import {
  clientGetJson,
  clientPostJson,
  clientPatchJson,
  clientDeleteJson,
  isToastHandledError,
} from '@/lib/client-fetch'
import { Badge } from '@/components/ui/Badge'
import { Spinner } from '@/components/ui/Spinner'
import { SafeImage } from '@/components/ui/SafeImage'
import { formatDate } from '@/lib/utils'
import { uploadBlogMedia, BlogUploadException } from '@/lib/blog-upload'
import type { EventBlogPost, EventBlogMedia, BlogMediaKind } from '@/types/database'

// Draft media item used inside the form (no DB id yet).
type DraftMedia = {
  kind: BlogMediaKind
  url: string
  title: string | null
  thumbnail_url: string | null
  caption: string | null
}

type MediaPayload = DraftMedia & { position: number }

function toDraftMedia(m: EventBlogMedia): DraftMedia {
  return {
    kind: m.kind,
    url: m.url,
    title: m.title,
    thumbnail_url: m.thumbnail_url,
    caption: m.caption,
  }
}

export function BlogPostEditor({ eventId }: { eventId: string }) {
  const { t } = useLocale()
  const [posts, setPosts] = useState<EventBlogPost[] | null>(null)
  const [failed, setFailed] = useState(false)
  // null = no form open; '' = creating a new post; otherwise = editing that post id
  const [editing, setEditing] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const mountedRef = useRef(true)

  async function load() {
    setFailed(false)
    try {
      const res = await clientGetJson<{ data: { data: EventBlogPost[] } }>(
        `/api/events/${eventId}/blog`,
        { skipCache: true },
      )
      if (mountedRef.current) setPosts(res.data?.data ?? [])
    } catch (err) {
      if (!mountedRef.current) return
      if (!isToastHandledError(err)) setFailed(true)
      setPosts((prev) => prev ?? [])
    }
  }

  useEffect(() => {
    mountedRef.current = true
    void load()
    return () => { mountedRef.current = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId])

  async function handlePublishToggle(post: EventBlogPost) {
    setBusyId(post.id)
    try {
      await clientPatchJson(`/api/events/${eventId}/blog/${post.id}`, {
        status: post.status === 'published' ? 'draft' : 'published',
      })
      await load()
    } catch {
      /* toast already emitted by client-fetch */
    } finally {
      setBusyId(null)
    }
  }

  async function handleDelete(post: EventBlogPost) {
    if (!window.confirm(t('blog.editor.confirm_delete'))) return
    setBusyId(post.id)
    try {
      await clientDeleteJson(`/api/events/${eventId}/blog/${post.id}`)
      await load()
    } catch {
      /* toast already emitted */
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8 sm:px-6">
      <header className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <Link
            href={`/events/${eventId}`}
            className="inline-block text-sm font-medium text-brand-600 hover:text-brand-700"
          >
            {t('blog.editor.back')}
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">{t('blog.editor.title')}</h1>
          <p className="text-sm text-gray-500">{t('blog.editor.subtitle')}</p>
        </div>
        {editing === null && (
          <button type="button" className="btn-primary whitespace-nowrap" onClick={() => setEditing('')}>
            {t('blog.editor.new_post')}
          </button>
        )}
      </header>

      {editing === '' && (
        <PostForm
          eventId={eventId}
          onDone={() => {
            setEditing(null)
            void load()
          }}
          onCancel={() => setEditing(null)}
        />
      )}

      {posts === null ? (
        <div className="space-y-4" aria-busy="true">
          {[0, 1].map((i) => (
            <div key={i} className="card space-y-3 p-6">
              <div className="h-5 w-1/2 animate-pulse rounded bg-gray-100" />
              <div className="h-4 w-full animate-pulse rounded bg-gray-100" />
            </div>
          ))}
        </div>
      ) : failed ? (
        <div className="card p-8 text-center text-sm text-gray-400">{t('blog.load_failed_desc')}</div>
      ) : posts.length === 0 && editing === null ? (
        <div className="card flex flex-col items-center gap-1 px-6 py-16 text-center">
          <h2 className="text-lg font-semibold text-gray-900">{t('blog.editor.empty_title')}</h2>
          <p className="max-w-sm text-sm text-gray-500">{t('blog.editor.empty_desc')}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {posts.map((post) =>
            editing === post.id ? (
              <PostForm
                key={post.id}
                eventId={eventId}
                post={post}
                onDone={() => {
                  setEditing(null)
                  void load()
                }}
                onCancel={() => setEditing(null)}
              />
            ) : (
              <PostRow
                key={post.id}
                post={post}
                busy={busyId === post.id}
                onEdit={() => setEditing(post.id)}
                onPublishToggle={() => handlePublishToggle(post)}
                onDelete={() => handleDelete(post)}
              />
            ),
          )}
        </div>
      )}
    </div>
  )
}

function PostRow({
  post,
  busy,
  onEdit,
  onPublishToggle,
  onDelete,
}: {
  post: EventBlogPost
  busy: boolean
  onEdit: () => void
  onPublishToggle: () => void
  onDelete: () => void
}) {
  const { t } = useLocale()
  const isPublished = post.status === 'published'
  return (
    <article className="card space-y-3 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-lg font-semibold text-gray-900">{post.title}</h2>
            <Badge variant={isPublished ? 'green' : 'gray'}>
              {isPublished ? t('blog.editor.published_badge') : t('blog.editor.draft_badge')}
            </Badge>
          </div>
          {post.published_at && (
            <p className="text-xs text-gray-400">{formatDate(post.published_at)}</p>
          )}
        </div>
        {busy && <Spinner size="sm" />}
      </div>

      {post.body && (
        <p className="line-clamp-3 whitespace-pre-line text-sm text-gray-600">{post.body}</p>
      )}

      {post.media.length > 0 && (
        <p className="text-xs text-gray-400">
          {post.media.length} {t('blog.editor.media')}
        </p>
      )}

      <div className="flex flex-wrap gap-2 pt-1">
        <button type="button" className="btn-secondary text-sm" disabled={busy} onClick={onEdit}>
          {t('blog.editor.edit')}
        </button>
        <button
          type="button"
          className="btn-secondary text-sm"
          disabled={busy}
          onClick={onPublishToggle}
        >
          {isPublished ? t('blog.editor.unpublish') : t('blog.editor.publish')}
        </button>
        <button
          type="button"
          className="text-sm font-medium text-red-600 hover:text-red-700 disabled:opacity-50"
          disabled={busy}
          onClick={onDelete}
        >
          {t('blog.editor.delete')}
        </button>
      </div>
    </article>
  )
}

function PostForm({
  eventId,
  post,
  onDone,
  onCancel,
}: {
  eventId: string
  post?: EventBlogPost
  onDone: () => void
  onCancel: () => void
}) {
  const { t } = useLocale()
  const isEdit = Boolean(post)
  const [title, setTitle] = useState(post?.title ?? '')
  const [body, setBody] = useState(post?.body ?? '')
  const [media, setMedia] = useState<DraftMedia[]>((post?.media ?? []).map(toDraftMedia))
  const [linkUrl, setLinkUrl] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)

  const imageInputRef = useRef<HTMLInputElement>(null)
  const videoInputRef = useRef<HTMLInputElement>(null)

  function uploadErrorKey(code: BlogUploadException['code']): string {
    switch (code) {
      case 'image_too_large': return 'blog.editor.err_image_too_large'
      case 'video_too_large': return 'blog.editor.err_video_too_large'
      case 'video_too_long':  return 'blog.editor.err_video_too_long'
      default:                return 'blog.editor.err_upload_failed'
    }
  }

  async function handleFile(file: File, kind: 'image' | 'video') {
    setError(null)
    setUploading(true)
    try {
      const url = await uploadBlogMedia(file, kind)
      setMedia((prev) => [
        ...prev,
        { kind, url, title: null, thumbnail_url: null, caption: null },
      ])
    } catch (err) {
      if (err instanceof BlogUploadException) setError(t(uploadErrorKey(err.code)))
      else setError(t('blog.editor.err_upload_failed'))
    } finally {
      setUploading(false)
    }
  }

  function addLink() {
    const url = linkUrl.trim()
    try {
      // Validate it parses as a URL (matches the zod .url() server check).
      new URL(url)
    } catch {
      setError(t('blog.editor.err_link_required'))
      return
    }
    setError(null)
    setMedia((prev) => [
      ...prev,
      { kind: 'link', url, title: null, thumbnail_url: null, caption: null },
    ])
    setLinkUrl('')
  }

  function updateMedia(index: number, patch: Partial<DraftMedia>) {
    setMedia((prev) => prev.map((m, i) => (i === index ? { ...m, ...patch } : m)))
  }

  function removeMedia(index: number) {
    setMedia((prev) => prev.filter((_, i) => i !== index))
  }

  function move(index: number, dir: -1 | 1) {
    setMedia((prev) => {
      const next = [...prev]
      const target = index + dir
      if (target < 0 || target >= next.length) return prev
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
  }

  function buildMediaPayload(): MediaPayload[] {
    return media.map((m, i) => ({ ...m, position: i }))
  }

  async function submit(status: 'draft' | 'published') {
    if (!title.trim()) {
      setError(t('blog.editor.err_title_required'))
      return
    }
    setError(null)
    setSaving(true)
    try {
      const payload = {
        title: title.trim(),
        body: body.trim() ? body.trim() : null,
        status,
        media: buildMediaPayload(),
      }
      if (isEdit && post) {
        await clientPatchJson(`/api/events/${eventId}/blog/${post.id}`, payload)
      } else {
        await clientPostJson(`/api/events/${eventId}/blog`, payload)
      }
      onDone()
    } catch (err) {
      if (!isToastHandledError(err)) setError(t('blog.editor.err_save_failed'))
    } finally {
      setSaving(false)
    }
  }

  const disabled = saving || uploading

  return (
    <div className="card space-y-5 p-5">
      <div>
        <label className="label">{t('blog.editor.field_title')}</label>
        <input
          type="text"
          className="input"
          value={title}
          maxLength={200}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>

      <div>
        <label className="label">{t('blog.editor.field_body')}</label>
        <textarea
          rows={5}
          className="input resize-none"
          placeholder={t('blog.editor.field_body_placeholder')}
          value={body}
          maxLength={10000}
          onChange={(e) => setBody(e.target.value)}
        />
      </div>

      {/* Media */}
      <div className="space-y-3">
        <label className="label">{t('blog.editor.media')}</label>

        {media.length > 0 && (
          <ul className="space-y-2">
            {media.map((m, i) => (
              <li key={`${m.kind}-${m.url}-${i}`} className="flex items-start gap-3 rounded-xl border border-gray-100 p-3">
                <MediaThumb media={m} />
                <div className="min-w-0 flex-1 space-y-2">
                  <p className="truncate text-xs text-gray-400">{m.url}</p>
                  {m.kind === 'link' && (
                    <input
                      type="text"
                      className="input text-sm"
                      placeholder={t('blog.editor.media_title')}
                      value={m.title ?? ''}
                      maxLength={200}
                      onChange={(e) => updateMedia(i, { title: e.target.value || null })}
                    />
                  )}
                  {(m.kind === 'image' || m.kind === 'video') && (
                    <input
                      type="text"
                      className="input text-sm"
                      placeholder={t('blog.editor.media_caption')}
                      value={m.caption ?? ''}
                      maxLength={500}
                      onChange={(e) => updateMedia(i, { caption: e.target.value || null })}
                    />
                  )}
                  <div className="flex flex-wrap gap-2 text-xs">
                    <button
                      type="button"
                      className="text-gray-500 hover:text-gray-800 disabled:opacity-40"
                      disabled={i === 0}
                      onClick={() => move(i, -1)}
                    >
                      {t('blog.editor.move_up')}
                    </button>
                    <button
                      type="button"
                      className="text-gray-500 hover:text-gray-800 disabled:opacity-40"
                      disabled={i === media.length - 1}
                      onClick={() => move(i, 1)}
                    >
                      {t('blog.editor.move_down')}
                    </button>
                    <button
                      type="button"
                      className="text-red-600 hover:text-red-700"
                      onClick={() => removeMedia(i)}
                    >
                      {t('blog.editor.remove')}
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="btn-secondary text-sm"
            disabled={disabled}
            onClick={() => imageInputRef.current?.click()}
          >
            {t('blog.editor.add_image')}
          </button>
          <button
            type="button"
            className="btn-secondary text-sm"
            disabled={disabled}
            onClick={() => videoInputRef.current?.click()}
          >
            {t('blog.editor.add_video')}
          </button>
          {uploading && (
            <span className="inline-flex items-center gap-1.5 text-sm text-brand-600">
              <Spinner size="sm" /> {t('blog.editor.uploading')}
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            type="url"
            className="input flex-1 text-sm"
            placeholder={t('blog.editor.link_url_placeholder')}
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
          />
          <button type="button" className="btn-secondary text-sm" disabled={disabled} onClick={addLink}>
            {t('blog.editor.add_link')}
          </button>
        </div>

        <input
          ref={imageInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void handleFile(f, 'image')
            e.target.value = ''
          }}
        />
        <input
          ref={videoInputRef}
          type="file"
          accept="video/mp4,video/webm,video/quicktime"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void handleFile(f, 'video')
            e.target.value = ''
          }}
        />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex flex-wrap items-center gap-2 pt-1">
        {isEdit ? (
          <button type="button" className="btn-primary" disabled={disabled} onClick={() => submit(post!.status)}>
            {saving ? t('blog.editor.saving') : t('blog.editor.update')}
          </button>
        ) : (
          <>
            <button type="button" className="btn-primary" disabled={disabled} onClick={() => submit('published')}>
              {saving ? t('blog.editor.saving') : t('blog.editor.publish')}
            </button>
            <button type="button" className="btn-secondary" disabled={disabled} onClick={() => submit('draft')}>
              {t('blog.editor.save_draft')}
            </button>
          </>
        )}
        <button type="button" className="text-sm font-medium text-gray-500 hover:text-gray-800" disabled={saving} onClick={onCancel}>
          {t('blog.editor.cancel')}
        </button>
      </div>
    </div>
  )
}

function MediaThumb({ media }: { media: DraftMedia }) {
  if (media.kind === 'image') {
    return (
      <span className="h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-gray-100">
        <SafeImage src={media.url} alt="" width={64} height={64} className="h-full w-full object-cover" />
      </span>
    )
  }
  if (media.kind === 'video') {
    return (
      <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg border border-gray-100 bg-gray-900 text-white">
        ▶
      </span>
    )
  }
  return (
    <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg border border-gray-100 bg-gray-50 text-gray-400">
      🔗
    </span>
  )
}
