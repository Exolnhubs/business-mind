'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/auth-context'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { Spinner } from '@/components/ui/Spinner'
import type { GenderType } from '@/types/database'

const CITIES = ['Riyadh', 'Jeddah', 'Dammam', 'Mecca', 'Medina', 'Khobar', 'Tabuk', 'Abha', 'Taif']

interface ProfileForm {
  display_name: string
  city: string
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
  const supabase = createSupabaseBrowserClient()

  const [profileForm, setProfileForm] = useState<ProfileForm>({
    display_name: '',
    city: '',
    bio: '',
    gender: '',
    avatar_url: '',
    phone: '',
  })
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

  // Redirect if not logged in
  useEffect(() => {
    if (!authLoading && !user) router.replace('/login')
  }, [authLoading, user, router])

  // Populate form from loaded profile
  useEffect(() => {
    if (!profile) return
    setProfileForm({
      display_name: profile.display_name ?? '',
      city: profile.city ?? '',
      bio: profile.bio ?? '',
      gender: (profile.gender as GenderType | '') ?? '',
      avatar_url: profile.avatar_url ?? '',
      phone: profile.phone ?? '',
    })
  }, [profile])

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

  async function saveProfile(e: FormEvent) {
    e.preventDefault()
    setSavingProfile(true)
    setProfileMsg(null)

    const body: Record<string, unknown> = {
      display_name: profileForm.display_name,
      city: profileForm.city || null,
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
      setProfileMsg({ ok: true, text: 'Profile saved!' })
    } else {
      const { error } = await res.json()
      setProfileMsg({ ok: false, text: error ?? 'Failed to save profile.' })
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
      setOrgMsg({ ok: true, text: 'Business profile saved!' })
    } else {
      const { error } = await res.json().catch(() => ({ error: null }))
      setOrgMsg({ ok: false, text: error ?? 'Failed to save business profile.' })
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

  const setP = (k: keyof ProfileForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setProfileForm((f) => ({ ...f, [k]: e.target.value }))

  const setO = (k: keyof OrganizerForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setOrgForm((f) => ({ ...f, [k]: e.target.value }))

  if (authLoading || !user) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Spinner size="lg" />
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 space-y-8">
      <h1 className="text-2xl font-bold text-gray-900">⚙️ Profile Settings</h1>

      {/* ── Public Profile ────────────────────────────────── */}
      <div className="card p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-5">Public Profile</h2>

        <form onSubmit={saveProfile} className="space-y-4">
          {/* Avatar */}
          <div className="flex items-center gap-4 mb-2">
            <div className="w-14 h-14 rounded-full bg-brand-100 text-brand-700 text-xl font-bold flex items-center justify-center uppercase shrink-0">
              {profileForm.display_name?.[0] ?? user.email?.[0] ?? '?'}
            </div>
            <div className="flex-1">
              <label className="label">Avatar URL</label>
              <input
                type="url"
                value={profileForm.avatar_url}
                onChange={setP('avatar_url')}
                className="input"
                placeholder="https://…"
              />
            </div>
          </div>

          {/* Display name */}
          <div>
            <label className="label">Display Name *</label>
            <input
              type="text"
              required
              minLength={2}
              maxLength={80}
              value={profileForm.display_name}
              onChange={setP('display_name')}
              className="input"
              placeholder="Your name"
            />
          </div>

          {/* City */}
          <div>
            <label className="label">City</label>
            <select value={profileForm.city} onChange={setP('city')} className="input cursor-pointer">
              <option value="">Not specified</option>
              {CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {/* Gender */}
          <div>
            <label className="label">Gender</label>
            {profile?.gender ? (
              <div>
                <input
                  type="text"
                  value={profileForm.gender === 'male' ? 'Male' : profileForm.gender === 'female' ? 'Female' : profileForm.gender}
                  readOnly
                  className="input bg-gray-50 text-gray-500 cursor-default capitalize"
                />
                <p className="text-xs text-gray-400 mt-1">Gender cannot be changed after it has been set.</p>
              </div>
            ) : (
              <select value={profileForm.gender} onChange={setP('gender')} className="input cursor-pointer">
                <option value="">Prefer not to say</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
              </select>
            )}
          </div>

          {/* Bio */}
          <div>
            <label className="label">Bio</label>
            <textarea
              value={profileForm.bio}
              onChange={setP('bio')}
              rows={3}
              maxLength={500}
              className="input resize-none"
              placeholder="Tell others a bit about yourself…"
            />
            <p className="text-xs text-gray-400 mt-1 text-end">{profileForm.bio.length}/500</p>
          </div>

          {/* Phone */}
          <div>
            <label className="label">Phone Number</label>
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
            <label className="label">Email</label>
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
            {savingProfile ? <Spinner size="sm" /> : 'Save Profile'}
          </button>
        </form>
      </div>

      {/* ── Organizer Business Profile ────────────────────── */}
      {profile?.role === 'organizer' && (
        <div className="card p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-1">Business Profile</h2>
          <p className="text-sm text-gray-500 mb-5">Visible on your events and organizer page.</p>

          {loadingOrg ? (
            <div className="flex justify-center py-8"><Spinner /></div>
          ) : (
            <form onSubmit={saveOrganizerProfile} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="label">Business Name (EN) *</label>
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
                  <label className="label">Business Name (AR)</label>
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
                <label className="label">Description (EN)</label>
                <textarea
                  value={orgForm.description}
                  onChange={setO('description')}
                  rows={3}
                  className="input resize-none"
                  placeholder="Tell attendees about your business…"
                />
              </div>

              <div>
                <label className="label">Description (AR)</label>
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
                  <label className="label">Logo URL</label>
                  <input
                    type="url"
                    value={orgForm.logo_url}
                    onChange={setO('logo_url')}
                    className="input"
                    placeholder="https://…"
                  />
                </div>
                <div>
                  <label className="label">Website</label>
                  <input
                    type="url"
                    value={orgForm.website}
                    onChange={setO('website')}
                    className="input"
                    placeholder="https://…"
                  />
                </div>
                <div>
                  <label className="label">Phone</label>
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
                {savingOrg ? <Spinner size="sm" /> : 'Save Business Profile'}
              </button>
            </form>
          )}
        </div>
      )}

      {/* ── My Plan ────────────────────────────────────────── */}
      <div className="card p-6">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-base font-semibold text-gray-900">My Plan</h2>
          <a href="/plans" className="text-sm text-brand-600 hover:text-brand-700 font-medium hover:underline">
            {profile?.plan_id === 'user_free' || profile?.plan_id === 'org_basic' ? '⬆ Upgrade' : 'Manage plan'} →
          </a>
        </div>
        <p className="text-sm text-gray-500 mb-0">
          Current plan:{' '}
          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ml-1 ${
            profile?.plan_id === 'user_premium' ? 'bg-purple-100 text-purple-700' :
            profile?.plan_id === 'org_pro'      ? 'bg-blue-100 text-blue-700'    :
            profile?.plan_id === 'org_elite'    ? 'bg-amber-100 text-amber-700'  :
            'bg-gray-100 text-gray-600'
          }`}>
            {{
              user_free:    'Free',
              user_premium: 'Premium',
              org_basic:    'Basic',
              org_pro:      'Pro',
              org_elite:    'Elite',
            }[profile?.plan_id ?? 'user_free'] ?? profile?.plan_id}
          </span>
        </p>
      </div>

      {/* ── Account Security ───────────────────────────────── */}
      <div className="card p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-1">Account Security</h2>
        <p className="text-sm text-gray-500 mb-4">
          Role: <span className="font-medium capitalize text-gray-700">{profile?.role ?? '—'}</span>
          &nbsp;·&nbsp;
          Member since: <span className="font-medium text-gray-700">
            {profile?.created_at ? new Date(profile.created_at).toLocaleDateString() : '—'}
          </span>
        </p>

        <form onSubmit={handleEmailChange} className="space-y-3">
          <div>
            <label className="label">Change Email</label>
            <p className="text-xs text-gray-400 mb-2">
              Current: <span className="font-medium text-gray-600">{user.email}</span>
            </p>
            <input
              type="email"
              value={emailForm.newEmail}
              onChange={(e) => setEmailForm((f) => ({ ...f, newEmail: e.target.value }))}
              className="input"
              placeholder="new@example.com"
            />
            <p className="text-xs text-gray-400 mt-1">
              A confirmation link will be sent to the new address. Your email won&apos;t change until you click it.
            </p>
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
            {emailForm.loading ? <Spinner size="sm" /> : 'Send Confirmation'}
          </button>
        </form>
      </div>
    </div>
  )
}
