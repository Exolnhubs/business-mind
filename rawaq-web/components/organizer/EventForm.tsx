'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { useAuth } from '@/contexts/auth-context'
import { Spinner } from '@/components/ui/Spinner'
import type { Event, EventCategory } from '@/types/database'

interface EventFormProps {
  categories: Pick<EventCategory, 'id' | 'name_en' | 'name_ar' | 'icon'>[]
  event?: Event
}

const CITIES = ['Riyadh', 'Jeddah', 'Dammam', 'Mecca', 'Medina', 'Khobar', 'Tabuk', 'Abha', 'Taif']

export function EventForm({ categories, event }: EventFormProps) {
  const { user } = useAuth()
  const router = useRouter()
  const supabase = createSupabaseBrowserClient()
  const isEdit = !!event

  const [form, setForm] = useState({
    title: event?.title ?? '',
    title_ar: event?.title_ar ?? '',
    description: event?.description ?? '',
    description_ar: event?.description_ar ?? '',
    category_id: event?.category_id ?? '',
    city: event?.city ?? '',
    venue_name: event?.venue_name ?? '',
    address: event?.address ?? '',
    start_at: event?.start_at ? event.start_at.slice(0, 16) : '',
    end_at: event?.end_at ? event.end_at.slice(0, 16) : '',
    capacity: event?.capacity?.toString() ?? '',
    is_free: event?.is_free ?? true,
    price: event?.price?.toString() ?? '',
    gender_restriction: event?.gender_restriction ?? 'mixed',
    is_family_friendly: event?.is_family_friendly ?? false,
    is_published: event?.is_published ?? false,
  })

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const set = (k: keyof typeof form) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const setCheck = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.checked }))

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const payload = {
      organizer_id: user!.id,
      title: form.title,
      title_ar: form.title_ar || null,
      description: form.description || null,
      description_ar: form.description_ar || null,
      category_id: form.category_id || null,
      city: form.city,
      country: 'SA',
      venue_name: form.venue_name || null,
      address: form.address || null,
      start_at: new Date(form.start_at).toISOString(),
      end_at: form.end_at ? new Date(form.end_at).toISOString() : null,
      capacity: form.capacity ? Number(form.capacity) : null,
      is_free: form.is_free,
      price: form.is_free ? null : Number(form.price),
      currency: 'SAR',
      gender_restriction: form.gender_restriction as 'mixed' | 'male' | 'female',
      is_family_friendly: form.is_family_friendly,
      is_published: form.is_published,
    }

    let error: { message: string } | null = null

    if (isEdit) {
      const { error: e } = await supabase.from('events').update(payload).eq('id', event!.id)
      error = e
    } else {
      const { error: e } = await supabase.from('events').insert(payload)
      error = e
    }

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    router.push('/organizer')
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Titles */}
      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold text-gray-700 mb-2">Event Title</legend>
        <div>
          <label className="label">Title (English) *</label>
          <input type="text" required value={form.title} onChange={set('title')} className="input" placeholder="Community Coding Night" />
        </div>
        <div>
          <label className="label">Title (Arabic)</label>
          <input type="text" value={form.title_ar} onChange={set('title_ar')} className="input" dir="rtl" placeholder="ليلة البرمجة المجتمعية" />
        </div>
      </fieldset>

      {/* Description */}
      <div>
        <label className="label">Description</label>
        <textarea rows={4} value={form.description} onChange={set('description')} className="input resize-none" placeholder="What's this event about?" />
      </div>

      {/* Category & City */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Category</label>
          <select value={form.category_id} onChange={set('category_id')} className="input cursor-pointer">
            <option value="">Select category</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.icon} {c.name_en}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">City *</label>
          <select required value={form.city} onChange={set('city')} className="input cursor-pointer">
            <option value="">Select city</option>
            {CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>

      {/* Venue */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Venue Name</label>
          <input type="text" value={form.venue_name} onChange={set('venue_name')} className="input" placeholder="King Abdullah Park" />
        </div>
        <div>
          <label className="label">Address</label>
          <input type="text" value={form.address} onChange={set('address')} className="input" placeholder="King Fahd Road" />
        </div>
      </div>

      {/* Date & Time */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Start Date & Time *</label>
          <input type="datetime-local" required value={form.start_at} onChange={set('start_at')} className="input" />
        </div>
        <div>
          <label className="label">End Date & Time</label>
          <input type="datetime-local" value={form.end_at} onChange={set('end_at')} className="input" />
        </div>
      </div>

      {/* Capacity & Price */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Capacity (leave blank = unlimited)</label>
          <input type="number" min={1} value={form.capacity} onChange={set('capacity')} className="input" placeholder="100" />
        </div>
        <div>
          <label className="label">Price</label>
          <div className="space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.is_free} onChange={setCheck('is_free')} className="rounded" />
              <span className="text-sm text-gray-700">Free event</span>
            </label>
            {!form.is_free && (
              <div className="relative">
                <span className="absolute start-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">SAR</span>
                <input type="number" min={0} value={form.price} onChange={set('price')} className="input ps-12" placeholder="0" />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Restrictions */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Gender Restriction</label>
          <select value={form.gender_restriction} onChange={set('gender_restriction')} className="input cursor-pointer">
            <option value="mixed">Mixed</option>
            <option value="male">Men Only</option>
            <option value="female">Women Only</option>
          </select>
        </div>
        <div className="flex items-end pb-2.5">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.is_family_friendly} onChange={setCheck('is_family_friendly')} className="rounded" />
            <span className="text-sm text-gray-700">Family Friendly</span>
          </label>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
          {error}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={loading}
          onClick={() => setForm((f) => ({ ...f, is_published: true }))}
          className="btn-primary"
        >
          {loading ? <Spinner size="sm" /> : isEdit ? 'Save Changes' : 'Publish Event'}
        </button>
        {!isEdit && (
          <button
            type="submit"
            disabled={loading}
            onClick={() => setForm((f) => ({ ...f, is_published: false }))}
            className="btn-secondary"
          >
            Save as Draft
          </button>
        )}
        <button type="button" onClick={() => router.back()} className="btn-ghost">
          Cancel
        </button>
      </div>
    </form>
  )
}
