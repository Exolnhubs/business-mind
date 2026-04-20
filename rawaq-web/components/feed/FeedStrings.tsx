'use client'

import Link from 'next/link'
import { useLocale } from '@/contexts/locale-context'
import { EmptyState } from '@/components/ui/EmptyState'

export function FeedPageHeader() {
  const { t } = useLocale()
  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">{t('feed.title')}</h1>
      <p className="text-sm text-gray-500 mt-0.5">{t('feed.subtitle')}</p>
    </div>
  )
}

export function FeedEmptyNoFollows() {
  const { t } = useLocale()
  return (
    <EmptyState
      icon="👥"
      title={t('feed.empty_no_follows_title')}
      description={t('feed.empty_no_follows_desc')}
      action={<Link href="/events" className="btn-primary mt-4 inline-flex">{t('feed.browse_events')}</Link>}
    />
  )
}

export function FeedEmptyNoEvents() {
  const { t } = useLocale()
  return (
    <EmptyState
      icon="📭"
      title={t('feed.empty_title')}
      description={t('feed.empty_desc')}
    />
  )
}

export function FeedFollowingLabel({ follows, total }: { follows: { id: string; name: string; href: string }[]; total: number }) {
  const { t } = useLocale()
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-xs text-gray-400">{t('feed.following_label')}</span>
      {follows.map((f) => (
        <Link
          key={f.id}
          href={f.href}
          className="text-xs bg-brand-50 text-brand-700 border border-brand-100 px-2.5 py-1 rounded-full hover:bg-brand-100 transition-colors"
        >
          {f.name}
        </Link>
      ))}
      {total > follows.length && (
        <span className="text-xs text-gray-400">{t('feed.more').replace('{n}', String(total - follows.length))}</span>
      )}
    </div>
  )
}

export function FeedPagination({ page, totalPages }: { page: number; totalPages: number }) {
  const { t } = useLocale()
  return (
    <div className="flex items-center justify-center gap-2 pt-4">
      {page > 1 && (
        <Link href={`/feed?page=${page - 1}`} className="btn-secondary text-sm">{t('feed.prev')}</Link>
      )}
      <span className="text-sm text-gray-400">
        {t('feed.page_of').replace('{page}', String(page)).replace('{total}', String(totalPages))}
      </span>
      {page < totalPages && (
        <Link href={`/feed?page=${page + 1}`} className="btn-secondary text-sm">{t('feed.next')}</Link>
      )}
    </div>
  )
}
