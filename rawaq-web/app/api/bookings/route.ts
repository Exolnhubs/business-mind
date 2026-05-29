import { NextRequest } from 'next/server'
import { waitUntil } from '@vercel/functions'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireAuth } from '@/lib/auth'
import { handleApiError, ok, created, ForbiddenException } from '@/lib/errors'
import { paginationRange, paginatedResponse, parsePerPage, parsePage } from '@/lib/pagination'
import { CreateBookingSchema } from '@/lib/validations/bookings'
import { sendNotification } from '@/lib/notifications'
import { applyResolvedEventWindow } from '@/lib/events/recurrence'
import { limiters, checkRateLimit } from '@/lib/rate-limit'
import { validateBookingInput } from '@/lib/bookings/validate'
import type { EventOccurrence } from '@/types/database'

type BookingListEventShape = {
  id: string
  title: string
  title_ar: string | null
  start_at: string
  end_at: string | null
  event_frequency?: 'one_time' | 'weekly' | 'monthly'
  cover_image_url: string | null
  city: string
  is_cancelled: boolean
}

type BookingListOccurrenceShape = {
  id: string
  starts_at: string
  ends_at: string | null
}

// GET /api/bookings - current user's bookings
export async function GET(req: NextRequest) {
  try {
    const ctx = await requireAuth()
    const supabase = await createSupabaseServerClient()

    const page = parsePage(req.nextUrl.searchParams.get('page'))
    const perPage = parsePerPage(req.nextUrl.searchParams.get('per_page'), 20)
    const status = req.nextUrl.searchParams.get('status')
    const { from, to } = paginationRange(page, perPage)

    let query = supabase
      .from('bookings')
      .select(
        `id, status, created_at, notes,
         event:events(id, title, title_ar, start_at, end_at, event_frequency, cover_image_url, city, is_cancelled),
         occurrence:event_occurrences!occurrence_id(id, starts_at, ends_at)`,
        { count: 'exact' }
      )
      .eq('user_id', ctx.userId)
      .order('created_at', { ascending: false })
      .range(from, to)

    if (status) query = query.eq('status', status as import('@/types/database').BookingStatus)

    const { data, count, error } = await query
    if (error) throw error

    const resolvedData = (data ?? []).map((booking) => {
      const occurrence = booking.occurrence as unknown as BookingListOccurrenceShape | null
      const event = booking.event as unknown as BookingListEventShape | null

      return {
        ...booking,
        event: occurrence && event
          ? {
              ...event,
              start_at: occurrence.starts_at,
              end_at: occurrence.ends_at,
            }
          : event
            ? applyResolvedEventWindow(event)
            : booking.event,
      }
    })

    return ok(paginatedResponse(resolvedData, count ?? 0, page, perPage))
  } catch (err) {
    return handleApiError(err)
  }
}

// POST /api/bookings
export async function POST(req: NextRequest) {
  try {
    const ctx = await requireAuth()
    await checkRateLimit(limiters.bookings, ctx.userId)
    const body = await req.json()
    const input = CreateBookingSchema.parse(body)

    const admin = createSupabaseAdminClient()
    const {
      event,
      occurrence,
      profile,
      ticketType,
      promoCodeId,
      discountAmount,
      primaryPrice,
      platformFeePct,
    } = await validateBookingInput(admin, ctx, input)

    const isFreeBooking = ticketType
      ? ticketType.is_free || primaryPrice === 0
      : event.is_free || primaryPrice === 0
    const platformFeeAmount = !isFreeBooking && primaryPrice > 0
      ? Math.round(primaryPrice * platformFeePct * 100) / 100
      : 0

    const { data: anyExisting } = await admin
      .from('bookings')
      .select('id, status')
      .eq('user_id', ctx.userId)
      .eq('occurrence_id', occurrence.id)
      .maybeSingle()

    if (anyExisting?.status === 'confirmed') {
      throw new ForbiddenException('You already have an active booking for this session')
    }

    const bookingFields = {
      status: 'confirmed',
      notes: input.notes ?? null,
      ticket_type_id: input.ticket_type_id ?? null,
      promo_code_id: promoCodeId,
      discount_amount: discountAmount,
      platform_fee_pct: platformFeePct,
      platform_fee_amount: platformFeeAmount,
      group_size: input.group_size,
    }

    let booking: Record<string, unknown>
    if (anyExisting) {
      const { data, error } = await admin
        .from('bookings')
        .update(bookingFields as never)
        .eq('id', anyExisting.id)
        .select()
        .single()
      if (error) throw error
      booking = data as Record<string, unknown>
    } else {
      const { data, error } = await admin
        .from('bookings')
        .insert({
          user_id: ctx.userId,
          event_id: input.event_id,
          occurrence_id: occurrence.id,
          ...bookingFields,
        } as never)
        .select()
        .single()
      if (error) throw error
      booking = data as Record<string, unknown>
    }

    if (input.holders.length > 0) {
      const holderRows = input.holders.map((holder) => ({
        booking_id: booking.id,
        full_name: holder.full_name,
        date_of_birth: holder.date_of_birth,
        relation: holder.relation,
        position: holder.position,
      }))
      const { error: holderErr } = await admin.from('booking_holders').insert(holderRows as never)
      if (holderErr) throw holderErr
    }

    waitUntil(
      sendNotification({
        userId: ctx.userId,
        type: 'booking_confirmed',
        payload: {
          event_id: event.id,
          occurrence_id: occurrence.id,
          event_title: event.title,
          booking_id: booking.id as string,
          ticket_id: (booking as { ticket_id?: string | null }).ticket_id ?? undefined,
        },
      }).catch((error) => console.error('[bookings] booking_confirmed notification failed:', error))
    )
    waitUntil(
      sendNotification({
        userId: event.organizer_id,
        type: 'new_attendee',
        payload: {
          event_id: event.id,
          occurrence_id: occurrence.id,
          event_title: event.title,
          booking_id: booking.id as string,
          actor_id: ctx.userId,
          actor_name: profile.display_name ?? 'Someone',
        },
      }).catch((error) => console.error('[bookings] new_attendee notification failed:', error))
    )
    if (occurrence.capacity) {
      waitUntil(
        checkSoldOut(admin, occurrence, event)
          .catch((error) => console.error('[bookings] sold-out check failed:', error))
      )
    }

    return created(booking)
  } catch (err) {
    return handleApiError(err)
  }
}

async function checkSoldOut(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  occurrence: Pick<EventOccurrence, 'id' | 'capacity'>,
  event: { id: string; organizer_id: string; title: string },
) {
  const { count: confirmedCount } = await admin
    .from('bookings')
    .select('id', { count: 'exact', head: true })
    .eq('occurrence_id', occurrence.id)
    .eq('status', 'confirmed')

  if (confirmedCount !== null && occurrence.capacity !== null && confirmedCount >= occurrence.capacity) {
    await sendNotification({
      userId: event.organizer_id,
      type: 'event_sold_out',
      payload: { event_id: event.id, occurrence_id: occurrence.id, event_title: event.title },
    })
  }
}
