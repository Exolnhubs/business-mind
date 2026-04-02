'use client'

import { useLocale } from '@/contexts/locale-context'

export function EventsPageHero({ activeFilterCount }: { activeFilterCount: number }) {
  const { t } = useLocale()

  return (
    <>
      <section className="relative overflow-hidden rounded-[2rem] border border-brand-100 bg-gradient-to-br from-brand-50 via-white to-amber-100/70 px-5 py-8 sm:px-8 sm:py-10">
        <div className="pointer-events-none absolute -top-16 left-0 h-40 w-40 rounded-full bg-brand-200/60 blur-3xl animate-float-slow" />
        <div className="pointer-events-none absolute right-0 top-8 h-56 w-56 rounded-full bg-orange-200/40 blur-3xl animate-float-slower" />
        <div className="pointer-events-none absolute bottom-0 left-1/3 h-28 w-28 rounded-full bg-white/70 blur-2xl" />

        <div className="relative grid gap-6 lg:grid-cols-[1.35fr_0.9fr] lg:items-end">
          <div className="space-y-5 animate-hero-in">
            <span className="inline-flex w-fit items-center gap-2 rounded-full border border-brand-200 bg-white/80 px-3 py-1 text-xs font-semibold uppercase tracking-[0.25em] text-brand-700 shadow-sm">
              {t('events.hero.badge')}
            </span>
            <div className="space-y-3">
              <h1 className="max-w-2xl text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
                {t('events.hero.title')}
              </h1>
              <p className="max-w-2xl text-sm leading-6 text-gray-600 sm:text-base">
                {t('events.hero.subtitle')}
              </p>
            </div>

            <div className="flex flex-wrap gap-2 text-sm">
              <span className="animate-badge-pop rounded-full border border-white/80 bg-white/85 px-3 py-2 font-medium text-gray-700 shadow-sm">
                {t('events.hero.chip.music')}
              </span>
              <span className="animate-badge-pop reveal-delay-1 rounded-full border border-white/80 bg-white/85 px-3 py-2 font-medium text-gray-700 shadow-sm">
                {t('events.hero.chip.workshops')}
              </span>
              <span className="animate-badge-pop reveal-delay-2 rounded-full border border-white/80 bg-white/85 px-3 py-2 font-medium text-gray-700 shadow-sm">
                {t('events.hero.chip.nearby')}
              </span>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
            <div className="rounded-3xl border border-white/70 bg-white/80 p-4 shadow-sm backdrop-blur">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gray-400">{t('events.hero.stat.search_mode')}</p>
              <p className="mt-2 text-2xl font-bold text-gray-900">{activeFilterCount}</p>
              <p className="mt-1 text-sm text-gray-500">{t('events.hero.stat.search_mode_sub')}</p>
            </div>
            <div className="rounded-3xl border border-white/70 bg-gray-900 p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gray-400">{t('events.hero.stat.weekend_pulse')}</p>
              <p className="mt-2 text-2xl font-bold text-white">{t('events.hero.stat.live')}</p>
              <p className="mt-1 text-sm text-gray-300">{t('events.hero.stat.weekend_pulse_sub')}</p>
            </div>
            <div className="rounded-3xl border border-white/70 bg-white/80 p-4 shadow-sm backdrop-blur">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gray-400">{t('events.hero.stat.best_use')}</p>
              <p className="mt-2 text-lg font-bold text-gray-900">{t('events.hero.stat.best_use_title')}</p>
              <p className="mt-1 text-sm text-gray-500">{t('events.hero.stat.best_use_sub')}</p>
            </div>
          </div>
        </div>
      </section>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-gray-900 sm:text-2xl">{t('events.filters.heading')}</h2>
            <p className="text-sm text-gray-500">{t('events.filters.subheading')}</p>
          </div>
          {activeFilterCount > 0 && (
            <div className="inline-flex items-center gap-2 rounded-full border border-brand-200 bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700">
              <span className="h-2 w-2 rounded-full bg-brand-500" />
              {t('events.filters.active_count').replace('{n}', String(activeFilterCount))}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
