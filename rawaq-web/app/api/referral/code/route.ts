import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireAuth } from '@/lib/auth'
import { handleApiError, ok } from '@/lib/errors'

function generateCode(displayName: string, userId: string): string {
  const slug = (displayName ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 6)
  const suffix = userId.replace(/-/g, '').slice(0, 4).toUpperCase()
  return slug.length >= 3 ? `${slug}-${suffix}` : `RAW-${suffix}`
}

// GET /api/referral/code
// Returns the caller's referral code, creating one lazily if needed.
// Also returns referral stats so the UI needs only one request.
export async function GET() {
  try {
    const ctx = await requireAuth()
    const supabase = await createSupabaseServerClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = createSupabaseAdminClient() as any

    // Try to read existing code first
    const { data: existingRaw } = await supabase
      .from('referral_codes')
      .select('*')
      .eq('user_id', ctx.userId)
      .single()
    const existing = existingRaw as { id: string; code: string; clicks: number } | null

    if (existing) {
      return ok(await buildResponse(admin, existing, ctx.userId))
    }

    // Lazy-create using admin client (bypasses RLS insert restriction)
    const { data: profile } = await supabase
      .from('profiles')
      .select('display_name')
      .eq('id', ctx.userId)
      .single()

    const code = generateCode(profile?.display_name ?? '', ctx.userId)

    const { data: createdRaw, error } = await admin
      .from('referral_codes')
      .upsert({ user_id: ctx.userId, code }, { onConflict: 'user_id', ignoreDuplicates: false })
      .select()
      .single()

    if (error) throw error
    const created = createdRaw as { id: string; code: string; clicks: number }
    return ok(await buildResponse(admin, created, ctx.userId))
  } catch (err) {
    return handleApiError(err)
  }
}

async function buildResponse(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  referralCode: { id: string; code: string; clicks: number },
  userId: string,
) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const referralUrl = `${appUrl}/register?ref=${referralCode.code}`

  const [signupsRes, conversionsRes, couponsRes] = await Promise.all([
    supabase.from('referrals').select('id', { count: 'exact', head: true }).eq('referrer_id', userId),
    supabase.from('referrals').select('id', { count: 'exact', head: true }).eq('referrer_id', userId).eq('conversion_coupon_awarded', true),
    supabase
      .from('user_coupons')
      .select('*, promo:promo_codes(code, discount_type, discount_value, used_count, is_active, expires_at)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false }),
  ])

  return {
    code:         referralCode.code,
    referral_url: referralUrl,
    clicks:       referralCode.clicks,
    signups:      signupsRes.count ?? 0,
    conversions:  conversionsRes.count ?? 0,
    coupons:      couponsRes.data ?? [],
  }
}
