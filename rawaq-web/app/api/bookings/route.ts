import { NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireAuth } from '@/lib/auth'
import { handleApiError, ok, created, NotFoundException, ForbiddenException } from '@/lib/errors'
import { CreateBookingSchema } from '@/lib/validations/bookings'
import { sendNotification } from '@/lib/notifications'
import { applyResolvedEventWindow } from '@/lib/events/recurrence'
import { resolveTargetOccurrence } from '@/lib/events/occurrences'

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

// GET /api/bookings — current user's bookings
export async function GET(req: NextRequest) {
  try {
    const ctx = await requireAuth()
    const supabase = await createSupabaseServerClient()

    const page = Number(req.nextUrl.searchParams.get('page') ?? 1)
    const perPage = Number(req.nextUrl.searchParams.get('per_page') ?? 20)
    const status = req.nextUrl.searchParams.get('status')
    const from = (page - 1) * perPage

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
      .range(from, from + perPage - 1)

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

    return ok({ data: resolvedData, total: count ?? 0, page, per_page: perPage })
  } catch (err) {
    return handleApiError(err)
  }
}

// POST /api/bookings
export async function POST(req: NextRequest) {
  try {
    const ctx = await requireAuth()
    const body = await req.json()
    const input = CreateBookingSchema.parse(body)

    const supabase = createSupabaseAdminClient()

    // Verify event exists and is bookable
    const { data: event, error: eventErr } = await supabase
      .from('events')
      .select('id, title, is_published, is_cancelled, start_at, end_at, event_frequency, organizer_id, gender_restriction, is_premium_only, is_free, price, currency, capacity')
      .eq('id', input.event_id)
      .single()

    if (eventErr || !event) throw new NotFoundException('Event')
    if (!event.is_published) throw new ForbiddenException('Event is not published')
    if (event.is_cancelled) throw new ForbiddenException('Event has been cancelled')

    const occurrence = await resolveTargetOccurrence(supabase, event, ctx.userId, input.occurrence_id ?? null)

    // Fetch user profile — required for completion check, gender restriction, and plan check
    const { data: profile } = await supabase
      .from('profiles')
      .select('display_name, gender, city, plan_id')
      .eq('id', ctx.userId)
      .single()

    // Profile must be complete before booking
    if (!profile?.display_name || !profile?.gender || !profile?.city) {
      throw new ForbiddenException(
        'Please complete your profile (name, gender, city) before booking an event.'
      )
    }

    // Gender restriction check
    if (event.gender_restriction === 'male' && profile.gender !== 'male') {
      throw new ForbiddenException('This event is for men only.')
    }
    if (event.gender_restriction === 'female' && profile.gender !== 'female') {
      throw new ForbiddenException('This event is for women only.')
    }

    // Premium-only event check
    if (event.is_premium_only && profile.plan_id !== 'user_premium') {
      throw new ForbiddenException(
        'This event is for Premium members only. Upgrade your plan to book.'
      )
    }

    // ── Ticket type validation ──────────────────────────────────────────────
    let ticketType: { id: string; price: number; is_free: boolean; capacity: number | null; sold_count: number; sale_starts_at: string | null; sale_ends_at: string | null } | null = null
    if (input.ticket_type_id) {
      const { data: tt } = await supabase
        .from('ticket_types')
        .select('id, price, is_free, capacity, sold_count, sale_starts_at, sale_ends_at, is_active')
        .eq('id', input.ticket_type_id)
        .eq('event_id', input.event_id)
        .single()

      if (!tt || !(tt as { is_active: boolean }).is_active) {
        throw new ForbiddenException('Selected ticket type is not available')
      }
      const now = new Date()
      if (tt.sale_starts_at && new Date(tt.sale_starts_at) > now) {
        throw new ForbiddenException('Ticket sales have not started yet')
      }
      if (tt.sale_ends_at && new Date(tt.sale_ends_at) < now) {
        throw new ForbiddenException('Ticket sales have ended')
      }
      const { data: occurrenceSale } = await supabase
        .from('event_occurrence_ticket_sales')
        .select('sold_count')
        .eq('occurrence_id', occurrence.id)
        .eq('ticket_type_id', input.ticket_type_id)
        .maybeSingle()

      if (tt.capacity !== null && (occurrenceSale?.sold_count ?? 0) >= tt.capacity) {
        throw new ForbiddenException('This ticket type is sold out')
      }
      ticketType = tt
    }

    // ── Promo code validation ───────────────────────────────────────────────
    let promoCodeId: string | null = null
    let discountAmount = 0
    if (input.promo_code) {
      const code = input.promo_code.toUpperCase().trim()
      const { data: promos } = await supabase
        .from('promo_codes')
        .select('*')
        .eq('code', code)
        .eq('is_active', true)
        .or(`event_id.eq.${input.event_id},event_id.is.null`)
        .order('event_id', { nullsFirst: false })
        .limit(2)

      const promo = promos?.find((p) => p.event_id === input.event_id) ?? promos?.find((p) => !p.event_id)

      if (!promo) throw new ForbiddenException('Invalid or inactive promo code')
      if (promo.expires_at && new Date(promo.expires_at) < new Date()) {
        throw new ForbiddenException('Promo code has expired')
      }
      if (promo.max_uses !== null && promo.used_count >= promo.max_uses) {
        throw new ForbiddenException('Promo code usage limit reached')
      }

      const orderPrice = ticketType ? ticketType.price : (event.price ?? 0)
      if (orderPrice < (promo.min_order_amount ?? 0)) {
        throw new ForbiddenException(`Promo code requires a minimum order of ${promo.min_order_amount}`)
      }

      promoCodeId = promo.id
      if (promo.discount_type === 'percent') {
        discountAmount = Math.round(orderPrice * (promo.discount_value / 100) * 100) / 100
      } else {
        discountAmount = Math.min(promo.discount_value, orderPrice)
      }
    }

    // ── Effective price (ticket type overrides event price) ─────────────────
    const effectivePrice = ticketType
      ? Math.max(0, ticketType.price - discountAmount)
      : event.price
        ? Math.max(0, event.price - discountAmount)
        : 0
    const isFreeBooking = ticketType ? ticketType.is_free || effectivePrice === 0 : event.is_free || effectivePrice === 0

    // ── Platform fee ────────────────────────────────────────────────────────
    let platformFeePct = 0
    let platformFeeAmount = 0
    if (!isFreeBooking && effectivePrice > 0) {
      const { data: orgProfile } = await supabase
        .from('organizer_profiles')
        .select('plan:plan_definitions(platform_fee_pct)')
        .eq('user_id', event.organizer_id)
        .single()

      platformFeePct = (orgProfile?.plan as { platform_fee_pct?: number } | null)?.platform_fee_pct ?? 0.10
      platformFeeAmount = Math.round(effectivePrice * platformFeePct * 100) / 100
    }

    // ── Resolve existing booking row (any status) ────────────────────────────
    // Fetch unconditionally — UNIQUE (user_id, event_id) means at most one row.
    // Never INSERT blindly against an existing row regardless of its status.
    const { data: anyExisting } = await (supabase as any)
      .from('bookings')
      .select('id, status')
      .eq('user_id', ctx.userId)
      .eq('occurrence_id', occurrence.id)
      .maybeSingle()

    const existingStatus: string | null = anyExisting ? (anyExisting as any).status : null

    if (existingStatus === 'confirmed') {
      throw new ForbiddenException('You already have an active booking for this event')
    }

    const bookingFields = {
      status:              'confirmed',
      notes:               input.notes ?? null,
      ticket_type_id:      input.ticket_type_id ?? null,
      promo_code_id:       promoCodeId,
      discount_amount:     discountAmount,
      platform_fee_pct:    platformFeePct,
      platform_fee_amount: platformFeeAmount,
    }

    let booking
    if (anyExisting) {
      const { data, error } = await supabase
        .from('bookings').update(bookingFields as any).eq('id', (anyExisting as any).id).select().single()
      if (error) throw error
      booking = data
    } else {
      const { data, error } = await supabase
        .from('bookings')
        .insert({ user_id: ctx.userId, event_id: input.event_id, occurrence_id: occurrence.id, ...bookingFields } as any)
        .select().single()
      if (error) throw error
      booking = data
    }

    // Payment transaction is created automatically by the DB trigger
    // trg_auto_payment_on_booking (migration 00023) — works for both web
    // and mobile (direct-Supabase) booking paths without double-counting.

    // Notify attendee (fire-and-forget)
    sendNotification({
      userId: ctx.userId,
      type: 'booking_confirmed',
      payload: {
        event_id:   event.id,
        occurrence_id: occurrence.id,
        event_title: event.title,
        booking_id: booking.id,
        ticket_id:  booking.ticket_id ?? undefined,
      },
    }).catch(() => {})

    // Notify organizer of new attendee (fire-and-forget)
    sendNotification({
      userId:  event.organizer_id,
      type:    'new_attendee',
      payload: {
        event_id:    event.id,
        occurrence_id: occurrence.id,
        event_title: event.title,
        booking_id:  booking.id,
        actor_id:    ctx.userId,
        actor_name:  profile?.display_name ?? 'Someone',
      },
    }).catch(() => {})

    // Notify organizer if event just sold out (fire-and-forget)
    if (occurrence.capacity) {
      const { count: confirmedCount } = await supabase
        .from('bookings')
        .select('id', { count: 'exact', head: true })
        .eq('occurrence_id', occurrence.id)
        .eq('status', 'confirmed')

      if (confirmedCount !== null && confirmedCount >= occurrence.capacity) {
        sendNotification({
          userId:  event.organizer_id,
          type:    'event_sold_out',
          payload: { event_id: event.id, occurrence_id: occurrence.id, event_title: event.title },
        }).catch(() => {})
      }
    }

    return created(booking)
  } catch (err) {
    return handleApiError(err)
  }
}
