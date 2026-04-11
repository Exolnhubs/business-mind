'use client'

import { useState, useEffect, type FormEvent, Suspense } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter, useSearchParams } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { useLocale } from '@/contexts/locale-context'
import { Spinner } from '@/components/ui/Spinner'

const CITIES = ['Riyadh', 'Jeddah', 'Dammam', 'Mecca', 'Medina', 'Khobar', 'Tabuk', 'Abha', 'Taif']

type LocationState =
  | { status: 'idle' }
  | { status: 'detecting' }
  | { status: 'detected'; city: string; lat: number; lng: number }
  | { status: 'denied' }

export default function RegisterPage() {
  return (
    <Suspense>
      <RegisterForm />
    </Suspense>
  )
}

function RegisterForm() {
  const { t } = useLocale()
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createSupabaseBrowserClient()

  // Capture referral code from URL and persist as a cookie so it survives
  // the email-confirmation redirect back through /auth/callback
  useEffect(() => {
    const ref = searchParams.get('ref')
    if (!ref) return
    // Track the click (fire-and-forget)
    fetch('/api/referral/click', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: ref }),
    }).catch(() => {})
    // Store in a short-lived cookie that /auth/callback can read
    document.cookie = `rawaq_ref=${encodeURIComponent(ref)}; Path=/; Max-Age=600; SameSite=Lax`
  }, [searchParams])

  const [form, setForm] = useState({
    email: '',
    password: '',
    displayName: '',
    businessName: '',
    city: '',
    lat: null as number | null,
    lng: null as number | null,
    role: 'user' as 'user' | 'organizer',
  })
  const [locationState, setLocationState] = useState<LocationState>({ status: 'idle' })
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [oauthLoading, setOauthLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  // Auto-detect location on mount
  useEffect(() => {
    if (typeof window === 'undefined' || !navigator.geolocation) {
      setLocationState({ status: 'denied' })
      return
    }
    setLocationState({ status: 'detecting' })
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
            { headers: { 'Accept-Language': 'en' } }
          )
          const data = await res.json()
          const city =
            data.address?.city ??
            data.address?.town ??
            data.address?.county ??
            data.address?.state ??
            ''
          setLocationState({ status: 'detected', city, lat, lng })
          setForm((f) => ({ ...f, city, lat, lng }))
        } catch {
          setLocationState({ status: 'detected', city: '', lat, lng })
          setForm((f) => ({ ...f, lat, lng }))
        }
      },
      () => setLocationState({ status: 'denied' }),
      { timeout: 8000 }
    )
  }, [])

  async function handleGoogleSignIn() {
    setOauthLoading(true)
    setError(null)
    const ref = searchParams.get('ref')
    const callbackUrl = ref
      ? `${window.location.origin}/auth/callback?ref=${encodeURIComponent(ref)}`
      : `${window.location.origin}/auth/callback`
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: callbackUrl },
    })
    if (error) {
      setError(error.message)
      setOauthLoading(false)
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const { data, error: signUpError } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
      options: {
        data: {
          display_name: form.displayName,
          city: form.city,
          role: form.role,
          signup_lat: form.lat,
          signup_lng: form.lng,
          ...(form.role === 'organizer' && form.businessName
            ? { business_name: form.businessName }
            : {}),
        },
      },
    })

    if (signUpError) {
      setError(signUpError.message)
      setLoading(false)
      return
    }

    if (data.session) {
      // Claim referral immediately if session exists (no email confirmation flow)
      const ref = searchParams.get('ref')
      if (ref) {
        fetch('/api/referral/claim', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: ref }),
        }).catch(() => {})
        // Clear cookie
        document.cookie = 'rawaq_ref=; Path=/; Max-Age=0'
      }
      router.push('/events')
      router.refresh()
      return
    }

    setSuccess(true)
    setLoading(false)
  }

  if (success) {
    return (
      <div className="w-full max-w-sm">
        <div className="card p-8 text-center animate-fade-in">
          <div className="text-5xl mb-4">✉️</div>
          <h2 className="text-lg font-bold text-gray-900 mb-2">{t('auth.check_email_title')}</h2>
          <p className="text-sm text-gray-500">
            {t('auth.check_email_sub')}
          </p>
          <Link href="/login" className="btn-primary mt-6 w-full">{t('auth.sign_in')}</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full max-w-sm">
      <div className="card p-8 animate-fade-in">
        <div className="text-center mb-6">
          <div className="mb-3 flex justify-center"><Image src="/icon.png" alt="Rawaq" width={150} height={52} /></div>
          <h1 className="text-xl font-bold text-gray-900">{t('auth.register_title')}</h1>
          <p className="text-sm text-gray-500 mt-1">{t('auth.register_sub')}</p>
        </div>

        {/* Google Sign-In */}
        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={oauthLoading || loading}
          className="w-full flex items-center justify-center gap-3 border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed mb-4"
        >
          {oauthLoading ? <Spinner size="sm" /> : (
            <>
              <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
                <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
                <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
                <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
                <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
              </svg>
              Continue with Google
            </>
          )}
        </button>

        <div className="relative my-4">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-gray-200" />
          </div>
          <div className="relative flex justify-center text-xs">
            <span className="bg-white px-2 text-gray-400 uppercase tracking-wider">or</span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">{t('auth.display_name')}</label>
            <input
              type="text"
              required
              autoComplete="name"
              value={form.displayName}
              onChange={set('displayName')}
              className="input"
              placeholder="Ahmed Al-Rashid"
            />
          </div>

          <div>
            <label className="label">{t('auth.email')}</label>
            <input
              type="email"
              required
              autoComplete="email"
              value={form.email}
              onChange={set('email')}
              className="input"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label className="label">{t('auth.password')}</label>
            <input
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={form.password}
              onChange={set('password')}
              className="input"
              placeholder="At least 8 characters"
            />
          </div>

          {/* Location auto-detect */}
          <div>
            <label className="label">Location</label>
            {locationState.status === 'detecting' && (
              <div className="flex items-center gap-2 text-sm text-gray-500 bg-gray-50 rounded-xl px-3 py-2.5">
                <Spinner size="sm" />
                <span>Detecting your location…</span>
              </div>
            )}
            {locationState.status === 'detected' && (
              <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-xl px-3 py-2.5">
                📍 {locationState.city || 'Location detected'}
                <span className="text-green-500 text-xs ml-2">✓ Auto-detected</span>
              </div>
            )}
            {locationState.status === 'denied' && (
              <select value={form.city} onChange={set('city')} className="input cursor-pointer">
                <option value="">{t('auth.select_city')}</option>
                {CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            )}
            {locationState.status === 'idle' && (
              <div className="text-sm text-gray-400 bg-gray-50 rounded-xl px-3 py-2.5">
                Waiting for location…
              </div>
            )}
          </div>

          <div>
            <label className="label">{t('auth.role')}</label>
            <div className="grid grid-cols-2 gap-2">
              {(['user', 'organizer'] as const).map((r) => (
                <label
                  key={r}
                  className={`flex items-center gap-2.5 px-4 py-3 rounded-xl border cursor-pointer transition-colors ${
                    form.role === r
                      ? 'border-brand-400 bg-brand-50 text-brand-700'
                      : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <input
                    type="radio"
                    name="role"
                    value={r}
                    checked={form.role === r}
                    onChange={set('role')}
                    className="sr-only"
                  />
                  <span>{r === 'user' ? '👤' : '🏢'}</span>
                  <span className="text-sm font-medium">{t(`auth.role_${r}`)}</span>
                </label>
              ))}
            </div>
            {form.role === 'organizer' && (
              <>
                <p className="text-xs text-amber-600 mt-2 bg-amber-50 rounded-lg px-3 py-2">
                  {t('auth.organizer_note')}
                </p>
                <div className="mt-3">
                  <label className="label">Business / Brand Name</label>
                  <input
                    type="text"
                    value={form.businessName}
                    onChange={set('businessName')}
                    className="input"
                    placeholder="My Events Co."
                  />
                </div>
              </>
            )}
          </div>

          {/* Terms & Conditions */}
          <label className="flex items-start gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={termsAccepted}
              onChange={(e) => setTermsAccepted(e.target.checked)}
              className="mt-0.5 rounded accent-brand-500"
            />
            <span className="text-xs text-gray-500 leading-relaxed">
              {t('auth.terms_agree')}{' '}
              <Link href="/terms" target="_blank" className="text-brand-600 hover:underline font-medium">
                {t('auth.terms_of_service')}
              </Link>
              {' '}{t('auth.and_acknowledge')}{' '}
              <Link href="/privacy" target="_blank" className="text-brand-600 hover:underline font-medium">
                {t('auth.privacy_policy')}
              </Link>
              .
            </span>
          </label>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
              {error}
            </div>
          )}

          <button type="submit" disabled={loading || !termsAccepted} className="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed">
            {loading ? <Spinner size="sm" /> : t('auth.register_btn')}
          </button>
        </form>

        <p className="text-center text-sm text-gray-500 mt-5">
          {t('auth.has_account')}{' '}
          <Link href="/login" className="text-brand-600 font-medium hover:underline">
            {t('auth.sign_in')}
          </Link>
        </p>
      </div>
    </div>
  )
}
