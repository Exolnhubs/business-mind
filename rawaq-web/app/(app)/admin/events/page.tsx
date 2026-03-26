import type { Metadata } from 'next'
import Link from 'next/link'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { Badge } from '@/components/ui/Badge'
import { formatDate } from '@/lib/utils'

export const metadata: Metadata = { title: 'All Events' }

type AdminEventRow = {
  id: string
  title: string
  city: string
  start_at: string
  is_published: boolean
  is_cancelled: boolean
  bookings_count: number
  organizer: { display_name: string } | null
}

export default async function AdminEventsPage() {
  const supabase = await createSupabaseServerClient()

  const { data } = await supabase
    .from('events')
    .select(`
      id, title, city, start_at, is_published, is_cancelled, bookings_count,
      organizer:profiles!organizer_id(display_name)
    `)
    .order('created_at', { ascending: false })
    .limit(50)

  const events = (data ?? []) as AdminEventRow[]

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-gray-900">All Events ({events.length})</h2>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Title</th>
              <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden sm:table-cell">Organizer</th>
              <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden md:table-cell">Date</th>
              <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {events.map((event) => (
              <tr key={event.id} className="hover:bg-gray-50/50">
                <td className="px-4 py-3 font-medium text-gray-900 max-w-[180px] truncate">{event.title}</td>
                <td className="px-4 py-3 text-gray-500 hidden sm:table-cell text-xs">
                  {(event.organizer as { display_name: string } | null)?.display_name ?? '—'}
                </td>
                <td className="px-4 py-3 text-gray-500 hidden md:table-cell text-xs">{formatDate(event.start_at)}</td>
                <td className="px-4 py-3">
                  <Badge variant={event.is_cancelled ? 'red' : event.is_published ? 'green' : 'gray'}>
                    {event.is_cancelled ? 'Cancelled' : event.is_published ? 'Live' : 'Draft'}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-end">
                  <Link href={`/events/${event.id}`} className="text-xs text-brand-600 hover:underline">View</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
