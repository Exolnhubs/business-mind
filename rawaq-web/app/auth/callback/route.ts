import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'

// GET /auth/callback
// Handles OAuth redirects (Google, etc.) and magic-link sign-ins.
// Supabase sends ?code=<PKCE code> after the provider redirects back.
export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/events'

  if (code) {
    const supabase = await createSupabaseServerClient()
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error && data.user) {
      // Block banned accounts before they enter the app
      const { data: profile } = await supabase
        .from('profiles')
        .select('is_banned')
        .eq('id', data.user.id)
        .single()

      if (profile?.is_banned) {
        await supabase.auth.signOut()
        return NextResponse.redirect(`${origin}/login?error=banned`)
      }

      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  // On error, send to login with message
  return NextResponse.redirect(`${origin}/login?error=oauth_failed`)
}
