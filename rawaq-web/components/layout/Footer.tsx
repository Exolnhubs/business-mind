import Link from 'next/link'

export function Footer() {
  return (
    <footer className="mt-auto border-t border-gray-100 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-brand-600 font-bold">
          <span>🪄</span> Rawaq
        </div>
        <p className="text-xs text-gray-400">© {new Date().getFullYear()} Rawaq. All rights reserved.</p>
        <div className="flex items-center gap-4 text-xs text-gray-400">
          <Link href="/events" className="hover:text-gray-600">Events</Link>
          <Link href="/about" className="hover:text-gray-600">About</Link>
        </div>
      </div>
    </footer>
  )
}
