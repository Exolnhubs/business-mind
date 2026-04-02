'use client'

import { useState, useEffect, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { useAuth } from '@/contexts/auth-context'
import { Spinner } from '@/components/ui/Spinner'
import { FileUpload } from '@/components/ui/FileUpload'
import type { Event, EventCategory, Community, EventVisibility } from '@/types/database'

interface EventFormProps {
  categories: Pick<EventCategory, 'id' | 'name_en' | 'name_ar' | 'icon'>[]
  event?: Event
}

const CITIES = ['Riyadh', 'Jeddah', 'Dammam', 'Mecca', 'Medina', 'Khobar', 'Tabuk', 'Abha', 'Taif']

type TicketDraft = { name: string; is_free: boolean; price: string; capacity: string }

const EMPTY_TICKET: TicketDraft = { name: '', is_free: true, price: '', capacity: '' }

function StepIndicator({ step }: { step: 1 | 2 | 3 }) {
  const steps = ['Event Details', 'Ticket Types', 'Review & Publish']
  return (
    <div className="flex items-center gap-0 mb-8">
      {steps.map((label, i) => {
        const n = (i + 1) as 1 | 2 | 3
        const done = step > n
        const active = step === n
        return (
          <div key={n} className="flex items-center flex-1 last:flex-none">
            <div className="flex items-center gap-2 shrink-0">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors
                ${done ? 'bg-brand-500 text-white' : active ? 'bg-brand-600 text-white ring-4 ring-brand-100' : 'bg-gray-100 text-gray-400'}`}>
                {done ? '✓' : n}
              </div>
              <span className={`text-sm font-medium hidden sm:block ${active ? 'text-gray-900' : done ? 'text-brand-600' : 'text-gray-400'}`}>
                {label}
              </span>
            </div>
            {i < 2 && <div className={`flex-1 h-px mx-3 ${done ? 'bg-brand-400' : 'bg-gray-200'}`} />}
          </div>
        )
      })}
    </div>
  )
}

export function EventForm({ categories, event }: EventFormProps) {
  const { user } = useAuth()
  const router = useRouter()
  const supabase = createSupabaseBrowserClient()
  const isEdit = !!event

  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [createdEventId, setCreatedEventId] = useState<string | null>(null)

  const [form, setForm] = useState({
    title:              event?.title ?? '',
    title_ar:           event?.title_ar ?? '',
    description:        event?.description ?? '',
    description_ar:     event?.description_ar ?? '',
    cover_image_url:    event?.cover_image_url ?? '',
    category_id:        event?.category_id ?? '',
    city:               event?.city ?? '',
    venue_name:         event?.venue_name ?? '',
    address:            event?.address ?? '',
    start_at:           event?.start_at ? event.start_at.slice(0, 16) : '',
    end_at:             event?.end_at ? event.end_at.slice(0, 16) : '',
    capacity:           event?.capacity?.toString() ?? '',
    is_free:            event?.is_free ?? true,
    price:              event?.price?.toString() ?? '',
    gender_restriction: event?.gender_restriction ?? 'mixed',
    is_family_friendly: event?.is_family_friendly ?? false,
    is_published:       event?.is_published ?? false,
  })

  const [tickets, setTickets]         = useState<TicketDraft[]>([{ ...EMPTY_TICKET, name: 'General Admission' }])
  const [loading, setLoading]         = useState(false)
  const [error, setError]             = useState<string | null>(null)
  const [communities, setCommunities] = useState<Pick<Community, 'id' | 'name' | 'level' | 'type'>[]>([])
  const [selectedCommunities, setSelectedCommunities] = useState<string[]>([])
  const [visibilityType, setVisibilityType] = useState<EventVisibility>('city')

  useEffect(() => {
    fetch('/api/communities?per_page=50')
      .then((r) => r.ok ? r.json() : null)
      .then((json) => {
        if (json?.data?.data) setCommunities(json.data.data)
      })
      .catch(() => {})
  }, [])

  const set = (k: keyof typeof form) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const setCheck = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.checked }))

  // ─── Edit mode: single-form UX (unchanged) ──────────────────────────────────
  async function handleEditSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const { error: dbError } = await supabase
      .from('events')
      .update({
        title:              form.title,
        title_ar:           form.title_ar || null,
        description:        form.description || null,
        description_ar:     form.description_ar || null,
        category_id:        form.category_id || null,
        city:               form.city,
        venue_name:         form.venue_name || null,
        address:            form.address || null,
        start_at:           new Date(form.start_at).toISOString(),
        end_at:             form.end_at ? new Date(form.end_at).toISOString() : null,
        capacity:           form.capacity ? Number(form.capacity) : null,
        is_free:            form.is_free,
        price:              form.is_free ? null : Number(form.price),
        currency:           'SAR',
        gender_restriction: form.gender_restriction as 'mixed' | 'male' | 'female',
        is_family_friendly: form.is_family_friendly,
        is_published:       form.is_published,
      })
      .eq('id', event!.id)

    setLoading(false)
    if (dbError) { setError(dbError.message); return }
    router.push('/organizer')
    router.refresh()
  }

  if (isEdit) {
    return (
      <form onSubmit={handleEditSubmit} className="space-y-6">
        <fieldset className="space-y-4">
          <legend className="text-sm font-semibold text-gray-700 mb-2">Event Title</legend>
          <div>
            <label className="label">Title (English) *</label>
            <input type="text" required value={form.title} onChange={set('title')} className="input" />
          </div>
          <div>
            <label className="label">Title (Arabic)</label>
            <input type="text" value={form.title_ar} onChange={set('title_ar')} className="input" dir="rtl" />
          </div>
        </fieldset>

        <div>
          <label className="label">Description</label>
          <textarea rows={4} value={form.description} onChange={set('description')} className="input resize-none" />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Category</label>
            <select value={form.category_id} onChange={set('category_id')} className="input cursor-pointer">
              <option value="">Select category</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.name_en}</option>)}
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

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Venue Name</label>
            <input type="text" value={form.venue_name} onChange={set('venue_name')} className="input" />
          </div>
          <div>
            <label className="label">Address</label>
            <input type="text" value={form.address} onChange={set('address')} className="input" />
          </div>
        </div>

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

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Capacity</label>
            <input type="number" min={1} value={form.capacity} onChange={set('capacity')} className="input" placeholder="Unlimited" />
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

        <div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.is_published} onChange={setCheck('is_published')} className="rounded" />
            <span className="text-sm text-gray-700">Published</span>
          </label>
        </div>

        {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">{error}</div>}

        <div className="flex items-center gap-3 pt-2">
          <button type="submit" disabled={loading} className="btn-primary">
            {loading ? <Spinner size="sm" /> : 'Save Changes'}
          </button>
          <button type="button" onClick={() => router.back()} className="btn-ghost">Cancel</button>
        </div>
      </form>
    )
  }

  // ─── Create wizard ────────────────────────────────────────────────────────────

  // Step 1: create/update draft event, then advance
  async function handleStep1(e: FormEvent) {
    e.preventDefault()
    if (!form.city) { setError('City is required'); return }
    setError(null)
    setLoading(true)

    const payload = {
      organizer_id:       user!.id,
      title:              form.title,
      title_ar:           form.title_ar || null,
      description:        form.description || null,
      description_ar:     form.description_ar || null,
      cover_image_url:    form.cover_image_url || null,
      category_id:        form.category_id || null,
      city:               form.city,
      country:            'SA',
      venue_name:         form.venue_name || null,
      address:            form.address || null,
      start_at:           new Date(form.start_at).toISOString(),
      end_at:             form.end_at ? new Date(form.end_at).toISOString() : null,
      capacity:           form.capacity ? Number(form.capacity) : null,
      is_free:            true,
      currency:           'SAR',
      gender_restriction: form.gender_restriction as 'mixed' | 'male' | 'female',
      is_family_friendly: form.is_family_friendly,
      is_published:       false,
    }

    // If user went back from step 2 and re-submitted step 1, update the existing draft
    if (createdEventId) {
      const { error: dbError } = await supabase
        .from('events')
        .update(payload)
        .eq('id', createdEventId)
      setLoading(false)
      if (dbError) { setError(dbError.message); return }
      setStep(2)
      return
    }

    const { data: newEvent, error: dbError } = await supabase
      .from('events')
      .insert(payload as any)
      .select('id')
      .single()

    setLoading(false)
    if (dbError) { setError(dbError.message); return }
    setCreatedEventId(newEvent.id)
    setStep(2)
  }

  // Step 2: save ticket types, then advance
  async function handleStep2(e: FormEvent) {
    e.preventDefault()
    if (tickets.length === 0) { setError('Add at least one ticket type'); return }
    for (const t of tickets) {
      if (!t.name.trim()) { setError('All ticket types need a name'); return }
      if (!t.is_free && (!t.price || Number(t.price) <= 0)) { setError('Paid ticket types need a price'); return }
    }
    setError(null)
    setLoading(true)

    const allFree = tickets.every((t) => t.is_free)
    const eventId = createdEventId!

    // Delete any previously saved ticket types (handles "Back → re-submit" case)
    await supabase.from('ticket_types').delete().eq('event_id', eventId)

    for (let i = 0; i < tickets.length; i++) {
      const t = tickets[i]
      const { error: dbErr } = await supabase
        .from('ticket_types')
        .insert({
          event_id:   eventId,
          name:       t.name.trim(),
          price:      t.is_free ? 0 : Number(t.price),
          capacity:   t.capacity ? Number(t.capacity) : null,
          is_free:    t.is_free,
          sort_order: i,
        } as any)
      if (dbErr) {
        setError(dbErr.message)
        setLoading(false)
        return
      }
    }

    // Update event is_free to match ticket types
    await supabase.from('events').update({ is_free: allFree }).eq('id', eventId)

    setLoading(false)
    setStep(3)
  }

  // Step 3: publish or save draft (via API to handle community notifications)
  async function finalize(publish: boolean) {
    setLoading(true)
    const res = await fetch(`/api/events/${createdEventId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        is_published:   publish,
        visibility_type: visibilityType,
        community_ids:  selectedCommunities,
      }),
    })
    setLoading(false)
    if (!res.ok) {
      const json = await res.json().catch(() => ({}))
      setError(json?.error ?? 'Failed to save event')
      return
    }
    router.push('/organizer')
    router.refresh()
  }

  function updateTicket(i: number, key: keyof TicketDraft, value: string | boolean) {
    setTickets((prev) => prev.map((t, idx) => idx === i ? { ...t, [key]: value } : t))
  }

  return (
    <div className="space-y-6">
      <StepIndicator step={step} />

      {/* ── Step 1: Event details ─────────────────────────────── */}
      {step === 1 && (
        <form onSubmit={handleStep1} className="space-y-5">
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

          <div>
            <label className="label">Description</label>
            <textarea rows={4} value={form.description} onChange={set('description')} className="input resize-none" placeholder="What's this event about?" />
          </div>

          <FileUpload
            type="event-cover"
            label="Cover Image / Video"
            value={form.cover_image_url || null}
            onChange={(url) => setForm((f) => ({ ...f, cover_image_url: url }))}
          />

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Category</label>
              <select value={form.category_id} onChange={set('category_id')} className="input cursor-pointer">
                <option value="">Select category</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.name_en}</option>)}
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

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Total Capacity</label>
              <input type="number" min={1} value={form.capacity} onChange={set('capacity')} className="input" placeholder="Unlimited" />
            </div>
            <div>
              <label className="label">Gender Restriction</label>
              <select value={form.gender_restriction} onChange={set('gender_restriction')} className="input cursor-pointer">
                <option value="mixed">Mixed</option>
                <option value="male">Men Only</option>
                <option value="female">Women Only</option>
              </select>
            </div>
          </div>

          <div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.is_family_friendly} onChange={setCheck('is_family_friendly')} className="rounded" />
              <span className="text-sm text-gray-700">Family Friendly</span>
            </label>
          </div>

          {/* ── Community tagging ── */}
          <div className="border-t border-gray-100 pt-5 space-y-4">
            <div>
              <label className="label">Visibility</label>
              <select
                value={visibilityType}
                onChange={(e) => setVisibilityType(e.target.value as EventVisibility)}
                className="input cursor-pointer"
              >
                <option value="city">🌆 City — visible to everyone in the city</option>
                <option value="national">🌍 National — visible to everyone on the platform</option>
                <option value="interest">🎯 Interest community — interest group members</option>
                <option value="micro">🏘️ Micro community — compound / university members</option>
              </select>
            </div>

            {communities.length > 0 && (
              <div>
                <label className="label">Tag Communities (optional)</label>
                <p className="text-xs text-gray-400 mb-2">Members of tagged communities will be notified when you publish.</p>
                <div className="flex flex-wrap gap-2">
                  {communities.map((c) => {
                    const selected = selectedCommunities.includes(c.id)
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() =>
                          setSelectedCommunities((prev) =>
                            selected ? prev.filter((id) => id !== c.id) : [...prev, c.id]
                          )
                        }
                        className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-colors ${
                          selected
                            ? 'bg-brand-600 text-white border-brand-600'
                            : 'bg-white text-gray-600 border-gray-200 hover:border-brand-300'
                        }`}
                      >
                        {c.name}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

          {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">{error}</div>}

          <div className="flex items-center gap-3 pt-2">
            <button type="submit" disabled={loading} className="btn-primary">
              {loading ? <Spinner size="sm" /> : 'Next: Add Tickets →'}
            </button>
            <button type="button" onClick={() => router.back()} className="btn-ghost">Cancel</button>
          </div>
        </form>
      )}

      {/* ── Step 2: Ticket types ──────────────────────────────── */}
      {step === 2 && (
        <form onSubmit={handleStep2} className="space-y-5">
          <p className="text-sm text-gray-500">
            Define pricing tiers for your event. You can add multiple types (e.g. Early Bird, General, VIP).
          </p>

          <div className="space-y-3">
            {tickets.map((t, i) => (
              <div key={i} className="card p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-gray-700">Ticket Type {i + 1}</span>
                  {tickets.length > 1 && (
                    <button type="button" onClick={() => setTickets((prev) => prev.filter((_, idx) => idx !== i))}
                      className="text-xs text-red-500 hover:underline">Remove</button>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <label className="label">Name *</label>
                    <input className="input" value={t.name} onChange={(e) => updateTicket(i, 'name', e.target.value)}
                      placeholder="e.g. General Admission" />
                  </div>
                  <div>
                    <label className="label">Price</label>
                    <div className="space-y-2">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={t.is_free}
                          onChange={(e) => updateTicket(i, 'is_free', e.target.checked)}
                          className="rounded" />
                        <span className="text-sm text-gray-700">Free ticket</span>
                      </label>
                      {!t.is_free && (
                        <div className="relative">
                          <span className="absolute start-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">SAR</span>
                          <input type="number" min={1} step={0.01} value={t.price}
                            onChange={(e) => updateTicket(i, 'price', e.target.value)}
                            className="input ps-12" placeholder="0" />
                        </div>
                      )}
                    </div>
                  </div>
                  <div>
                    <label className="label">Capacity</label>
                    <input type="number" min={1} value={t.capacity}
                      onChange={(e) => updateTicket(i, 'capacity', e.target.value)}
                      className="input" placeholder="Unlimited" />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <button type="button" onClick={() => setTickets((prev) => [...prev, { ...EMPTY_TICKET }])}
            className="text-sm text-brand-600 hover:underline font-medium">
            + Add another ticket type
          </button>

          {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">{error}</div>}

          <div className="flex items-center gap-3 pt-2">
            <button type="submit" disabled={loading} className="btn-primary">
              {loading ? <Spinner size="sm" /> : 'Next: Review →'}
            </button>
            <button type="button" onClick={() => { setStep(1); setError(null) }} className="btn-ghost">← Back</button>
          </div>
        </form>
      )}

      {/* ── Step 3: Review & publish ──────────────────────────── */}
      {step === 3 && (
        <div className="space-y-5">
          <div className="card p-5 space-y-4">
            <h2 className="text-base font-semibold text-gray-900">Event Summary</h2>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
              <div>
                <dt className="text-gray-500 text-xs font-medium uppercase tracking-wide">Title</dt>
                <dd className="text-gray-900 font-medium mt-0.5">{form.title}</dd>
              </div>
              <div>
                <dt className="text-gray-500 text-xs font-medium uppercase tracking-wide">City</dt>
                <dd className="text-gray-900 font-medium mt-0.5">{form.city}</dd>
              </div>
              <div>
                <dt className="text-gray-500 text-xs font-medium uppercase tracking-wide">Start</dt>
                <dd className="text-gray-900 font-medium mt-0.5">{new Date(form.start_at).toLocaleString()}</dd>
              </div>
              {form.venue_name && (
                <div>
                  <dt className="text-gray-500 text-xs font-medium uppercase tracking-wide">Venue</dt>
                  <dd className="text-gray-900 font-medium mt-0.5">{form.venue_name}</dd>
                </div>
              )}
            </dl>

            {selectedCommunities.length > 0 && (
              <div className="col-span-2">
                <dt className="text-gray-500 text-xs font-medium uppercase tracking-wide">Communities</dt>
                <dd className="text-gray-900 font-medium mt-0.5 text-sm">
                  {communities.filter((c) => selectedCommunities.includes(c.id)).map((c) => c.name).join(', ')}
                </dd>
              </div>
            )}
            <div className="col-span-2">
              <dt className="text-gray-500 text-xs font-medium uppercase tracking-wide">Visibility</dt>
              <dd className="text-gray-900 font-medium mt-0.5 text-sm capitalize">{visibilityType}</dd>
            </div>

            <div>
              <dt className="text-gray-500 text-xs font-medium uppercase tracking-wide mb-2">Ticket Types</dt>
              <div className="space-y-1.5">
                {tickets.map((t, i) => (
                  <div key={i} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 text-sm">
                    <span className="font-medium text-gray-900">{t.name}</span>
                    <span className="text-brand-700 font-semibold">
                      {t.is_free ? 'Free' : `SAR ${t.price}`}
                      {t.capacity ? ` · ${t.capacity} cap` : ''}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">{error}</div>}

          <div className="flex items-center gap-3 pt-2">
            <button onClick={() => finalize(true)} disabled={loading} className="btn-primary">
              {loading ? <Spinner size="sm" /> : 'Publish Event'}
            </button>
            <button onClick={() => finalize(false)} disabled={loading} className="btn-secondary">
              Save as Draft
            </button>
            <button type="button" onClick={() => { setStep(2); setError(null) }} className="btn-ghost">← Back</button>
          </div>
        </div>
      )}
    </div>
  )
}
