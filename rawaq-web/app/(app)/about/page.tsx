import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'About Rawaq',
  description: 'Learn about Rawaq — the events discovery platform connecting communities across the Arab world.',
}

const COUNTRIES = [
  { flag: '🇸🇦', name: 'Saudi Arabia', name_ar: 'المملكة العربية السعودية' },
  { flag: '🇦🇪', name: 'UAE',          name_ar: 'الإمارات'                  },
  { flag: '🇪🇬', name: 'Egypt',        name_ar: 'مصر'                       },
  { flag: '🇯🇴', name: 'Jordan',       name_ar: 'الأردن'                    },
  { flag: '🇰🇼', name: 'Kuwait',       name_ar: 'الكويت'                    },
  { flag: '🇶🇦', name: 'Qatar',        name_ar: 'قطر'                       },
  { flag: '🇧🇭', name: 'Bahrain',      name_ar: 'البحرين'                   },
  { flag: '🇴🇲', name: 'Oman',         name_ar: 'عُمان'                     },
  { flag: '🇱🇧', name: 'Lebanon',      name_ar: 'لبنان'                     },
  { flag: '🇲🇦', name: 'Morocco',      name_ar: 'المغرب'                    },
  { flag: '🇹🇳', name: 'Tunisia',      name_ar: 'تونس'                      },
  { flag: '🇮🇶', name: 'Iraq',         name_ar: 'العراق'                    },
  { flag: '🇵🇸', name: 'Palestine',    name_ar: 'فلسطين'                    },
]

const FEATURES = [
  {
    icon: '🔍',
    title: 'Discover Events',
    body: 'Browse thousands of events by category, city, date, or proximity — in Arabic and English.',
  },
  {
    icon: '🎟️',
    title: 'Instant Booking',
    body: 'Reserve your spot in seconds. All bookings are managed in one place.',
  },
  {
    icon: '🏢',
    title: 'Organizer Tools',
    body: 'Publish events, manage capacity, track bookings, and receive tips from attendees.',
  },
  {
    icon: '💬',
    title: 'Community Chat',
    body: 'Connect with other attendees and organizers through real-time event comments and global chat.',
  },
  {
    icon: '📍',
    title: 'Near Me',
    body: 'Find events happening around you using built-in location search on web and mobile.',
  },
  {
    icon: '🌍',
    title: 'Pan-Arab Reach',
    body: 'From Riyadh to Marrakech, Rawaq connects communities across 13 Arab countries.',
  },
]

export default function AboutPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-12 space-y-16">

      {/* Hero */}
      <section className="text-center space-y-4">
        <div className="text-6xl">🪄</div>
        <h1 className="text-4xl font-bold text-gray-900">About Rawaq</h1>
        <p className="text-xl text-gray-500 max-w-2xl mx-auto leading-relaxed">
          Rawaq (رواق) is the Arab world&apos;s events discovery platform — built to connect people
          with the cultural, sports, business, and entertainment events happening in their cities.
        </p>
      </section>

      {/* Mission */}
      <section className="bg-brand-50 border border-brand-100 rounded-2xl p-8 space-y-3">
        <h2 className="text-2xl font-bold text-brand-800">Our Mission</h2>
        <p className="text-gray-700 leading-relaxed text-lg">
          We believe every community deserves a vibrant events scene. Rawaq makes it effortless
          for anyone to discover local happenings, for organizers to reach their audience, and for
          people to build real connections — all in a platform designed for the Arab world, in both
          Arabic and English.
        </p>
      </section>

      {/* Features */}
      <section className="space-y-6">
        <h2 className="text-2xl font-bold text-gray-900 text-center">What Rawaq Offers</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {FEATURES.map((f) => (
            <div key={f.title} className="card p-6 space-y-2 hover:shadow-md transition-shadow">
              <div className="text-3xl">{f.icon}</div>
              <h3 className="font-semibold text-gray-900">{f.title}</h3>
              <p className="text-sm text-gray-500 leading-relaxed">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Countries */}
      <section className="space-y-6 text-center">
        <h2 className="text-2xl font-bold text-gray-900">Across the Arab World</h2>
        <p className="text-gray-500">Events from 13 countries and growing.</p>
        <div className="flex flex-wrap justify-center gap-3">
          {COUNTRIES.map((c) => (
            <div
              key={c.name}
              className="flex items-center gap-2 bg-white border border-gray-100 rounded-full px-4 py-2 text-sm text-gray-700 shadow-sm"
            >
              <span className="text-lg">{c.flag}</span>
              <span className="font-medium">{c.name}</span>
              <span className="text-gray-400 text-xs">{c.name_ar}</span>
            </div>
          ))}
        </div>
      </section>

      {/* For organizers */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="card p-8 space-y-4">
          <div className="text-4xl">👤</div>
          <h2 className="text-xl font-bold text-gray-900">For Attendees</h2>
          <ul className="space-y-2 text-sm text-gray-600">
            <li className="flex items-start gap-2"><span className="text-brand-500 mt-0.5">✓</span> Browse free &amp; paid events</li>
            <li className="flex items-start gap-2"><span className="text-brand-500 mt-0.5">✓</span> Filter by category, city, and language</li>
            <li className="flex items-start gap-2"><span className="text-brand-500 mt-0.5">✓</span> Book instantly, manage reservations</li>
            <li className="flex items-start gap-2"><span className="text-brand-500 mt-0.5">✓</span> Save favourite events</li>
            <li className="flex items-start gap-2"><span className="text-brand-500 mt-0.5">✓</span> Comment and connect with the community</li>
          </ul>
          <Link href="/register" className="btn-primary inline-block mt-2 text-sm">Create Free Account</Link>
        </div>
        <div className="card p-8 space-y-4">
          <div className="text-4xl">🏢</div>
          <h2 className="text-xl font-bold text-gray-900">For Organizers</h2>
          <ul className="space-y-2 text-sm text-gray-600">
            <li className="flex items-start gap-2"><span className="text-brand-500 mt-0.5">✓</span> Publish events in Arabic and English</li>
            <li className="flex items-start gap-2"><span className="text-brand-500 mt-0.5">✓</span> Manage capacity and bookings</li>
            <li className="flex items-start gap-2"><span className="text-brand-500 mt-0.5">✓</span> Gender &amp; family-friendly restrictions</li>
            <li className="flex items-start gap-2"><span className="text-brand-500 mt-0.5">✓</span> Receive tips from attendees</li>
            <li className="flex items-start gap-2"><span className="text-brand-500 mt-0.5">✓</span> Analytics and attendee management</li>
          </ul>
          <Link href="/register" className="btn-secondary inline-block mt-2 text-sm">Apply as Organizer</Link>
        </div>
      </section>

      {/* Contact */}
      <section className="text-center space-y-3 py-4 border-t border-gray-100">
        <h2 className="text-lg font-semibold text-gray-900">Get in Touch</h2>
        <p className="text-sm text-gray-500">
          Questions, feedback, or partnership enquiries — we&apos;d love to hear from you.
        </p>
        <p className="text-sm text-brand-600 font-medium">hello@rawaq.app</p>
        <div className="flex justify-center gap-4 text-sm text-gray-400 pt-2">
          <Link href="/terms" className="hover:text-gray-600">Terms of Service</Link>
          <span>·</span>
          <Link href="/privacy" className="hover:text-gray-600">Privacy Policy</Link>
        </div>
      </section>

    </div>
  )
}
