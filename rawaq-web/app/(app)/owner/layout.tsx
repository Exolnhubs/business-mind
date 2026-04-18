import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createSupabaseServerClient } from '@/lib/supabase/server'

const NAV = [
  { href: '/owner',          label: '👑 Overview',          exact: true },
  { href: '/owner/plans',    label: '💎 Plan Catalog' },
  { href: '/owner/settings', label: '⚙️ Platform Settings' },
]

export default async function OwnerLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if ((profile as { role: string } | null)?.role !== 'owner') redirect('/events')

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex items-center gap-2 mb-6">
        <span className="text-2xl">👑</span>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Owner Panel</h1>
          <p className="text-xs text-gray-400 mt-0.5">Platform control center</p>
        </div>
      </div>

      {/* Mobile scrollable nav */}
      <div className="sm:hidden mb-4">
        <div className="flex gap-2 overflow-x-auto pb-2">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100"
            >
              {item.label}
            </Link>
          ))}
        </div>
      </div>

      <div className="flex gap-8">
        {/* Sidebar — desktop */}
        <nav className="w-52 shrink-0 hidden sm:block">
          <ul className="space-y-1">
            {NAV.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-amber-50 hover:text-amber-900 transition-colors"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>

          <div className="mt-8 pt-4 border-t border-gray-100">
            <Link
              href="/admin"
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-gray-400 hover:text-gray-600 transition-colors"
            >
              🛡️ Admin Panel
            </Link>
          </div>
        </nav>

        {/* Content */}
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    </div>
  )
}
