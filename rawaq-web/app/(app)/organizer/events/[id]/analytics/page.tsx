import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import Link from 'next/link'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { formatDate, formatCurrency } from '@/lib/utils'

export const metadata: Metadata = { title: 'Event Analytics' }
export const dynamic = 'force-dynamic'

export default async function EventAnalyticsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createSupabaseServerClient()
  const admin    = createSupabaseAdminClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) notFound()

  const { data: event } = await supabase
    .from('events')
    .select('id, title, start_at, capacity, organizer_id, is_published, is_cancelled')
    .eq('id', id)
    .single()

  if (!event || event.organizer_id !== user.id) notFound()

  // Fetch confirmed bookings + ticket types
  const { data: bookings } = await admin
    .from('bookings')
    .select('id, created_at, scanned_at, ticket_type_id, platform_fee_amount')
    .eq('event_id', id)
    .eq('status', 'confirmed')

  const ticketTypeIds = [...new Set((bookings ?? []).map((b) => b.ticket_type_id).filter(Boolean))]
  const ticketPriceMap: Record<string, { price: number; is_free: boolean; name: string }> = {}
  if (ticketTypeIds.length > 0) {
    const { data: ttRows } = await admin
      .from('ticket_types')
      .select('id, price, is_free, name')
      .in('id', ticketTypeIds as string[])
    for (const tt of ttRows ?? []) {
      ticketPriceMap[tt.id] = { price: tt.price, is_free: tt.is_free, name: tt.name }
    }
  }

  const confirmed = bookings ?? []

  // Daily timeline
  const dailyMap: Record<string, number> = {}
  for (const b of confirmed) {
    const day = b.created_at.slice(0, 10)
    dailyMap[day] = (dailyMap[day] ?? 0) + 1
  }
  const daily_timeline = Object.entries(dailyMap)
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date))

  // Revenue
  let gross_revenue = 0
  let platform_fees = 0
  for (const b of confirmed) {
    const tt = b.ticket_type_id ? ticketPriceMap[b.ticket_type_id] : null
    if (tt && !tt.is_free) gross_revenue += tt.price
    platform_fees += (b.platform_fee_amount as number | null) ?? 0
  }
  const net_revenue = gross_revenue - platform_fees

  // Ticket type breakdown
  const ticketBreakdown: Record<string, { name: string; count: number; is_free: boolean }> = {}
  for (const b of confirmed) {
    const key = b.ticket_type_id ?? 'unknown'
    if (!ticketBreakdown[key]) {
      ticketBreakdown[key] = {
        name: ticketPriceMap[key]?.name ?? 'Unknown',
        count: 0,
        is_free: ticketPriceMap[key]?.is_free ?? false,
      }
    }
    ticketBreakdown[key].count++
  }

  const scanned_count = confirmed.filter((b) => b.scanned_at).length
  const attendance_rate = confirmed.length > 0 ? Math.round((scanned_count / confirmed.length) * 100) : 0
  const fill_rate = event.capacity ? Math.round((confirmed.length / event.capacity) * 100) : null
  const maxDay = daily_timeline.reduce((m, d) => Math.max(m, d.count), 0)

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-8">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Link href="/organizer" className="hover:underline">Dashboard</Link>
        <span>›</span>
        <span className="text-gray-900 font-medium truncate">{event.title}</span>
        <span>›</span>
        <span>Analytics</span>
      </div>

      <h1 className="text-2xl font-bold text-gray-900">Event Analytics</h1>

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Confirmed', value: confirmed.length, icon: '🎟️', sub: event.capacity ? `of ${event.capacity} capacity` : undefined },
          { label: 'Checked In', value: `${scanned_count} (${attendance_rate}%)`, icon: '✅', sub: 'attendance rate' },
          { label: 'Gross Revenue', value: formatCurrency(gross_revenue), icon: '💰', sub: `net ${formatCurrency(net_revenue)}` },
          { label: 'Fill Rate', value: fill_rate !== null ? `${fill_rate}%` : '—', icon: '📊', sub: fill_rate !== null ? (fill_rate >= 90 ? 'Nearly full!' : fill_rate >= 50 ? 'Half way there' : 'Still filling up') : 'No capacity set' },
        ].map((kpi) => (
          <div key={kpi.label} className="card p-4">
            <div className="text-2xl mb-1">{kpi.icon}</div>
            <div className="text-xl font-bold text-gray-900">{kpi.value}</div>
            <div className="text-xs font-medium text-gray-500">{kpi.label}</div>
            {kpi.sub && <div className="text-[11px] text-gray-400 mt-0.5">{kpi.sub}</div>}
          </div>
        ))}
      </div>

      {/* Bookings over time */}
      {daily_timeline.length > 0 && (
        <div className="card p-5">
          <h2 className="font-semibold text-gray-900 mb-4">Bookings Over Time</h2>
          <div className="space-y-2">
            {daily_timeline.map(({ date, count }) => (
              <div key={date} className="flex items-center gap-3">
                <span className="w-24 shrink-0 text-xs text-gray-500">{formatDate(date)}</span>
                <div className="flex-1 bg-gray-100 rounded-full h-4 overflow-hidden">
                  <div
                    className="h-full bg-brand-500 rounded-full"
                    style={{ width: maxDay ? `${Math.round((count / maxDay) * 100)}%` : '0%' }}
                  />
                </div>
                <span className="w-6 text-xs font-semibold text-gray-700 text-end">{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Ticket breakdown */}
      {Object.keys(ticketBreakdown).length > 0 && (
        <div className="card p-5">
          <h2 className="font-semibold text-gray-900 mb-4">Ticket Breakdown</h2>
          <div className="space-y-2">
            {Object.values(ticketBreakdown).map((tt) => (
              <div key={tt.name} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                <span className="text-sm text-gray-700">{tt.name}</span>
                <div className="flex items-center gap-3">
                  {tt.is_free && <span className="text-xs bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full font-medium">Free</span>}
                  <span className="text-sm font-semibold text-gray-900">{tt.count} booked</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {confirmed.length === 0 && (
        <div className="card p-10 text-center text-gray-400">
          <div className="text-4xl mb-3">📊</div>
          <p className="font-medium text-gray-600">No bookings yet</p>
          <p className="text-sm mt-1">Analytics will appear once attendees start booking.</p>
        </div>
      )}
    </div>
  )
}
