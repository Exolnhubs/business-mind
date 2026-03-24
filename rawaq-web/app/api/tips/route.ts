import { NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/auth'
import { handleApiError, ok, created, NotFoundException, ForbiddenException } from '@/lib/errors'
import { CreateTipSchema } from '@/lib/validations/tips'
import { sendNotification } from '@/lib/notifications'

// GET /api/tips — tips sent by current user (or received, for organizers)
export async function GET(req: NextRequest) {
  try {
    const ctx = await requireAuth()
    const supabase = await createSupabaseServerClient()

    const direction = req.nextUrl.searchParams.get('direction') ?? 'sent'
    const page = Number(req.nextUrl.searchParams.get('page') ?? 1)
    const perPage = Number(req.nextUrl.searchParams.get('per_page') ?? 20)
    const from = (page - 1) * perPage

    let query = supabase
      .from('tips')
      .select(
        `id, amount, currency, message, created_at,
         event:events(id, title, title_ar),
         sender:profiles!user_id(id, display_name, avatar_url)`,
        { count: 'exact' }
      )
      .order('created_at', { ascending: false })
      .range(from, from + perPage - 1)

    if (direction === 'received' && ctx.role === 'organizer') {
      query = query.eq('organizer_id', ctx.userId)
    } else {
      query = query.eq('user_id', ctx.userId)
    }

    const { data, count, error } = await query
    if (error) throw error

    return ok({ data, total: count ?? 0, page, per_page: perPage })
  } catch (err) {
    return handleApiError(err)
  }
}

// POST /api/tips
export async function POST(req: NextRequest) {
  try {
    const ctx = await requireAuth()
    const body = await req.json()
    const input = CreateTipSchema.parse(body)

    const supabase = await createSupabaseServerClient()

    // Verify event and get organizer
    const { data: event, error: eventErr } = await supabase
      .from('events')
      .select('id, title, organizer_id, is_published, is_cancelled')
      .eq('id', input.event_id)
      .single()

    if (eventErr || !event) throw new NotFoundException('Event')
    if (!event.is_published || event.is_cancelled) {
      throw new ForbiddenException('Cannot tip on an inactive event')
    }
    if (event.organizer_id === ctx.userId) {
      throw new ForbiddenException('Cannot tip your own event')
    }

    // MVP: simulate payment success (no real gateway)
    // In production: call payment gateway here, store transaction ref
    const paymentRef = `mock_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`

    // Look up organizer's platform fee from their plan
    const { data: orgProfile } = await supabase
      .from('organizer_profiles')
      .select('plan:plan_definitions(platform_fee_pct)')
      .eq('user_id', event.organizer_id)
      .single()

    const feePct: number = (orgProfile?.plan as { platform_fee_pct?: number } | null)?.platform_fee_pct ?? 0.10
    const feeAmount = Math.round(input.amount * feePct * 100) / 100

    const { data: tip, error } = await supabase
      .from('tips')
      .insert({
        user_id: ctx.userId,
        event_id: input.event_id,
        organizer_id: event.organizer_id,
        amount: input.amount,
        currency: input.currency,
        message: input.message,
        payment_ref: paymentRef,
        is_simulated: true,
        platform_fee_pct: feePct,
        platform_fee_amount: feeAmount,
      })
      .select()
      .single()

    if (error) throw error

    // Notify organizer
    sendNotification({
      userId: event.organizer_id,
      type: 'tip_received',
      payload: {
        event_id: event.id,
        event_title: event.title,
        amount: input.amount,
        currency: input.currency,
        tipper_id: ctx.userId,
      },
    }).catch(() => {})

    return created(tip)
  } catch (err) {
    return handleApiError(err)
  }
}
