'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/auth-context'
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
            <FileUpload
              type="avatar"
              compact
              value={profileForm.avatar_url || null}
              onChange={(url) => setProfileForm((f) => ({ ...f, avatar_url: url }))}
            />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-gray-700 mb-1">Profile Photo</p>
              <p className="text-xs text-gray-400">Click the circle to upload. JPG, PNG, WEBP · max 5 MB</p>
              {profileForm.avatar_url && (
                <button
                  type="button"
                  onClick={() => setProfileForm((f) => ({ ...f, avatar_url: '' }))}
                  className="text-xs text-red-500 hover:text-red-700 mt-1"
                >
                  Remove photo
                </button>
              )}
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

          {/* City — location-detected, always re-detectable */}
          <div>
            <label className="label">City</label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={profile?.city ?? ''}
                readOnly
                placeholder="Not set — tap 📍 to detect"
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
                {locating ? 'Detecting…' : 'Update'}
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

      {/* ── Refer & Earn ──────────────────────────────────── */}
      <a href="/profile/referral" className="card p-5 flex items-center justify-between hover:shadow-md transition-shadow group">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xl">🎁</span>
            <h2 className="text-base font-semibold text-gray-900">Refer &amp; Earn</h2>
          </div>
          <p className="text-sm text-gray-500">Invite friends with your link · earn 15% and 25% discount coupons</p>
        </div>
        <span className="text-gray-400 group-hover:text-brand-500 text-lg">→</span>
      </a>

      {/* ── My Plan ────────────────────────────────────────── */}
      <PlanStatusCard planId={profile?.plan_id ?? 'user_free'} />

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
