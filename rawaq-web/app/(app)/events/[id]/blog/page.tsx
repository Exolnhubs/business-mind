'use client'

import { use, useEffect, useState } from 'react'
import Link from 'next/link'
import { useLocale } from '@/contexts/locale-context'
import { clientGetJson, isToastHandledError } from '@/lib/client-fetch'
import { SafeImage } from '@/components/ui/SafeImage'
import { formatDate } from '@/lib/utils'
import type { EventBlogPost, EventBlogMedia } from '@/types/database'

export default function EventBlogPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { t } = useLocale()
  const [posts, setPosts] = useState<EventBlogPost[] | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let active = true
    setFailed(false)
    clientGetJson<{ data: EventBlogPost[] }>(`/api/events/${id}/blog`)
      .then((res) => { if (active) setPosts(res.data ?? []) })
      .catch((err) => {
        if (!active) return
        if (!isToastHandledError(err)) setFailed(true)
        setPosts([])
      })
    return () => { active = false }
  }, [id])

  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 py-10 space-y-8">
      <header className="space-y-2">
        <Link
          href={`/events/${id}`}
          className="inline-block text-sm font-medium text-brand-600 hover:text-brand-700"
        >
          {t('blog.back_to_event')}
        </Link>
        <h1 className="text-3xl font-bold text-gray-900" style={{ fontFamily: 'var(--font-display)' }}>
          {t('blog.title')}
        </h1>
        <p className="text-gray-500">{t('blog.subtitle')}</p>
      </header>

      {posts === null ? (
        <div className="space-y-4" aria-busy="true">
          {[0, 1].map((i) => (
            <div key={i} className="card p-6 space-y-3">
              <div className="h-5 w-1/2 animate-pulse rounded bg-gray-100" />
              <div className="h-4 w-full animate-pulse rounded bg-gray-100" />
              <div className="h-40 w-full animate-pulse rounded-xl bg-gray-100" />
            </div>
          ))}
        </div>
      ) : failed ? (
        <EmptyState title={t('blog.load_failed_title')} desc={t('blog.load_failed_desc')} />
      ) : posts.length === 0 ? (
        <EmptyState title={t('blog.empty_title')} desc={t('blog.empty_desc')} />
      ) : (
        <div className="space-y-6">
          {posts.map((post) => (
            <BlogPostCard key={post.id} post={post} />
          ))}
        </div>
      )}
    </div>
  )
}

function BlogPostCard({ post }: { post: EventBlogPost }) {
  return (
    <article className="card p-6 space-y-4">
      <div className="space-y-1">
        <h2 className="text-xl font-bold text-gray-900">{post.title}</h2>
        {post.published_at && (
          <p className="text-xs text-gray-400">{formatDate(post.published_at)}</p>
        )}
      </div>

      {post.body && (
        <p className="whitespace-pre-line text-sm leading-relaxed text-gray-700">{post.body}</p>
      )}

      {post.media.length > 0 && (
        <div className="space-y-3">
          {post.media.map((media) => (
            <MediaItem key={media.id} media={media} />
          ))}
        </div>
      )}
    </article>
  )
}

function MediaItem({ media }: { media: EventBlogMedia }) {
  const { t } = useLocale()
  const alt = media.title ?? media.caption ?? ''

  if (media.kind === 'image') {
    return (
      <figure className="space-y-1.5">
        <div className="overflow-hidden rounded-xl border border-gray-100">
          <SafeImage
            src={media.url}
            alt={alt}
            width={768}
            height={512}
            sizes="(max-width: 768px) 100vw, 768px"
            className="h-auto w-full object-cover"
          />
        </div>
        {media.caption && <figcaption className="text-xs text-gray-500">{media.caption}</figcaption>}
      </figure>
    )
  }

  if (media.kind === 'video') {
    return (
      <figure className="space-y-1.5">
        <video
          src={media.url}
          poster={media.thumbnail_url ?? undefined}
          controls
          preload="metadata"
          className="w-full rounded-xl border border-gray-100 bg-black"
        >
          <track kind="captions" />
        </video>
        {media.caption && <figcaption className="text-xs text-gray-500">{media.caption}</figcaption>}
      </figure>
    )
  }

  // link
  return (
    <a
      href={media.url}
      target="_blank"
      rel="noreferrer noopener"
      className="flex items-center gap-4 rounded-xl border border-gray-100 p-3 transition-colors hover:bg-brand-50"
    >
      {media.thumbnail_url && (
        <span className="h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-gray-100">
          <SafeImage
            src={media.thumbnail_url}
            alt=""
            width={64}
            height={64}
            className="h-full w-full object-cover"
          />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-gray-900">
          {media.title ?? media.url}
        </span>
        <span className="block truncate text-xs text-gray-400">{media.url}</span>
        <span className="mt-0.5 block text-xs font-medium text-brand-600">{t('blog.open_link')}</span>
      </span>
    </a>
  )
}

function EmptyState({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="card flex flex-col items-center gap-2 px-6 py-16 text-center">
      <div
        className="mb-2 flex h-14 w-14 items-center justify-center rounded-2xl"
        style={{ background: 'oklch(0.78 0.18 72 / 0.08)', color: 'var(--c-gold-dim)' }}
      >
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden>
          <rect x="4" y="4" width="16" height="16" rx="3" stroke="currentColor" strokeWidth="1.6" />
          <path d="M8 9h8M8 12.5h8M8 16h5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </div>
      <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
      <p className="max-w-sm text-sm text-gray-500">{desc}</p>
    </div>
  )
}
