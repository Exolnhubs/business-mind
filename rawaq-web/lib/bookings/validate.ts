import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  Database,
  Event,
  EventOccurrence,
  Profile,
  TicketType,
} from '@/types/database'
import type { AuthContext } from '@/types/api'
import { resolveTargetOccurrence } from '@/lib/events/occurrences'
import { NotFoundException, ForbiddenException, ApiException } from '@/lib/errors'
import { CreateBookingSchema } from '@/lib/validations/bookings'
import type { z } from 'zod'

type AdminClient = SupabaseClient<Database>
type CreateBookingInput = z.infer<typeof CreateBookingSchema>

type OrganizerPlanRow = {
  plan?: { platform_fee_pct?: number | null } | { platform_fee_pct?: number | null }[] | null
}

type OrganizerPlanJoin = OrganizerPlanRow | OrganizerPlanRow[] | null

type EventRow = Pick<
  Event,
  | 'id'
  | 'title'
  | 'is_published'
  | 'is_cancelled'
  | 'start_at'
  | 'end_at'
  | 'event_frequency'
  | 'organizer_id'
  | 'gender_restriction'
  | 'is_premium_only'
  | 'is_free'
  | 'price'
  | 'currency'
  | 'capacity'
  | 'max_group_size'
> & {
  organizer_plan?: OrganizerPlanJoin
}

type ProfileRow = Pick<Profile, 'display_name' | 'gender' | 'city' | 'plan_id'>
type TicketTypeRow = Pick<
  TicketType,
  'id' | 'price' | 'is_free' | 'capacity' | 'sold_count' | 'sale_starts_at' | 'sale_ends_at'
>

const EVENT_SELECT = `
  id, title, is_published, is_cancelled, start_at, end_at,
  event_frequency, organizer_id, gender_restriction,
  is_premium_only, is_free, price, currency, capacity, max_group_size,
  organizer_plan:organizer_profiles!organizer_id(
    plan:plan_definitions(platform_fee_pct)
  )
`

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function first<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

function resolvePlatformFeePct(event: EventRow): number {
  const organizerPlan = first(event.organizer_plan)
  const plan = first(organizerPlan?.plan)
  return plan?.platform_fee_pct ?? 0.10
}

export interface ValidatedBookingContext {
  event: EventRow
  occurrence: EventOccurrence
  profile: ProfileRow
  ticketType: TicketTypeRow | null
  promoCodeId: string | null
  discountAmount: number
  primaryPrice: number
  platformFeePct: number
}

export async function validateBookingInput(
  admin: AdminClient,
  ctx: AuthContext,
  input: CreateBookingInput,
): Promise<ValidatedBookingContext> {
  const { data: event, error: eventErr } = await admin
    .from('events')
    .select(EVENT_SELECT)
    .eq('id', input.event_id)
    .single()

  if (eventErr || !event) throw new NotFoundException('Event')

  const eventRow = event as unknown as EventRow
  if (!eventRow.is_published) throw new ForbiddenException('Event is not published')
  if (eventRow.is_cancelled) throw new ForbiddenException('Event has been cancelled')

  const occurrence = await resolveTargetOccurrence(admin, eventRow, ctx.userId, input.occurrence_id ?? null)

  const { data: profile } = await admin
    .from('profiles')
    .select('display_name, gender, city, plan_id')
    .eq('id', ctx.userId)
    .single()

  if (!profile?.display_name || !profile?.gender || !profile?.city) {
    throw new ForbiddenException('Please complete your profile (name, gender, city) before booking.')
  }

  const profileRow = profile as ProfileRow
  if (eventRow.gender_restriction === 'male' && profileRow.gender !== 'male') {
    throw new ForbiddenException('This event is for men only.')
  }
  if (eventRow.gender_restriction === 'female' && profileRow.gender !== 'female') {
    throw new ForbiddenException('This event is for women only.')
  }
  if (eventRow.is_premium_only && profileRow.plan_id !== 'user_premium') {
    throw new ForbiddenException('This event is for Premium members only.')
  }

  const maxGroup = eventRow.max_group_size ?? 5
  if (input.group_size > maxGroup) {
    throw new ForbiddenException(`Maximum group size for this event is ${maxGroup}`)
  }
  if (input.holders.length !== input.group_size - 1) {
    throw new ApiException('Holder details must be provided for each extra ticket', 422)
  }

  let ticketType: TicketTypeRow | null = null
  if (input.ticket_type_id) {
    const { data: tt } = await admin
      .from('ticket_types')
      .select('id, price, is_free, capacity, sold_count, sale_starts_at, sale_ends_at, is_active')
      .eq('id', input.ticket_type_id)
      .eq('event_id', input.event_id)
      .single()

    if (!tt || !tt.is_active) throw new ForbiddenException('Ticket type not available')

    const now = new Date()
    if (tt.sale_starts_at && new Date(tt.sale_starts_at) > now) {
      throw new ForbiddenException('Ticket sales not started')
    }
    if (tt.sale_ends_at && new Date(tt.sale_ends_at) < now) {
      throw new ForbiddenException('Ticket sales ended')
    }

    const { data: occurrenceSale } = await admin
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

  let promoCodeId: string | null = null
  let discountAmount = 0
  if (input.promo_code) {
    const code = input.promo_code.toUpperCase().trim()
    const { data: promos } = await admin
      .from('promo_codes')
      .select('*')
      .eq('code', code)
      .eq('is_active', true)
      .or(`event_id.eq.${input.event_id},event_id.is.null`)
      .order('event_id', { nullsFirst: false })
      .limit(2)

    const promo = promos?.find((item) => item.event_id === input.event_id) ?? promos?.find((item) => !item.event_id)
    if (!promo) throw new ForbiddenException('Invalid or inactive promo code')
    if (promo.expires_at && new Date(promo.expires_at) < new Date()) {
      throw new ForbiddenException('Promo code expired')
    }
    if (promo.max_uses !== null && promo.used_count >= promo.max_uses) {
      throw new ForbiddenException('Promo code usage limit reached')
    }

    const orderPrice = ticketType ? ticketType.price : (eventRow.price ?? 0)
    if (orderPrice < (promo.min_order_amount ?? 0)) {
      throw new ForbiddenException(`Minimum order: ${promo.min_order_amount}`)
    }

    promoCodeId = promo.id
    discountAmount = promo.discount_type === 'percent'
      ? round2(orderPrice * (promo.discount_value / 100))
      : Math.min(promo.discount_value, orderPrice)
  }

  const primaryPrice = ticketType
    ? Math.max(0, ticketType.price - discountAmount)
    : eventRow.price
      ? Math.max(0, eventRow.price - discountAmount)
      : 0

  return {
    event: eventRow,
    occurrence,
    profile: profileRow,
    ticketType,
    promoCodeId,
    discountAmount,
    primaryPrice,
    platformFeePct: resolvePlatformFeePct(eventRow),
  }
}
