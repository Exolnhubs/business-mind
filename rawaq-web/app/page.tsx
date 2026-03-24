import Link from 'next/link'
import { Navbar } from '@/components/layout/Navbar'
import { Footer } from '@/components/layout/Footer'

const CATEGORIES = [
  { icon: '🏋️', label: 'Sports & Fitness' },
  { icon: '🎨', label: 'Arts & Culture' },
  { icon: '🍽️', label: 'Food & Drinks' },
  { icon: '💼', label: 'Business' },
  { icon: '🎵', label: 'Music' },
  { icon: '📚', label: 'Education' },
  { icon: '👨‍👩‍👧', label: 'Family' },
  { icon: '🏕️', label: 'Outdoor' },
  { icon: '💻', label: 'Technology' },
  { icon: '🧘', label: 'Wellness' },
]

const COUNTRIES = [
  '🇸🇦 Saudi Arabia', '🇦🇪 UAE', '🇪🇬 Egypt', '🇯🇴 Jordan',
  '🇰🇼 Kuwait', '🇶🇦 Qatar', '🇧🇭 Bahrain', '🇴🇲 Oman',
  '🇱🇧 Lebanon', '🇲🇦 Morocco', '🇹🇳 Tunisia', '🇮🇶 Iraq', '🇵🇸 Palestine',
]

const HOW_IT_WORKS = [
  { step: '01', icon: '🔍', title: 'Discover', body: "Browse events by category, city, date, or what's near you — in Arabic or English." },
  { step: '02', icon: '🎟️', title: 'Book',     body: 'Reserve your spot in seconds. Manage all your bookings in one dashboard.' },
  { step: '03', icon: '🙌', title: 'Attend',   body: 'Show up, meet people, and engage with the event community through chat and comments.' },
]

export default function LandingPage() {
  return (
    <div className="flex flex-col min-h-screen">
      <Navbar />

      <main className="flex-1">

        {/* ── Hero ─────────────────────────────────────────────── */}
        <section className="bg-gradient-to-b from-brand-50 to-white py-20 sm:py-28 px-4">
          <div className="max-w-4xl mx-auto text-center space-y-6">
            <div className="inline-flex items-center gap-2 bg-brand-100 text-brand-700 text-sm font-medium px-4 py-1.5 rounded-full">
              🌍 13 Arab countries &amp; growing
            </div>
            <h1 className="text-4xl sm:text-6xl font-bold text-gray-900 leading-tight">
              Discover events<br />
              <span className="text-brand-500">across the Arab world</span>
            </h1>
            <p className="text-lg sm:text-xl text-gray-500 max-w-2xl mx-auto leading-relaxed">
              Rawaq connects communities through sport, culture, business, and entertainment —
              in Arabic and English, from Riyadh to Marrakech.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
              <Link href="/events" className="btn-primary px-8 py-3 text-base">
                Browse Events →
              </Link>
              <Link href="/register" className="btn-secondary px-8 py-3 text-base">
                Create Free Account
              </Link>
            </div>
          </div>
        </section>

        {/* ── Countries strip ──────────────────────────────────── */}
        <section className="border-y border-gray-100 bg-white py-5">
          <div className="flex gap-4 whitespace-nowrap px-6 flex-wrap justify-center">
            {COUNTRIES.map((c) => (
              <span key={c} className="text-sm text-gray-500 font-medium">{c}</span>
            ))}
          </div>
        </section>

        {/* ── Categories ───────────────────────────────────────── */}
        <section className="max-w-5xl mx-auto px-4 sm:px-6 py-16 space-y-8 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900">Every interest covered</h2>
          <div className="flex flex-wrap justify-center gap-3">
            {CATEGORIES.map((c) => (
              <Link
                key={c.label}
                href="/events"
                className="flex items-center gap-2 bg-white border border-gray-200 rounded-full px-5 py-2.5 text-sm font-medium text-gray-700 hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700 transition-colors shadow-sm"
              >
                <span>{c.icon}</span> {c.label}
              </Link>
            ))}
          </div>
        </section>

        {/* ── How it works ─────────────────────────────────────── */}
        <section className="bg-gray-50 py-16 px-4">
          <div className="max-w-5xl mx-auto space-y-10">
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 text-center">How Rawaq works</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              {HOW_IT_WORKS.map((h) => (
                <div key={h.step} className="card p-7 space-y-3 text-center">
                  <div className="text-4xl">{h.icon}</div>
                  <div className="text-xs font-bold text-brand-400 tracking-widest uppercase">Step {h.step}</div>
                  <h3 className="text-lg font-bold text-gray-900">{h.title}</h3>
                  <p className="text-sm text-gray-500 leading-relaxed">{h.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Organizers CTA ───────────────────────────────────── */}
        <section className="max-w-5xl mx-auto px-4 sm:px-6 py-16">
          <div className="bg-gradient-to-r from-brand-500 to-brand-600 rounded-3xl p-8 sm:p-12 text-white text-center space-y-5">
            <div className="text-5xl">🏢</div>
            <h2 className="text-2xl sm:text-3xl font-bold">Organise your next event on Rawaq</h2>
            <p className="text-brand-100 max-w-xl mx-auto">
              Publish bilingual events, manage bookings, track attendance, and grow your audience
              across the Arab world — all from one dashboard.
            </p>
            <Link
              href="/register"
              className="inline-block bg-white text-brand-600 font-semibold px-8 py-3 rounded-xl hover:bg-brand-50 transition-colors text-sm"
            >
              Apply as Organiser →
            </Link>
          </div>
        </section>

        {/* ── Final CTA ────────────────────────────────────────── */}
        <section className="text-center py-16 px-4 space-y-5">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900">Ready to explore?</h2>
          <p className="text-gray-500 max-w-md mx-auto">
            Join thousands of people discovering events in their cities today.
          </p>
          <Link href="/events" className="btn-primary px-8 py-3 text-base inline-block">
            See All Events
          </Link>
        </section>

      </main>

      <Footer />
    </div>
  )
}
