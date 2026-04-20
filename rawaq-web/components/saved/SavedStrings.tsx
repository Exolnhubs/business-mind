'use client'

import { useLocale } from '@/contexts/locale-context'
import { EmptyState } from '@/components/ui/EmptyState'

export function SavedPageHeader({ count }: { count: number }) {
  const { t } = useLocale()
  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">{t('saved.title')}</h1>
      <p className="text-gray-500 text-sm mt-1">{t('saved.count').replace('{n}', String(count))}</p>
    </div>
  )
}

export function SavedEmptyState() {
  const { t } = useLocale()
  return (
    <EmptyState
      icon="🤍"
      title={t('saved.empty_title')}
      description={t('saved.empty_desc')}
    />
  )
}
