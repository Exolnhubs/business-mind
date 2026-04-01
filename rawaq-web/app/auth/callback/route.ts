import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { sendNotification } from '@/lib/notifications'

// GET /auth/callback
// Handles OAuth redirects and email-confirmation sign-ins.
// Claims a pending referral if rawaq_ref cookie or ?ref= param is present.
export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/events'

  // ref arrives via cookie (email-confirmation) or ?ref= param (OAuth flow)
  const cookieStore = await cookies()
  const refFromCookie = cookieStore.get('rawaq_ref')?.value
  const refFromParam  = searchParams.get('ref')
  const refCode       = refFromParam ?? (refFromCookie ? decodeURIComponent(refFromCookie) : null)

  if (code) {
    const supabase = await createSupabaseServerClient()
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error && data.user) {
      // Block banned accounts
      const { data: profile } = await supabase
        .from('profiles')
        .select('is_banned')
        .eq('id', data.user.id)
        .single()

      if (profile?.is_banned) {
        await supabase.auth.signOut()
        return NextResponse.redirect(`${origin}/login?error=banned`)
      }

      // Claim referral if a code was passed
      if (refCode) {
        try {
          const admin = createSupabaseAdminClient()
          const { data: refCodeRow } = await admin
            .from('referral_codes')
            .select('id, user_id')
            .eq('code', refCode.toUpperCase().trim())
            .single()

          if (refCodeRow && refCodeRow.user_id !== data.user.id) {
            const { error: insertErr } = await admin.from('referrals').insert({
              referrer_id: refCodeRow.user_id,
              referred_id: data.user.id,
              code_id:     refCodeRow.id,
            })
            // 23505 = unique violation (already claimed) — not an error
            if (!insertErr || insertErr.code === '23505') {
              sendNotification({
                userId:  refCodeRow.user_id,
                type:    'referral_signup_reward',
                payload: { referred_user_id: data.user.id },
              }).catch(() => {})
            }
          }
        } catch { /* don't break auth on referral errors */ }
      }

      const res = NextResponse.redirect(`${origin}${next}`)
      res.cookies.set('rawaq_ref', '', { path: '/', maxAge: 0 })
      return res
    }
  }

  return NextResponse.redirect(`${origin}/login?error=oauth_failed`)
}
