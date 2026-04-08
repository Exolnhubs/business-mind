'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/contexts/auth-context'
import type { Community, CommunityLevel, CommunityType } from '@/types/database'

const LEVEL_OPTIONS: Array<{
  value: CommunityLevel
  label: string
  description: string
  adminOnly?: boolean
}> = [
  { value: 'micro', label: 'Micro', description: 'A local circle like a compound, building, campus, or group of friends.' },
  { value: 'interest', label: 'Interest', description: 'A shared hobby, topic, or identity community.' },
  { value: 'district', label: 'District', description: 'A neighborhood or district community. It starts unverified.' },
  { value: 'city', label: 'City', description: 'A city-wide community curated by the platform.', adminOnly: true },
  { value: 'country', label: 'Country', description: 'A national community managed by the platform.', adminOnly: true },
]

const TYPE_OPTIONS: Array<{ value: CommunityType; label: string }> = [
  { value: 'compound', label: 'Compound' },
  { value: 'neighborhood', label: 'Neighborhood' },
  { value: 'university', label: 'University' },
  { value: 'company', label: 'Company' },
  { value: 'coworking', label: 'Coworking' },
  { value: 'tech', label: 'Tech' },
  { value: 'sports', label: 'Sports' },
  { value: 'gaming', label: 'Gaming' },
  { value: 'book_club', label: 'Book Club' },
  { value: 'entrepreneur', label: 'Entrepreneur' },
  { value: 'arts', label: 'Arts' },
  { value: 'other', label: 'Other' },
  { value: 'district', label: 'District' },
  { value: 'city', label: 'City' },
  { value: 'country', label: 'Country' },
]

type CommunityPickerItem = Pick<Community, 'id' | 'slug' | 'name' | 'name_ar' | 'level'>

