'use client'

import { EmptyState } from '@/components/ui/EmptyState'
import { useLocale } from '@/contexts/locale-context'

export function EventsGridEmpty({ nearby = false }: { nearby?: boolean }) {
  const { t } = useLocale()

  if (nearby) {
    return (
      <EmptyState
        icon="📍"
        title={t('events.grid.no_nearby')}
        description={t('events.grid.no_nearby_sub')}
      />
    )
  }

  return <EmptyState icon="💭" title={t('events.empty')} description={t('events.empty_sub')} />
}

export function EventsGridError({ message }: { message: string }) {
  const { t } = useLocale()

  return (
    <div className="text-center py-16 text-red-500 text-sm">
      {t('events.grid.error_prefix')} {message}
    </div>
  )
}

export function EventsGridPagination({
  page,
  totalPages,
  count,
  previousHref,
  nextHref,
}: {
  page: number
  totalPages: number
  count: number
  previousHref: string
  nextHref: string
}) {
  const { t } = useLocale()

  return (
    <div className="flex items-center justify-center gap-2 pt-2">
      <a
        href={previousHref}
        aria-disabled={page <= 1}
        className={`px-4 py-2 text-sm rounded-xl border font-medium transition-colors ${
          page <= 1
            ? 'pointer-events-none border-gray-100 text-gray-300 bg-white'
            : 'border-gray-200 text-gray-700 bg-white hover:bg-gray-50'
        }`}
      >
        {t('events.pagination.previous')}
      </a>

      <span className="text-sm text-gray-500 px-2">
        {t('events.pagination.page_of')
          .replace('{page}', String(page))
          .replace('{total}', String(totalPages))}
        <span className="text-gray-400 ml-1">
          {t('events.pagination.events_count').replace('{count}', String(count))}
        </span>
      </span>

      <a
        href={nextHref}
        aria-disabled={page >= totalPages}
        className={`px-4 py-2 text-sm rounded-xl border font-medium transition-colors ${
          page >= totalPages
            ? 'pointer-events-none border-gray-100 text-gray-300 bg-white'
            : 'border-gray-200 text-gray-700 bg-white hover:bg-gray-50'
        }`}
      >
        {t('events.pagination.next')}
      </a>
    </div>
  )
}
