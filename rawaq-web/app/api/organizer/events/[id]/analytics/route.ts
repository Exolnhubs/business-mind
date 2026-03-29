import { NextRequest } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireOrganizer } from '@/lib/auth'
import { handleApiError, ok, NotFoundException, ForbiddenException } from '@/lib/errors'

// GET /api/organizer/events/:id/analytics
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const ctx = await requireOrganizer()
    const admin = createSupabaseAdminClient()

    // Verify ownership
    const { data: event } = await admin
      .from('events')
      .select('id, title, organizer_id, capacity, start_at')
      .eq('id', id)
      .single()

    if (!event) throw new NotFoundException('Event')
    if (ctx.role !== 'admin' && event.organizer_id !== ctx.userId) {
      throw new ForbiddenException('You do not own this event')
    }

    // Fetch all confirmed bookings
    const { data: bookings } = await admin
      .from('bookings')
      .select('id, created_at, scanned_at, status, ticket_type_id, platform_fee_amount')
      .eq('event_id', id)
      .eq('status', 'confirmed')

    // Fetch ticket type prices in one query
    const ticketTypeIds = [...new Set((bookings ?? []).map((b) => b.ticket_type_id).filter(Boolean))]
    const ticketPriceMap: Record<string, { price: number; is_free: boolean }> = {}
    if (ticketTypeIds.length > 0) {
      const { data: ttRows } = await admin
        .from('ticket_types')
        .select('id, price, is_free')
        .in('id', ticketTypeIds as string[])
      for (const tt of ttRows ?? []) {
        ticketPriceMap[tt.id] = { price: tt.price, is_free: tt.is_free }
      }
    }

    const confirmed = bookings ?? []

    // Daily bookings timeline (last 30 days from event start or today)
    const dailyMap: Record<string, number> = {}
    for (const b of confirmed) {
      const day = b.created_at.slice(0, 10)
      dailyMap[day] = (dailyMap[day] ?? 0) + 1
    }
    const daily_timeline = Object.entries(dailyMap)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date))

    // Revenue estimate (sum of ticket prices minus platform fees)
    let gross_revenue = 0
    let platform_fees = 0
    for (const b of confirmed) {
      const tt = b.ticket_type_id ? ticketPriceMap[b.ticket_type_id] : null
      if (tt && !tt.is_free) gross_revenue += tt.price
      platform_fees += (b.platform_fee_amount as number | null) ?? 0
    }
    const net_revenue = gross_revenue - platform_fees

    // Scan / attendance rate
    const scanned_count = confirmed.filter((b) => b.scanned_at).length
    const attendance_rate = confirmed.length > 0
      ? Math.round((scanned_count / confirmed.length) * 100)
      : 0

    return ok({
      event_id: id,
      confirmed_count: confirmed.length,
      scanned_count,
      attendance_rate,
      capacity: event.capacity,
      gross_revenue,
      net_revenue,
      platform_fees,
      daily_timeline,
    })
  } catch (err) {
    return handleApiError(err)
  }
}
