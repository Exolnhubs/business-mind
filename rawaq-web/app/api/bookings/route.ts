import { NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/auth'
import { handleApiError, ok, created, NotFoundException, ForbiddenException } from '@/lib/errors'
import { CreateBookingSchema } from '@/lib/validations/bookings'
import { sendNotification } from '@/lib/notifications'
import { processPayment } from '@/lib/payments'

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
         event:events(id, title, title_ar, start_at, cover_image_url, city, is_cancelled)`,
        { count: 'exact' }
      )
      .eq('user_id', ctx.userId)
      .order('created_at', { ascending: false })
      .range(from, from + perPage - 1)

    if (status) query = query.eq('status', status)

    const { data, count, error } = await query
    if (error) throw error

    return ok({ data, total: count ?? 0, page, per_page: perPage })
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

    const supabase = await createSupabaseServerClient()

    // Verify event exists and is bookable
    const { data: event, error: eventErr } = await supabase
      .from('events')
      .select('id, title, is_published, is_cancelled, start_at, organizer_id, gender_restriction, is_premium_only, is_free, price, currency')
      .eq('id', input.event_id)
      .single()

    if (eventErr || !event) throw new NotFoundException('Event')
    if (!event.is_published) throw new ForbiddenException('Event is not published')
    if (event.is_cancelled) throw new ForbiddenException('Event has been cancelled')
    if (new Date(event.start_at) < new Date()) {
      throw new ForbiddenException('Event has already started')
    }

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

    // Calculate platform fee for paid events (stored for future real-payment splits)
    let platformFeePct = 0
    let platformFeeAmount = 0
    if (!event.is_free && event.price) {
      const { data: orgProfile } = await supabase
        .from('organizer_profiles')
        .select('plan:plan_definitions(platform_fee_pct)')
        .eq('user_id', event.organizer_id)
        .single()

      platformFeePct = (orgProfile?.plan as { platform_fee_pct?: number } | null)?.platform_fee_pct ?? 0.10
      platformFeeAmount = Math.round(event.price * platformFeePct * 100) / 100
    }

    // Check for an existing cancelled booking — let user rebook the same event
    const { data: existing } = await supabase
      .from('bookings')
      .select('id')
      .eq('user_id', ctx.userId)
      .eq('event_id', input.event_id)
      .eq('status', 'cancelled')
      .maybeSingle()

    let booking
    if (existing) {
      // Reactivate the cancelled booking instead of inserting a duplicate
      const { data, error } = await supabase
        .from('bookings')
        .update({
          status: 'confirmed',
          notes: input.notes ?? null,
          platform_fee_pct: platformFeePct,
          platform_fee_amount: platformFeeAmount,
        })
        .eq('id', existing.id)
        .select()
        .single()
      if (error) throw error
      booking = data
    } else {
      // Insert new booking — capacity guard handled by DB trigger
      const { data, error } = await supabase
        .from('bookings')
        .insert({
          user_id: ctx.userId,
          event_id: input.event_id,
          notes: input.notes,
          status: 'confirmed',
          platform_fee_pct: platformFeePct,
          platform_fee_amount: platformFeeAmount,
        })
        .select()
        .single()
      if (error) throw error
      booking = data
    }

    // Process payment for paid events (fire-and-forget wallet update via DB trigger)
    if (!event.is_free && event.price && platformFeePct > 0) {
      processPayment({
        supabase,
        userId:         ctx.userId,
        organizerId:    event.organizer_id,
        eventId:        event.id,
        bookingId:      booking.id,
        type:           'ticket',
        amount:         event.price,
        platformFeePct,
      }).catch(() => {}) // non-blocking for MVP; in production, await and handle failure
    }

    // Notify user (fire-and-forget) — include ticket_id so email can embed the QR code
    sendNotification({
      userId: ctx.userId,
      type: 'booking_confirmed',
      payload: {
        event_id: event.id,
        event_title: event.title,
        booking_id: booking.id,
        ticket_id: booking.ticket_id ?? undefined,
      },
    }).catch(() => {})

    return created(booking)
  } catch (err) {
    return handleApiError(err)
  }
}
