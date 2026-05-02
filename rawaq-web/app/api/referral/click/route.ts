import { NextRequest } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { handleApiError, ok } from '@/lib/errors'

// POST /api/referral/click
// Atomically increments click counter for a referral code.
// No auth required — the visitor isn't signed in yet.
export async function POST(req: NextRequest) {
  try {
    const { code } = await req.json()
    if (!code || typeof code !== 'string') return ok({ ok: true })

        const admin = createSupabaseAdminClient()
    await admin.rpc('increment_referral_clicks', { p_code: code.toUpperCase().trim() })

    return ok({ ok: true })
  } catch (err) {
    return handleApiError(err)
  }
}
