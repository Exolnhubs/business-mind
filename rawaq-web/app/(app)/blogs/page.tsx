'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useLocale } from '@/contexts/locale-context'
import { clientGetJson, isToastHandledError } from '@/lib/client-fetch'
import { SafeImage } from '@/components/ui/SafeImage'

type BlogCard = {
  event_id: string
  title: string
  title_ar: string | null
  cover_image_url: string | null
  city: string | null
  blog_posts_count: number
  organizer_name: string | null
  organizer_name_ar: string | null
  organizer_logo_url: string | null
  organizer_rating: number | null
}

export default function BlogsPage() {
  const { t, locale } = useLocale()
  const [cards, setCards] = useState<BlogCard[] | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let active = true
    setFailed(false)
    clientGetJson<{ data: { data: BlogCard[] } }>('/api/blogs')
      .then((res) => { if (active) setCards(res.data?.data ?? []) })
      .catch((err) => {
        if (!active) return
        if (!isToastHandledError(err)) setFailed(true)
        setCards([])
      })
    return () => { active = false }
  }, [])

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 py-10 space-y-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold text-gray-900" style={{ fontFamily: 'var(--font-display)' }}>
          {t('blogs.title')}
        </h1>
        <p className="text-gray-500">{t('blogs.subtitle')}</p>
      </header>

      {cards === null ? (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="card h-72 animate-pulse bg-gray-50" />
          ))}
        </div>
      ) : failed ? (
        <EmptyState title={t('blogs.load_failed_title')} desc={t('blogs.load_failed_desc')} />
      ) : cards.length === 0 ? (
        <EmptyState title={t('blogs.empty_title')} desc={t('blogs.empty_desc')} />
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((card) => (
            <BlogCardItem key={card.event_id} card={card} locale={locale} postsLabel={t('blogs.posts_count')} />
          ))}
        </div>
      )}
    </div>
  )
}

function BlogCardItem({ card, locale, postsLabel }: { card: BlogCard; locale: string; postsLabel: string }) {
  const title = locale === 'ar' && card.title_ar ? card.title_ar : card.title
  const orgName = locale === 'ar' && card.organizer_name_ar ? card.organizer_name_ar : card.organizer_name

  return (
    <Link
      href={`/events/${card.event_id}/blog`}
      className="card group flex flex-col overflow-hidden transition-shadow hover:shadow-lg"
    >
      <div className="relative aspect-[16/9] overflow-hidden bg-gray-100">
        {card.cover_image_url ? (
          <SafeImage
            src={card.cover_image_url}
            alt={title}
            width={640}
            height={360}
            sizes="(max-width: 768px) 100vw, 33vw"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-3xl text-gray-300">📝</div>
        )}
        <span className="absolute end-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-xs font-medium text-white">
          {postsLabel.replace('{n}', String(card.blog_posts_count))}
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <h2 className="line-clamp-2 text-base font-bold text-gray-900">{title}</h2>
        <div className="mt-auto flex items-center justify-between gap-2 text-xs text-gray-500">
          <span className="truncate">
            {orgName ?? ''}{orgName && card.city ? ' · ' : ''}{card.city ?? ''}
          </span>
          {card.organizer_rating != null && (
            <span className="flex shrink-0 items-center gap-0.5 font-semibold text-amber-600">
              ★ {card.organizer_rating.toFixed(1)}
            </span>
          )}
        </div>
      </div>
    </Link>
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
