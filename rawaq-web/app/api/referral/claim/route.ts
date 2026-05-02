import { NextRequest } from 'next/server'
import { z } from 'zod'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireAuth } from '@/lib/auth'
import { handleApiError, ok } from '@/lib/errors'
import { sendNotification } from '@/lib/notifications'

const Schema = z.object({
  code: z.string().min(3).max(20).transform((s) => s.toUpperCase().trim()),
})

// POST /api/referral/claim
// Called immediately after a new user's session is established.
// Inserts a referrals row → DB trigger awards the signup coupon automatically.
export async function POST(req: NextRequest) {
  try {
    const ctx    = await requireAuth()
    const input  = Schema.parse(await req.json())
        const admin  = createSupabaseAdminClient()
    const supabase = await createSupabaseServerClient()

    // Guard: only credit referrals for accounts created in the last 10 minutes.
    // Prevents existing users from gaming the system by re-visiting a referral link.
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const accountAgeMs = Date.now() - new Date(user.created_at).getTime()
    if (accountAgeMs > 10 * 60 * 1000) {
      return ok({ skipped: true, reason: 'existing_account' })
    }

    // Look up the referral code
    const { data: refCodeRaw, error: codeErr } = await admin
      .from('referral_codes')
      .select('id, user_id')
      .eq('code', input.code)
      .single()
    const refCode = refCodeRaw as { id: string; user_id: string } | null

    if (codeErr || !refCode) {
      return Response.json({ error: 'Invalid referral code.' }, { status: 404 })
    }

    // Self-referral guard
    if (refCode.user_id === ctx.userId) {
      return Response.json({ error: 'You cannot use your own referral code.' }, { status: 400 })
    }

    // Insert — UNIQUE(referred_id) makes this idempotent
    const { error: insertErr } = await admin.from('referrals').insert({
      referrer_id: refCode.user_id,
      referred_id: ctx.userId,
      code_id:     refCode.id,
    })

    if (insertErr) {
      if (insertErr.code === '23505') return ok({ already_claimed: true })
      throw insertErr
    }

    // Only notify on a fresh insert
    sendNotification({
      userId:  refCode.user_id,
      type:    'referral_signup_reward',
      payload: { referred_user_id: ctx.userId },
    }).catch(() => {})

    return ok({ claimed: true })
  } catch (err) {
    return handleApiError(err)
  }
}