export default function NewCommunityPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, profile, loading } = useAuth()
  const isAdmin = profile?.role === 'admin'
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [parentQuery, setParentQuery] = useState('')
  const [parentSuggestions, setParentSuggestions] = useState<CommunityPickerItem[]>([])
  const [parentCommunity, setParentCommunity] = useState<CommunityPickerItem | null>(null)
  const [form, setForm] = useState({
    name: '',
    name_ar: '',
    description: '',
    description_ar: '',
    level: 'micro' as CommunityLevel,
    type: 'compound' as CommunityType,
    city: '',
    cover_url: '',
    is_private: false,
    country: 'SA',
  })
  const presetParentSlug = searchParams.get('parent')

  const visibleLevels = useMemo(
    () => LEVEL_OPTIONS.filter((option) => !option.adminOnly || isAdmin),
    [isAdmin],
  )

  useEffect(() => {
    if (!presetParentSlug) return
    fetch(`/api/communities/${presetParentSlug}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        const community = json?.data as CommunityPickerItem | undefined
        if (!community) return
        setParentCommunity(community)
        setParentQuery(community.name)
      })
      .catch(() => {})
  }, [presetParentSlug])

  useEffect(() => {
    const query = parentQuery.trim()
    if (!query || parentCommunity?.name === query || parentCommunity?.name_ar === query) {
      setParentSuggestions([])
      return
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => {
      fetch(`/api/communities?q=${encodeURIComponent(query)}&per_page=6`, { signal: controller.signal })
        .then((res) => (res.ok ? res.json() : null))
        .then((json) => setParentSuggestions((json?.data ?? []) as CommunityPickerItem[]))
        .catch(() => {})
    }, 180)

    return () => {
      controller.abort()
      clearTimeout(timeout)
    }
  }, [parentQuery, parentCommunity])

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!user) {
      router.push('/login')
      return
    }

    setSubmitting(true)
    setError(null)

    const res = await fetch('/api/communities', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: form.name,
        name_ar: form.name_ar || null,
        description: form.description || null,
        description_ar: form.description_ar || null,
        level: form.level,
        type: form.type,
        city: form.city || null,
        country: form.country,
        cover_url: form.cover_url || null,
        is_private: form.is_private,
        parent_slug: parentCommunity?.slug ?? null,
      }),
    })

    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      setError(
        res.status === 429
          ? "You've created 3 communities this month. You can create more after 30 days from your oldest recent community."
          : (json.error ?? 'Unable to create community')
      )
      setSubmitting(false)
      return
    }

    const slug = json.data?.slug as string | undefined
    router.push(slug ? `/communities/${slug}` : '/communities')
  }

  if (loading) {
    return <div className="mx-auto max-w-4xl px-4 py-12 text-sm text-gray-500">Loading...</div>
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12">
        <div className="rounded-3xl border border-gray-200 bg-white p-8 shadow-sm">
          <h1 className="text-2xl font-bold text-gray-900">Create a Community</h1>
          <p className="mt-2 text-sm text-gray-600">You need to sign in before creating a community.</p>
          <button onClick={() => router.push('/login')} className="mt-6 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white">
            Sign in
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <div className="mb-8">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-600">Communities</p>
        <h1 className="mt-2 text-3xl font-bold text-gray-900">Create a Community</h1>
        <p className="mt-2 max-w-2xl text-sm text-gray-600">
          Start a local circle or interest group and become its first owner.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">Identity</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-gray-700">Name</span>
              <input
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none transition focus:border-brand-400"
                required
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-gray-700">Name in Arabic</span>
              <input
                value={form.name_ar}
                onChange={(e) => setForm((prev) => ({ ...prev, name_ar: e.target.value }))}
                className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none transition focus:border-brand-400"
                dir="rtl"
              />
            </label>
          </div>

          <div className="mt-5">
            <span className="mb-3 block text-sm font-medium text-gray-700">Community level</span>
            <div className="grid gap-3 sm:grid-cols-2">
              {visibleLevels.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setForm((prev) => ({ ...prev, level: option.value }))}
                  className={`rounded-2xl border p-4 text-left transition ${
                    form.level === option.value
                      ? 'border-brand-500 bg-brand-50'
                      : 'border-gray-200 bg-white hover:border-brand-200'
                  }`}
                >
                  <div className="text-sm font-semibold text-gray-900">{option.label}</div>
                  <div className="mt-1 text-xs leading-5 text-gray-500">{option.description}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="mt-5">
            <span className="mb-2 block text-sm font-medium text-gray-700">Parent community</span>
            <input
              value={parentQuery}
              onChange={(e) => {
                setParentQuery(e.target.value)
                if (!e.target.value.trim()) setParentCommunity(null)
              }}
              placeholder="Search for an optional parent community"
              className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none transition focus:border-brand-400"
            />
            {parentCommunity && (
              <div className="mt-2 flex items-center justify-between rounded-2xl border border-brand-100 bg-brand-50 px-4 py-3 text-sm text-brand-700">
                <span>{parentCommunity.name} · {parentCommunity.level}</span>
                <button
                  type="button"
                  onClick={() => {
                    setParentCommunity(null)
                    setParentQuery('')
                  }}
                  className="font-semibold"
                >
                  Clear
                </button>
              </div>
            )}
            {!parentCommunity && parentSuggestions.length > 0 && (
              <div className="mt-2 overflow-hidden rounded-2xl border border-gray-200 bg-white">
                {parentSuggestions.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => {
                      setParentCommunity(option)
                      setParentQuery(option.name)
                      setParentSuggestions([])
                    }}
                    className="flex w-full items-center justify-between border-b border-gray-100 px-4 py-3 text-left last:border-b-0 hover:bg-gray-50"
                  >
                    <span className="text-sm font-medium text-gray-900">{option.name}</span>
                    <span className="text-xs text-gray-500">{option.level}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">About</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="block sm:col-span-2">
              <span className="mb-2 block text-sm font-medium text-gray-700">Description</span>
              <textarea
                value={form.description}
                onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                className="min-h-[120px] w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none transition focus:border-brand-400"
                maxLength={2000}
              />
            </label>
            <label className="block sm:col-span-2">
              <span className="mb-2 block text-sm font-medium text-gray-700">Description in Arabic</span>
              <textarea
                value={form.description_ar}
                onChange={(e) => setForm((prev) => ({ ...prev, description_ar: e.target.value }))}
                className="min-h-[120px] w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none transition focus:border-brand-400"
                dir="rtl"
                maxLength={2000}
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-gray-700">Type</span>
              <select
                value={form.type}
                onChange={(e) => setForm((prev) => ({ ...prev, type: e.target.value as CommunityType }))}
                className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none transition focus:border-brand-400"
              >
                {TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-gray-700">City</span>
              <input
                value={form.city}
                onChange={(e) => setForm((prev) => ({ ...prev, city: e.target.value }))}
                className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none transition focus:border-brand-400"
              />
            </label>
          </div>
        </section>

        <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">Settings</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="flex items-start gap-3 rounded-2xl border border-gray-200 p-4">
              <input
                type="checkbox"
                checked={form.is_private}
                onChange={(e) => setForm((prev) => ({ ...prev, is_private: e.target.checked }))}
                className="mt-1"
              />
              <span>
                <span className="block text-sm font-medium text-gray-900">Private community</span>
                <span className="mt-1 block text-xs leading-5 text-gray-500">Members need approval to join.</span>
              </span>
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-gray-700">Cover image URL</span>
              <input
                value={form.cover_url}
                onChange={(e) => setForm((prev) => ({ ...prev, cover_url: e.target.value }))}
                className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none transition focus:border-brand-400"
                placeholder="https://..."
              />
            </label>
          </div>
        </section>

        {error && (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        )}

        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={() => router.push('/communities')}
            className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
          >
            {submitting ? 'Creating...' : 'Create Community'}
          </button>
        </div>
      </form>
    </div>
  )
}
