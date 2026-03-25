import { NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { handleApiError, ok, BadRequestException } from '@/lib/errors'

// GET /api/promo-codes/validate?code=XX&event_id=YY&order_amount=ZZ
// Public endpoint — no auth required (used before booking)
export async function GET(req: NextRequest) {
  try {
    const code        = req.nextUrl.searchParams.get('code')?.toUpperCase().trim()
    const eventId     = req.nextUrl.searchParams.get('event_id')
    const orderAmount = Number(req.nextUrl.searchParams.get('order_amount') ?? 0)

    if (!code) throw new BadRequestException('code is required')

    const supabase = await createSupabaseServerClient()

    // Look for event-specific code first, then fall back to platform-wide
    const { data: codes } = await supabase
      .from('promo_codes')
      .select('*')
      .eq('code', code)
      .eq('is_active', true)
      .or(eventId ? `event_id.eq.${eventId},event_id.is.null` : 'event_id.is.null')
      .order('event_id', { nullsFirst: false }) // event-specific codes rank first
      .limit(2)

    // Pick the most specific applicable code
    const promo = codes?.find((c) => c.event_id === eventId) ?? codes?.find((c) => !c.event_id)

    if (!promo) {
      return ok({ valid: false, reason: 'Code not found or inactive' })
    }

    // Expiry check
    if (promo.expires_at && new Date(promo.expires_at) < new Date()) {
      return ok({ valid: false, reason: 'This promo code has expired' })
    }

    // Max uses check
    if (promo.max_uses !== null && promo.used_count >= promo.max_uses) {
      return ok({ valid: false, reason: 'This promo code has reached its usage limit' })
    }

    // Minimum order check
    if (orderAmount < (promo.min_order_amount ?? 0)) {
      return ok({
        valid: false,
        reason: `Minimum order amount of ${promo.min_order_amount} required`,
      })
    }

    // Calculate discount amount
    let discountAmount = 0
    if (promo.discount_type === 'percent') {
      discountAmount = Math.round(orderAmount * (promo.discount_value / 100) * 100) / 100
    } else {
      discountAmount = Math.min(promo.discount_value, orderAmount) // can't discount more than order
    }

    return ok({
      valid:           true,
      promo_code_id:   promo.id,
      code:            promo.code,
      discount_type:   promo.discount_type,
      discount_value:  promo.discount_value,
      discount_amount: discountAmount,
      final_amount:    Math.max(0, orderAmount - discountAmount),
    })
  } catch (err) {
    return handleApiError(err)
  }
}
