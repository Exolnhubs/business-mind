'use client'

import { useState, type FormEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { useLocale } from '@/contexts/locale-context'
import { Spinner } from '@/components/ui/Spinner'

const CITIES = ['Riyadh', 'Jeddah', 'Dammam', 'Mecca', 'Medina', 'Khobar', 'Tabuk', 'Abha', 'Taif']

export default function RegisterPage() {
  const { t } = useLocale()
  const router = useRouter()
  const supabase = createSupabaseBrowserClient()

  const [form, setForm] = useState({
    email: '',
    password: '',
    displayName: '',
    city: '',
    role: 'user' as 'user' | 'organizer',
  })
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

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
        },
      },
    })

    if (signUpError) {
      setError(signUpError.message)
      setLoading(false)
      return
    }

    // If email confirmation is disabled, session is returned immediately
    if (data.session) {
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
          <div className="text-4xl mb-3">🪄</div>
          <h1 className="text-xl font-bold text-gray-900">{t('auth.register_title')}</h1>
          <p className="text-sm text-gray-500 mt-1">{t('auth.register_sub')}</p>
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

          <div>
            <label className="label">{t('auth.city')}</label>
            <select value={form.city} onChange={set('city')} className="input cursor-pointer">
              <option value="">{t('auth.select_city')}</option>
              {CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
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
              <p className="text-xs text-amber-600 mt-2 bg-amber-50 rounded-lg px-3 py-2">
                {t('auth.organizer_note')}
              </p>
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
