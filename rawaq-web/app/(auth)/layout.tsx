import Link from 'next/link'
import Image from 'next/image'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-50 via-white to-amber-50 flex flex-col">
      <header className="px-6 py-4">
        <Link href="/" className="flex items-center gap-2 text-brand-600 font-bold text-xl w-fit">
          <Image src="/icon.png" alt="" width={24} height={24} className="block" /> Rawaq
        </Link>
      </header>

      <main className="flex-1 flex items-center justify-center p-4">
        {children}
      </main>

      <footer className="py-4 text-center text-xs text-gray-400">
        © {new Date().getFullYear()} Rawaq
      </footer>
    </div>
  )
}
