'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/auth-context'
import { useLocale } from '@/contexts/locale-context'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { Spinner } from '@/components/ui/Spinner'
import { FileUpload } from '@/components/ui/FileUpload'
import { PlanStatusCard } from '@/components/plans/PlanStatusCard'
import type { GenderType } from '@/types/database'

interface ProfileForm {
  display_name: string
  bio: string
  gender: GenderType | ''
  avatar_url: string
  phone: string
}

interface OrganizerForm {
  business_name: string
  business_name_ar: string
  description: string
  description_ar: string
  website: string
  phone: string
  logo_url: string
}

export default function ProfilePage() {
  const { user, profile, loading: authLoading, refreshProfile } = useAuth()
  const router = useRouter()
  const { t } = useLocale()
  const supabase = createSupabaseBrowserClient()

  const [profileForm, setProfileForm] = useState<ProfileForm>({
    display_name: '',
    bio: '',
    gender: '',
    avatar_url: '',
    phone: '',
  })
  const [locating, setLocating]   = useState(false)
  const [locMsg, setLocMsg]       = useState<{ ok: boolean; text: string } | null>(null)
  const [emailForm, setEmailForm] = useState({ newEmail: '', loading: false, msg: null as { ok: boolean; text: string } | null })
  const [orgForm, setOrgForm] = useState<OrganizerForm>({
    business_name: '',
    business_name_ar: '',
    description: '',
    description_ar: '',
    website: '',
    phone: '',
    logo_url: '',
  })
  const [savingProfile, setSavingProfile] = useState(false)
  const [savingOrg, setSavingOrg] = useState(false)
  const [profileMsg, setProfileMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [orgMsg, setOrgMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [loadingOrg, setLoadingOrg] = useState(false)

  // Organizer request (for role === 'user')
  const [orgRequest, setOrgRequest] = useState<{
    id: string
    status: string
    business_name: string
  } | null | undefined>(undefined) // undefined = still loading
  const [showOrgForm, setShowOrgForm]           = useState(false)
  const [orgReqForm, setOrgReqForm]             = useState({ business_name: '', description: '' })
  const [submittingOrgReq, setSubmittingOrgReq] = useState(false)
  const [orgReqMsg, setOrgReqMsg]               = useState<{ ok: boolean; text: string } | null>(null)

  // Redirect if not logged in
  useEffect(() => {
    if (!authLoading && !user) router.replace('/login')
  }, [authLoading, user, router])

  // Populate form from loaded profile
  useEffect(() => {
    if (!profile) return
    setProfileForm({
      display_name: profile.display_name ?? '',
      bio: profile.bio ?? '',
      gender: (profile.gender as GenderType | '') ?? '',
      avatar_url: profile.avatar_url ?? '',
      phone: profile.phone ?? '',
    })
  }, [profile])

  // Fetch organizer request status for regular users
  useEffect(() => {
    if (profile?.role !== 'user') return
    fetch('/api/organizer/request')
      .then((r) => r.json())
      .then(({ data }) => setOrgRequest(data ?? null))
  }, [profile?.role])

  // Load organizer profile if applicable
  useEffect(() => {
    if (profile?.role !== 'organizer') return
    setLoadingOrg(true)
    fetch('/api/profiles/me')
      .then((r) => r.json())
      .then(({ data }) => {
        const op = data?.organizer_profile
        if (op) {
          setOrgForm({
            business_name: op.business_name ?? '',
            business_name_ar: op.business_name_ar ?? '',
            description: op.description ?? '',
            description_ar: op.description_ar ?? '',
            website: op.website ?? '',
            phone: op.phone ?? '',
            logo_url: op.logo_url ?? '',
          })
        }
      })
      .finally(() => setLoadingOrg(false))
  }, [profile?.role])

  async function detectLocation() {
    if (!navigator.geolocation) {
      setLocMsg({ ok: false, text: 'Geolocation is not supported by your browser.' })
      return
    }
    setLocating(true)
    setLocMsg(null)
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`,
            { headers: { 'Accept-Language': 'en' } },
          )
          const geo = await res.json()
          const city =
            geo.address?.city ||
            geo.address?.town ||
            geo.address?.village ||
            geo.address?.county ||
            geo.address?.state ||
            null

          const patchRes = await fetch('/api/profiles/me', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ city, lat: latitude, lng: longitude, signup_lat: latitude, signup_lng: longitude }),
          })
          if (patchRes.ok) {
            await refreshProfile()
            setLocMsg({ ok: true, text: `Location set to ${city ?? 'your area'}.` })
          } else {
            const { error } = await patchRes.json()
            setLocMsg({ ok: false, text: error ?? 'Failed to save location.' })
          }
        } catch {
          setLocMsg({ ok: false, text: 'Could not reverse geocode location.' })
        } finally {
          setLocating(false)
        }
      },
      (err) => {
        setLocating(false)
        setLocMsg({ ok: false, text: err.message ?? 'Location access denied.' })
      },
      { timeout: 10000 },
    )
  }

  async function saveProfile(e: FormEvent) {
    e.preventDefault()
    setSavingProfile(true)
    setProfileMsg(null)

    const body: Record<string, unknown> = {
      display_name: profileForm.display_name,
      bio: profileForm.bio || null,
      gender: profileForm.gender || null,
      avatar_url: profileForm.avatar_url || null,
      phone: profileForm.phone || null,
    }

    const res = await fetch('/api/profiles/me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (res.ok) {
      await refreshProfile()
      setProfileMsg({ ok: true, text: t('profile.saved_ok') })
    } else {
      const { error } = await res.json()
      setProfileMsg({ ok: false, text: error ?? t('profile.saved_err') })
    }
    setSavingProfile(false)
  }

  async function saveOrganizerProfile(e: FormEvent) {
    e.preventDefault()
    setSavingOrg(true)
    setOrgMsg(null)

    // organizer_profiles is written via direct supabase call from the browser
    // The API for this lives in a future phase; we call PATCH /api/profiles/me
    // for now with a nested organizer_profile object that the route handles
    // via supabase service client.
    const res = await fetch('/api/organizer/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        business_name: orgForm.business_name,
        business_name_ar: orgForm.business_name_ar || null,
        description: orgForm.description || null,
        description_ar: orgForm.description_ar || null,
        website: orgForm.website || null,
        phone: orgForm.phone || null,
        logo_url: orgForm.logo_url || null,
      }),
    })

    if (res.ok) {
      setOrgMsg({ ok: true, text: t('profile.business_saved_ok') })
    } else {
      const { error } = await res.json().catch(() => ({ error: null }))
      setOrgMsg({ ok: false, text: error ?? t('profile.business_saved_err') })
    }
    setSavingOrg(false)
  }

  async function handleEmailChange(e: FormEvent) {
    e.preventDefault()
    const newEmail = emailForm.newEmail.trim()
    if (!newEmail || newEmail === user?.email) return
    setEmailForm((f) => ({ ...f, loading: true, msg: null }))
    const { error } = await supabase.auth.updateUser({ email: newEmail })
    if (error) {
      setEmailForm((f) => ({ ...f, loading: false, msg: { ok: false, text: error.message } }))
    } else {
      setEmailForm((f) => ({ ...f, loading: false, newEmail: '', msg: { ok: true, text: `Confirmation sent to ${newEmail}. Click the link in that email to confirm the change.` } }))
    }
  }

  async function submitOrgRequest(e: FormEvent) {
    e.preventDefault()
    if (!orgReqForm.business_name.trim()) return
    setSubmittingOrgReq(true)
    setOrgReqMsg(null)
    const res = await fetch('/api/organizer/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        business_name: orgReqForm.business_name.trim(),
        description:   orgReqForm.description.trim() || null,
      }),
    })
    if (res.ok) {
      const { data } = await res.json()
      setOrgRequest(data)
      setShowOrgForm(false)
      setOrgReqMsg(null)
    } else {
      const { error } = await res.json().catch(() => ({ error: null }))
      setOrgReqMsg({ ok: false, text: error ?? 'Failed to submit request.' })
    }
    setSubmittingOrgReq(false)
  }

  const setP = (k: keyof ProfileForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setProfileForm((f) => ({ ...f, [k]: e.target.value }))

  const setO = (k: keyof OrganizerForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setOrgForm((f) => ({ ...f, [k]: e.target.value }))

  if (authLoading) {
    return (
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 space-y-8">
        <div className="skeleton h-8 w-48 rounded" />
        <div className="card p-6 space-y-4">
          <div className="skeleton h-4 w-32 rounded" />
          <div className="flex items-center gap-4">
            <div className="skeleton h-16 w-16 rounded-full shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="skeleton h-3 w-24 rounded" />
              <div className="skeleton h-3 w-40 rounded" />
            </div>
          </div>
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="space-y-1.5">
              <div className="skeleton h-3 w-20 rounded" />
              <div className="skeleton h-10 rounded-xl" />
            </div>
          ))}
          <div className="skeleton h-10 rounded-xl" />
        </div>
        <div className="card p-5 flex items-center justify-between">
          <div className="space-y-2">
            <div className="skeleton h-4 w-28 rounded" />
            <div className="skeleton h-3 w-56 rounded" />
          </div>
          <div className="skeleton h-4 w-4 rounded" />
        </div>
        <div className="card p-6 space-y-4">
          <div className="skeleton h-4 w-24 rounded" />
          <div className="skeleton h-3 w-48 rounded" />
          <div className="skeleton h-10 rounded-xl" />
          <div className="skeleton h-10 w-36 rounded-xl" />
        </div>
      </div>
    )
  }

  if (!user) return null

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 space-y-8">
      <h1 className="text-2xl font-bold text-gray-900">{t('profile.title')}</h1>

      {/* ── Public Profile ────────────────────────────────── */}
      <div className="card p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-5">{t('profile.public_heading')}</h2>

        <form onSubmit={saveProfile} className="space-y-4">
          {/* Avatar */}
          <div className="flex items-center gap-4 mb-2">
            <FileUpload
              type="avatar"
              compact
              value={profileForm.avatar_url || null}
              onChange={(url) => setProfileForm((f) => ({ ...f, avatar_url: url }))}
            />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-gray-700 mb-1">{t('profile.photo_label')}</p>
              <p className="text-xs text-gray-400">{t('profile.photo_hint')}</p>
              {profileForm.avatar_url && (
                <button
                  type="button"
                  onClick={() => setProfileForm((f) => ({ ...f, avatar_url: '' }))}
                  className="text-xs text-red-500 hover:text-red-700 mt-1"
                >
                  {t('profile.remove_photo')}
                </button>
              )}
            </div>
          </div>

          {/* Display name */}
          <div>
            <label className="label">{t('profile.display_name')}</label>
            <input
              type="text"
              required
              minLength={2}
              maxLength={80}
              value={profileForm.display_name}
              onChange={setP('display_name')}
              className="input"
              placeholder={t('profile.display_name')}
            />
          </div>

          {/* City — location-detected, always re-detectable */}
          <div>
            <label className="label">{t('profile.city')}</label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={profile?.city ?? ''}
                readOnly
                placeholder={t('profile.city_placeholder')}
                className="input bg-gray-50 text-gray-500 cursor-default flex-1"
              />
              <button
                type="button"
                onClick={detectLocation}
                disabled={locating}
                title="Detect my current location"
                className="btn-secondary text-sm flex items-center gap-1.5 shrink-0"
              >
                {locating ? <Spinner size="sm" /> : '📍'}
                {locating ? t('profile.detecting') : t('profile.update_location')}
              </button>
            </div>
            {locMsg && (
              <p className={`text-xs mt-1 ${locMsg.ok ? 'text-green-600' : 'text-red-600'}`}>
                {locMsg.text}
              </p>
            )}
          </div>

          {/* Gender */}
          <div>
            <label className="label">{t('profile.gender')}</label>
            {profile?.gender ? (
              <div>
                <input
                  type="text"
                  value={profileForm.gender === 'male' ? t('profile.gender_male') : profileForm.gender === 'female' ? t('profile.gender_female') : profileForm.gender}
                  readOnly
                  className="input bg-gray-50 text-gray-500 cursor-default capitalize"
                />
                <p className="text-xs text-gray-400 mt-1">{t('profile.gender_locked')}</p>
              </div>
            ) : (
              <select value={profileForm.gender} onChange={setP('gender')} className="input cursor-pointer">
                <option value="">{t('profile.gender_prefer_not')}</option>
                <option value="male">{t('profile.gender_male')}</option>
                <option value="female">{t('profile.gender_female')}</option>
              </select>
            )}
          </div>

          {/* Bio */}
          <div>
            <label className="label">{t('profile.bio')}</label>
            <textarea
              value={profileForm.bio}
              onChange={setP('bio')}
              rows={3}
              maxLength={500}
              className="input resize-none"
              placeholder={t('profile.bio_placeholder')}
            />
            <p className="text-xs text-gray-400 mt-1 text-end">{profileForm.bio.length}/500</p>
          </div>

          {/* Phone */}
          <div>
            <label className="label">{t('profile.phone')}</label>
            <input
              type="tel"
              value={profileForm.phone}
              onChange={setP('phone')}
              className="input"
              placeholder="+966 5x xxx xxxx"
              maxLength={20}
            />
          </div>

          {/* Email (read-only) */}
          <div>
            <label className="label">{t('profile.email')}</label>
            <input
              type="email"
              value={user.email ?? ''}
              readOnly
              className="input bg-gray-50 text-gray-400 cursor-default"
            />
          </div>

          {profileMsg && (
            <div className={`text-sm rounded-xl px-4 py-3 ${
              profileMsg.ok
                ? 'bg-green-50 text-green-700 border border-green-200'
                : 'bg-red-50 text-red-700 border border-red-200'
            }`}>
              {profileMsg.text}
            </div>
          )}

          <button type="submit" disabled={savingProfile} className="btn-primary w-full">
            {savingProfile ? <Spinner size="sm" /> : t('profile.save_btn')}
          </button>
        </form>
      </div>

      {/* ── Organizer Business Profile ────────────────────── */}
      {profile?.role === 'organizer' && (
        <div className="card p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-1">{t('profile.business_heading')}</h2>
          <p className="text-sm text-gray-500 mb-5">{t('profile.business_sub')}</p>

          {loadingOrg ? (
            <div className="flex justify-center py-8"><Spinner /></div>
          ) : (
            <form onSubmit={saveOrganizerProfile} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="label">{t('profile.business_name_en')}</label>
                  <input
                    type="text"
                    required
                    value={orgForm.business_name}
                    onChange={setO('business_name')}
                    className="input"
                    placeholder="Fit Zone Gym"
                  />
                </div>
                <div>
                  <label className="label">{t('profile.business_name_ar')}</label>
                  <input
                    type="text"
                    value={orgForm.business_name_ar}
                    onChange={setO('business_name_ar')}
                    className="input"
                    dir="rtl"
                    placeholder="جيم فيت زون"
                  />
                </div>
              </div>

              <div>
                <label className="label">{t('profile.desc_en')}</label>
                <textarea
                  value={orgForm.description}
                  onChange={setO('description')}
                  rows={3}
                  className="input resize-none"
                  placeholder="Tell attendees about your business…"
                />
              </div>

              <div>
                <label className="label">{t('profile.desc_ar')}</label>
                <textarea
                  value={orgForm.description_ar}
                  onChange={setO('description_ar')}
                  rows={3}
                  className="input resize-none"
                  dir="rtl"
                  placeholder="صف نشاطك التجاري للحضور…"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="label">{t('profile.logo_url')}</label>
                  <input
                    type="url"
                    value={orgForm.logo_url}
                    onChange={setO('logo_url')}
                    className="input"
                    placeholder="https://…"
                  />
                </div>
                <div>
                  <label className="label">{t('profile.website')}</label>
                  <input
                    type="url"
                    value={orgForm.website}
                    onChange={setO('website')}
                    className="input"
                    placeholder="https://…"
                  />
                </div>
                <div>
                  <label className="label">{t('profile.phone')}</label>
                  <input
                    type="tel"
                    value={orgForm.phone}
                    onChange={setO('phone')}
                    className="input"
                    placeholder="+966 5x xxx xxxx"
                  />
                </div>
              </div>

              {orgMsg && (
                <div className={`text-sm rounded-xl px-4 py-3 ${
                  orgMsg.ok
                    ? 'bg-green-50 text-green-700 border border-green-200'
                    : 'bg-red-50 text-red-700 border border-red-200'
                }`}>
                  {orgMsg.text}
                </div>
              )}

              <button type="submit" disabled={savingOrg} className="btn-primary w-full">
                {savingOrg ? <Spinner size="sm" /> : t('profile.save_business_btn')}
              </button>
            </form>
          )}
        </div>
      )}

      {/* ── Refer & Earn ──────────────────────────────────── */}
      <a href="/profile/referral" className="card p-5 flex items-center justify-between hover:shadow-md transition-shadow group">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xl">🎁</span>
            <h2 className="text-base font-semibold text-gray-900">{t('profile.refer_earn_title')}</h2>
          </div>
          <p className="text-sm text-gray-500">{t('profile.refer_earn_sub')}</p>
        </div>
        <span className="text-gray-400 group-hover:text-brand-500 text-lg">→</span>
      </a>

      {/* ── My Plan ────────────────────────────────────────── */}
      <PlanStatusCard planId={profile?.plan_id ?? 'user_free'} />

      {/* ── Become an Organizer ───────────────────────────── */}
      {profile?.role === 'user' && orgRequest !== undefined && (
        <div className="card p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-1">{t('profile.become_organizer')}</h2>

          {orgRequest?.status === 'pending' ? (
            <div className="bg-amber-50 text-amber-700 border border-amber-200 rounded-xl px-4 py-3 text-sm">
              {t('profile.pending')}
            </div>
          ) : (
            <>
              <p className="text-sm text-gray-500 mb-4">
                {orgRequest?.status === 'rejected'
                  ? t('profile.rejected')
                  : t('profile.host')}
              </p>

              {!showOrgForm ? (
                <button
                  type="button"
                  onClick={() => { setShowOrgForm(true); setOrgReqMsg(null) }}
                  className="btn-primary"
                >
                  {t('profile.apply_btn')}
                </button>
              ) : (
                <form onSubmit={submitOrgRequest} className="space-y-4">
                  <div>
                    <label className="label">{t('profile.org_name_label')}</label>
                    <input
                      type="text"
                      required
                      minLength={2}
                      maxLength={120}
                      value={orgReqForm.business_name}
                      onChange={(e) => setOrgReqForm((f) => ({ ...f, business_name: e.target.value }))}
                      className="input"
                      placeholder="e.g. Riyadh Sports Club"
                    />
                  </div>
                  <div>
                    <label className="label">{t('profile.org_desc_label')}</label>
                    <textarea
                      value={orgReqForm.description}
                      onChange={(e) => setOrgReqForm((f) => ({ ...f, description: e.target.value }))}
                      rows={3}
                      maxLength={500}
                      className="input resize-none"
                      placeholder="Describe what kind of events you organize…"
                    />
                  </div>
                  {orgReqMsg && (
                    <div className={`text-sm rounded-xl px-4 py-3 ${
                      orgReqMsg.ok
                        ? 'bg-green-50 text-green-700 border border-green-200'
                        : 'bg-red-50 text-red-700 border border-red-200'
                    }`}>
                      {orgReqMsg.text}
                    </div>
                  )}
                  <div className="flex gap-3">
                    <button
                      type="submit"
                      disabled={submittingOrgReq || !orgReqForm.business_name.trim()}
                      className="btn-primary flex-1 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {submittingOrgReq ? <Spinner size="sm" /> : t('profile.submit_request')}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setShowOrgForm(false); setOrgReqMsg(null) }}
                      className="text-sm text-gray-500 hover:text-gray-700 px-3"
                    >
                      {t('common.cancel')}
                    </button>
                  </div>
                </form>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Account Security ───────────────────────────────── */}
      <div className="card p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-1">{t('profile.account_security')}</h2>
        <p className="text-sm text-gray-500 mb-4">
          {t('profile.role_label')} <span className="font-medium capitalize text-gray-700">{profile?.role ?? '—'}</span>
          &nbsp;·&nbsp;
          {t('profile.member_since')} <span className="font-medium text-gray-700">
            {profile?.created_at ? new Date(profile.created_at).toLocaleDateString() : '—'}
          </span>
        </p>

        <form onSubmit={handleEmailChange} className="space-y-3">
          <div>
            <label className="label">{t('profile.change_email')}</label>
            <p className="text-xs text-gray-400 mb-2">
              {t('profile.current_email')} <span className="font-medium text-gray-600">{user.email}</span>
            </p>
            <input
              type="email"
              value={emailForm.newEmail}
              onChange={(e) => setEmailForm((f) => ({ ...f, newEmail: e.target.value }))}
              className="input"
              placeholder="new@example.com"
            />
            <p className="text-xs text-gray-400 mt-1">{t('profile.email_hint')}</p>
          </div>

          {emailForm.msg && (
            <div className={`text-sm rounded-xl px-4 py-3 ${
              emailForm.msg.ok
                ? 'bg-green-50 text-green-700 border border-green-200'
                : 'bg-red-50 text-red-700 border border-red-200'
            }`}>
              {emailForm.msg.text}
            </div>
          )}

          <button
            type="submit"
            disabled={emailForm.loading || !emailForm.newEmail || emailForm.newEmail === user.email}
            className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {emailForm.loading ? <Spinner size="sm" /> : t('profile.send_confirmation')}
          </button>
        </form>
      </div>
    </div>
  )
}
