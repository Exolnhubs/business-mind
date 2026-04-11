'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useLocale } from '@/contexts/locale-context'

const COUNTRIES = [
  { flag: '🇸🇦', name: 'Saudi Arabia', name_ar: 'المملكة العربية السعودية' },
  { flag: '🇦🇪', name: 'UAE', name_ar: 'الإمارات' },
  { flag: '🇪🇬', name: 'Egypt', name_ar: 'مصر' },
  { flag: '🇯🇴', name: 'Jordan', name_ar: 'الأردن' },
  { flag: '🇰🇼', name: 'Kuwait', name_ar: 'الكويت' },
  { flag: '🇶🇦', name: 'Qatar', name_ar: 'قطر' },
  { flag: '🇧🇭', name: 'Bahrain', name_ar: 'البحرين' },
  { flag: '🇴🇲', name: 'Oman', name_ar: 'عُمان' },
  { flag: '🇱🇧', name: 'Lebanon', name_ar: 'لبنان' },
  { flag: '🇲🇦', name: 'Morocco', name_ar: 'المغرب' },
  { flag: '🇹🇳', name: 'Tunisia', name_ar: 'تونس' },
  { flag: '🇮🇶', name: 'Iraq', name_ar: 'العراق' },
  { flag: '🇵🇸', name: 'Palestine', name_ar: 'فلسطين' },
]

const FEATURE_KEYS = [
  { icon: '🔍', titleKey: 'about.feat_discover_title', bodyKey: 'about.feat_discover_body' },
  { icon: '🎟️', titleKey: 'about.feat_booking_title', bodyKey: 'about.feat_booking_body' },
  { icon: '🏢', titleKey: 'about.feat_organizer_title', bodyKey: 'about.feat_organizer_body' },
  { icon: '💬', titleKey: 'about.feat_chat_title', bodyKey: 'about.feat_chat_body' },
  { icon: '📍', titleKey: 'about.feat_near_title', bodyKey: 'about.feat_near_body' },
  { icon: '🌍', titleKey: 'about.feat_arab_title', bodyKey: 'about.feat_arab_body' },
]

export default function AboutPage() {
  const { t, locale } = useLocale()

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-12 space-y-16">

      {/* Hero */}
      <section className="text-center space-y-4">
        <div className="flex justify-center"><Image src="/icon.png" alt="Rawaq" width={150} height={64} /></div>
        <h1 className="text-4xl font-bold text-gray-900">{t('about.title')}</h1>
        <p className="text-xl text-gray-500 max-w-2xl mx-auto leading-relaxed">
          {t('about.hero_sub')}
        </p>
      </section>

      {/* Mission */}
      <section className="bg-brand-50 border border-brand-100 rounded-2xl p-8 space-y-3">
        <h2 className="text-2xl font-bold text-brand-800">{t('about.mission_title')}</h2>
        <p className="text-gray-700 leading-relaxed text-lg">
          {t('about.mission_body')}
        </p>
      </section>

      {/* Features */}
      <section className="space-y-6">
        <h2 className="text-2xl font-bold text-gray-900 text-center">{t('about.features_title')}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {FEATURE_KEYS.map((f) => (
            <div key={f.titleKey} className="card p-6 space-y-2 hover:shadow-md transition-shadow">
              <div className="text-3xl">{f.icon}</div>
              <h3 className="font-semibold text-gray-900">{t(f.titleKey)}</h3>
              <p className="text-sm text-gray-500 leading-relaxed">{t(f.bodyKey)}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Countries */}
      <section className="space-y-6 text-center">
        <h2 className="text-2xl font-bold text-gray-900">{t('about.countries_title')}</h2>
        <p className="text-gray-500">{t('about.countries_sub')}</p>
        <div className="flex flex-wrap justify-center gap-3">
          {COUNTRIES.map((c) => (
            <div
              key={c.name}
              className="flex items-center gap-2 bg-white border border-gray-100 rounded-full px-4 py-2 text-sm text-gray-700 shadow-sm"
            >
              <span className="text-lg">{c.flag}</span>
              <span className="font-medium">{locale === 'ar' ? c.name_ar : c.name}</span>
            </div>
          ))}
        </div>
      </section>

      {/* For attendees / organizers */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="card p-8 space-y-4">
          <div className="text-4xl">👤</div>
          <h2 className="text-xl font-bold text-gray-900">{t('about.for_attendees')}</h2>
          <ul className="space-y-2 text-sm text-gray-600">
            {(['attendee_1', 'attendee_2', 'attendee_3', 'attendee_4', 'attendee_5'] as const).map((k) => (
              <li key={k} className="flex items-start gap-2">
                <span className="text-brand-500 mt-0.5">✓</span> {t(`about.${k}`)}
              </li>
            ))}
          </ul>
          <Link href="/register" className="btn-primary inline-block mt-2 text-sm">{t('about.create_account')}</Link>
        </div>
        <div className="card p-8 space-y-4">
          <div className="text-4xl">🏢</div>
          <h2 className="text-xl font-bold text-gray-900">{t('about.for_organizers')}</h2>
          <ul className="space-y-2 text-sm text-gray-600">
            {(['organizer_1', 'organizer_2', 'organizer_3', 'organizer_4', 'organizer_5'] as const).map((k) => (
              <li key={k} className="flex items-start gap-2">
                <span className="text-brand-500 mt-0.5">✓</span> {t(`about.${k}`)}
              </li>
            ))}
          </ul>
          <Link href="/register" className="btn-secondary inline-block mt-2 text-sm">{t('about.apply_organizer')}</Link>
        </div>
      </section>

      {/* Contact */}
      <section className="text-center space-y-3 py-4 border-t border-gray-100">
        <h2 className="text-lg font-semibold text-gray-900">{t('about.contact_title')}</h2>
        <p className="text-sm text-gray-500">{t('about.contact_sub')}</p>
        <p className="text-sm text-brand-600 font-medium">hello@rawaq.app</p>
        <div className="flex justify-center gap-4 text-sm text-gray-400 pt-2">
          <Link href="/terms" className="hover:text-gray-600">{t('footer.terms')}</Link>
          <span>·</span>
          <Link href="/privacy" className="hover:text-gray-600">{t('footer.privacy')}</Link>
        </div>
      </section>

    </div>
  )
}
