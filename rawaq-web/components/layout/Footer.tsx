import Link from 'next/link'

export function Footer() {
  return (
    <footer className="mt-auto border-t border-gray-100 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 mb-8">
          {/* Brand */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-brand-600 font-bold text-lg">
              <span>🪄</span> Rawaq
            </div>
            <p className="text-xs text-gray-400 leading-relaxed max-w-xs">
              Your gateway to events across the Arab world — in Arabic and English.
            </p>
          </div>

          {/* Platform */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-gray-700 uppercase tracking-wider">Platform</p>
            <div className="flex flex-col gap-1.5 text-sm text-gray-500">
              <Link href="/events" className="hover:text-gray-800 transition-colors">Browse Events</Link>
              <Link href="/register" className="hover:text-gray-800 transition-colors">Sign Up Free</Link>
              <Link href="/login" className="hover:text-gray-800 transition-colors">Sign In</Link>
            </div>
          </div>

          {/* Company */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-gray-700 uppercase tracking-wider">Company</p>
            <div className="flex flex-col gap-1.5 text-sm text-gray-500">
              <Link href="/about" className="hover:text-gray-800 transition-colors">About Rawaq</Link>
              <Link href="/terms" className="hover:text-gray-800 transition-colors">Terms of Service</Link>
              <Link href="/privacy" className="hover:text-gray-800 transition-colors">Privacy Policy</Link>
              <a href="mailto:hello@rawaq.app" className="hover:text-gray-800 transition-colors">Contact Us</a>
            </div>
          </div>
        </div>

        <div className="border-t border-gray-100 pt-6 flex flex-col sm:flex-row items-center justify-between gap-2">
          <p className="text-xs text-gray-400">© {new Date().getFullYear()} Rawaq. All rights reserved.</p>
          <p className="text-xs text-gray-400">🌍 Connecting communities across the Arab world</p>
        </div>
      </div>
    </footer>
  )
}

