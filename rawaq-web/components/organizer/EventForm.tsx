'use client'

import { useState, useEffect, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { useAuth } from '@/contexts/auth-context'
import { Spinner } from '@/components/ui/Spinner'
import { FileUpload } from '@/components/ui/FileUpload'
import { LocationPickerModal, type PickedLocation } from '@/components/communities/LocationPickerModal'
import { EventOccurrencesManager } from '@/components/organizer/EventOccurrencesManager'
import type { Event, EventCategory, Community, EventFrequency, EventVisibility } from '@/types/database'

interface EventFormProps {
  categories: Pick<EventCategory, 'id' | 'name_en' | 'name_ar' | 'icon'>[]
  event?: Event
  initialCommunityIds?: string[]
}

interface SubscriptionResponse {
  plan: {
    name: string
    attendees_per_event: number | null
  } | null
}

type TicketDraft = { name: string; is_free: boolean; price: string; capacity: string }

const EMPTY_TICKET: TicketDraft = { name: '', is_free: true, price: '', capacity: '' }
const EVENT_FREQUENCY_OPTIONS: ReadonlyArray<{ value: EventFrequency; label: string }> = [
  { value: 'one_time', label: 'One Time' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
]

function getCurrencyFromCountryCode(country: string | null | undefined): string {
  const normalized = country?.trim().toUpperCase()
  if (!normalized) return 'SAR'
  if (['SAR', 'EGP', 'AED', 'KWD', 'QAR', 'BHD', 'OMR', 'JOD', 'USD', 'GBP', 'EUR'].includes(normalized)) {
    return normalized
  }
  const map: Record<string, string> = {
    SA: 'SAR',
    'SAUDI ARABIA': 'SAR',
    KSA: 'SAR',
    EG: 'EGP',
    EGYPT: 'EGP',
    AE: 'AED',
    UAE: 'AED',
    'UNITED ARAB EMIRATES': 'AED',
    KW: 'KWD',
    KUWAIT: 'KWD',
    QA: 'QAR',
    QATAR: 'QAR',
    BH: 'BHD',
    BAHRAIN: 'BHD',
    OM: 'OMR',
    OMAN: 'OMR',
    JO: 'JOD',
    JORDAN: 'JOD',
    US: 'USD',
    USA: 'USD',
    'UNITED STATES': 'USD',
    GB: 'GBP',
    UK: 'GBP',
    'UNITED KINGDOM': 'GBP',
    EU: 'EUR',
    DE: 'EUR',
    FR: 'EUR',
  }

  return map[normalized] ?? 'SAR'
}

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

export function EventForm({ categories, event, initialCommunityIds = [] }: EventFormProps) {
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
    country:            event?.country ?? 'SA',
    lat:                event?.lat ?? null,
    lng:                event?.lng ?? null,
    venue_name:         event?.venue_name ?? '',
    address:            event?.address ?? '',
    start_at:           event?.start_at ? event.start_at.slice(0, 16) : '',
    end_at:             event?.end_at ? event.end_at.slice(0, 16) : '',
    event_frequency:    event?.event_frequency ?? 'one_time',
    recurrence_until:   event?.recurrence_until ? event.recurrence_until.slice(0, 16) : '',
    capacity:           event?.capacity?.toString() ?? '',
    max_group_size:     event?.max_group_size?.toString() ?? '',
    is_free:            event?.is_free ?? true,
    price:              event?.price?.toString() ?? '',
    gender_restriction: event?.gender_restriction ?? 'mixed',
    is_family_friendly: event?.is_family_friendly ?? false,
    is_published:       event?.is_published ?? false,
  })
  const eventCurrency = getCurrencyFromCountryCode(form.country || event?.country || event?.currency)
  const shouldShowRecurrenceUntil = form.event_frequency !== 'one_time'

  const [tickets, setTickets]         = useState<TicketDraft[]>([{ ...EMPTY_TICKET, name: 'General Admission' }])
  const [loading, setLoading]         = useState(false)
  const [error, setError]             = useState<string | null>(null)
  const [attendeePlanLimit, setAttendeePlanLimit] = useState<number | null>(null)
  const [attendeePlanName, setAttendeePlanName] = useState('your current plan')
  const [showLocationPicker, setShowLocationPicker] = useState(false)
  const [communities, setCommunities] = useState<Pick<Community, 'id' | 'name' | 'level' | 'type'>[]>([])
  const [selectedCommunities, setSelectedCommunities] = useState<string[]>(initialCommunityIds)
  const [visibilityType, setVisibilityType] = useState<EventVisibility>(event?.visibility_type ?? 'city')
  const [selectedLocation, setSelectedLocation] = useState<PickedLocation | null>(
    event && event.lat !== null && event.lng !== null
      ? {
          lat: event.lat,
          lng: event.lng,
          label: event.address ?? [event.venue_name, event.city].filter(Boolean).join(', '),
          address: event.address ?? [event.venue_name, event.city].filter(Boolean).join(', '),
          city: event.city,
          country: event.country,
          countryCode: event.country,
        }
      : null,
  )

  useEffect(() => {
    fetch('/api/communities?per_page=50')
      .then((r) => r.ok ? r.json() : null)
      .then((json) => {
        if (json?.data?.data) setCommunities(json.data.data)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!user) return

    fetch('/api/subscriptions')
      .then((response) => (response.ok ? response.json() : null))
      .then((json: { data?: SubscriptionResponse } | null) => {
        const plan = json?.data?.plan
        setAttendeePlanLimit(plan?.attendees_per_event ?? null)
        setAttendeePlanName(plan?.name ?? 'your current plan')
      })
      .catch(() => {})
  }, [user])

  const set = (k: keyof typeof form) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const setCheck = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.checked }))

  function validateDateOrder(startValue: string, endValue: string): string | null {
    if (!startValue || !endValue) return null
    const parsedStart = new Date(startValue)
    const parsedEnd = new Date(endValue)
    if (Number.isNaN(parsedStart.getTime()) || Number.isNaN(parsedEnd.getTime())) return null
    return parsedEnd.getTime() < parsedStart.getTime()
      ? 'End date cannot be before the start date.'
      : null
  }

  function setDateField(field: 'start_at' | 'end_at') {
    return (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value
      setForm((current) => {
        if (field === 'start_at') {
          const nextEnd =
            current.end_at && value && new Date(current.end_at).getTime() < new Date(value).getTime()
              ? value
              : current.end_at
          return { ...current, start_at: value, end_at: nextEnd }
        }

        const nextEnd =
          value && current.start_at && new Date(value).getTime() < new Date(current.start_at).getTime()
            ? current.start_at
            : value
        return { ...current, end_at: nextEnd }
      })
    }
  }

  function applyPickedLocation(location: PickedLocation | null) {
    setSelectedLocation(location)
    setForm((f) => ({
      ...f,
      city: location?.city ?? '',
      country: location?.countryCode || 'SA',
      address: location?.address ?? '',
      lat: location?.lat ?? null,
      lng: location?.lng ?? null,
    }))
  }

  const locationSummary = selectedLocation
    ? {
        title: selectedLocation.address || selectedLocation.label,
        meta: [selectedLocation.city, selectedLocation.country || selectedLocation.countryCode].filter(Boolean).join(' · '),
        coordinates: `${selectedLocation.lat.toFixed(5)}, ${selectedLocation.lng.toFixed(5)}`,
      }
    : form.address || form.city
      ? {
          title: form.address || form.city,
          meta: [form.city, form.country].filter(Boolean).join(' · '),
          coordinates: form.lat !== null && form.lng !== null ? `${form.lat.toFixed(5)}, ${form.lng.toFixed(5)}` : '',
        }
      : null

  const capacityHelperText = attendeePlanLimit !== null
    ? `${attendeePlanName} allows up to ${attendeePlanLimit} attendees per event.`
    : 'Your current plan does not have an attendee cap.'

  function validateCapacity(value: string): string | null {
    if (!value.trim()) return null
    const parsed = Number(value)
    if (!Number.isFinite(parsed) || parsed <= 0) return 'Capacity must be greater than 0.'
    if (attendeePlanLimit !== null && parsed > attendeePlanLimit) {
      return `${attendeePlanName} allows up to ${attendeePlanLimit} attendees per event.`
    }
    return null
  }

  function getEffectiveTicketCapacityLimit(): number | null {
    if (form.capacity.trim()) {
      const parsed = Number(form.capacity)
      return Number.isFinite(parsed) && parsed > 0 ? parsed : null
    }
    return attendeePlanLimit
  }

  function validateTicketCapacities(drafts: TicketDraft[]): string | null {
    const effectiveLimit = getEffectiveTicketCapacityLimit()
    let totalTicketCapacity = 0

    for (const draft of drafts) {
      const ticketLabel = draft.name.trim() || 'Untitled ticket'
      if (!draft.capacity.trim()) {
        if (effectiveLimit !== null) {
          return `Ticket "${ticketLabel}" needs a capacity because this event is capped at ${effectiveLimit} attendees.`
        }
        continue
      }

      const parsedCapacity = Number(draft.capacity)
      if (!Number.isFinite(parsedCapacity) || parsedCapacity <= 0) {
        return `Ticket "${ticketLabel}" capacity must be greater than 0.`
      }

      if (effectiveLimit !== null && parsedCapacity > effectiveLimit) {
        return `Ticket "${ticketLabel}" cannot exceed ${effectiveLimit} attendees.`
      }

      totalTicketCapacity += parsedCapacity
    }

    if (effectiveLimit !== null && totalTicketCapacity > effectiveLimit) {
      return `Combined ticket capacities cannot exceed ${effectiveLimit} attendees.`
    }

    return null
  }

  const ticketCapacityHelperText = (() => {
    const effectiveLimit = getEffectiveTicketCapacityLimit()
    if (effectiveLimit !== null) {
      return `Ticket capacities must stay within ${effectiveLimit} total attendees.`
    }
    return 'Leave blank only when the event itself has no attendee cap.'
  })()

  function getEventRowPriceFromTickets(drafts: TicketDraft[]): number {
    const paidPrices = drafts
      .filter((draft) => !draft.is_free)
      .map((draft) => Number(draft.price))
      .filter((price) => Number.isFinite(price) && price > 0)

    return paidPrices.length > 0 ? Math.min(...paidPrices) : 0
  }

  // ─── Edit mode: single-form UX (unchanged) ──────────────────────────────────
  async function handleEditSubmit(e: FormEvent) {
    e.preventDefault()
    if (!form.city || !form.address || form.lat === null || form.lng === null) {
      setError('Pick the event location from the map.')
      return
    }
    const capacityError = validateCapacity(form.capacity)
    if (capacityError) {
      setError(capacityError)
      return
    }
    const dateOrderError = validateDateOrder(form.start_at, form.end_at)
    if (dateOrderError) {
      setError(dateOrderError)
      return
    }
    setError(null)
    setLoading(true)

    const res = await fetch(`/api/events/${event!.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: form.title,
        title_ar: form.title_ar || null,
        description: form.description || null,
        description_ar: form.description_ar || null,
        category_id: form.category_id || null,
        city: form.city,
        country: form.country,
        venue_name: form.venue_name || null,
        address: form.address || null,
        lat: form.lat,
        lng: form.lng,
        start_at: new Date(form.start_at).toISOString(),
        end_at: form.end_at ? new Date(form.end_at).toISOString() : null,
        event_frequency: form.event_frequency,
        recurrence_until: shouldShowRecurrenceUntil && form.recurrence_until
          ? new Date(form.recurrence_until).toISOString()
          : null,
        capacity: form.capacity ? Number(form.capacity) : null,
        max_group_size: form.max_group_size ? Number(form.max_group_size) : null,
        is_free: form.is_free,
        price: form.is_free ? null : Number(form.price),
        currency: eventCurrency,
        gender_restriction: form.gender_restriction,
        is_family_friendly: form.is_family_friendly,
        is_published: form.is_published,
        visibility_type: visibilityType,
        community_ids: selectedCommunities,
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
            <label className="label">Venue Name</label>
            <input type="text" value={form.venue_name} onChange={set('venue_name')} className="input" />
          </div>
        </div>

        <div>
          <label className="label">Event Location *</label>
          <div className="rounded-3xl border border-gray-200 bg-gray-50 p-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-1">
                <p className="text-sm font-semibold text-gray-900">
                  {locationSummary?.title ?? 'No event location selected yet.'}
                </p>
                <p className="text-sm text-gray-500">
                  {locationSummary?.meta || 'Pick the exact event spot from the map and we will fill the city and address automatically.'}
                </p>
                {locationSummary?.coordinates ? (
                  <p className="text-xs text-gray-400">{locationSummary.coordinates}</p>
                ) : null}
              </div>
              <button type="button" onClick={() => setShowLocationPicker(true)} className="btn-secondary whitespace-nowrap">
                {selectedLocation ? 'Edit on Map' : 'Pick on Map'}
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Start Date & Time *</label>
            <input type="datetime-local" required value={form.start_at} onChange={setDateField('start_at')} className="input" />
          </div>
          <div>
            <label className="label">End Date & Time</label>
            <input type="datetime-local" value={form.end_at} min={form.start_at || undefined} onChange={setDateField('end_at')} className="input" />
          </div>
        </div>

        <div>
          <label className="label">Frequency</label>
          <select value={form.event_frequency} onChange={set('event_frequency')} className="input cursor-pointer">
            {EVENT_FREQUENCY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </div>

        {shouldShowRecurrenceUntil ? (
          <div>
            <label className="label">Repeat Until</label>
            <input
              type="datetime-local"
              value={form.recurrence_until}
              min={form.start_at || undefined}
              onChange={set('recurrence_until')}
              className="input"
            />
            <p className="mt-1 text-xs text-gray-400">Future sessions will be generated up to this date.</p>
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Capacity</label>
            <input type="number" min={1} value={form.capacity} onChange={set('capacity')} className="input" placeholder="Unlimited" />
            <p className="mt-1 text-xs text-gray-400">{capacityHelperText}</p>
          </div>
          <div>
            <label className="label">Max tickets per booking</label>
            <input
              type="number"
              min={1}
              max={20}
              value={form.max_group_size}
              onChange={set('max_group_size')}
              className="input"
              placeholder="Default: 5"
            />
            <p className="text-xs text-gray-400 mt-1">
              Maximum number of tickets a single user can purchase per booking. Leave blank for the default of 5.
            </p>
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
                  <span className="absolute start-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">{eventCurrency}</span>
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
                      onClick={() => {
                        setSelectedCommunities((prev) => {
                          const next = selected ? prev.filter((id) => id !== c.id) : [...prev, c.id]
                          // Auto-set visibility to match the most-specific selected community level
                          if (!selected) {
                            const levelMap: Record<string, EventVisibility> = {
                              micro: 'micro', interest: 'interest', district: 'city', city: 'city', country: 'national',
                            }
                            setVisibilityType(levelMap[c.level] ?? 'city')
                          } else if (next.length === 0) {
                            setVisibilityType('city')
                          }
                          return next
                        })
                      }}
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

        <EventOccurrencesManager eventId={event!.id} enabled={shouldShowRecurrenceUntil} />

        {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">{error}</div>}

        <div className="flex items-center gap-3 pt-2">
          <button type="submit" disabled={loading} className="btn-primary">
            {loading ? <Spinner size="sm" /> : 'Save Changes'}
          </button>
          <button type="button" onClick={() => router.back()} className="btn-ghost">Cancel</button>
        </div>

        <LocationPickerModal
          open={showLocationPicker}
          initialLocation={selectedLocation}
          onClose={() => setShowLocationPicker(false)}
          onConfirm={(location) => {
            applyPickedLocation(location)
            setShowLocationPicker(false)
          }}
        />
      </form>
    )
  }

  // ─── Create wizard ────────────────────────────────────────────────────────────

  // Step 1: create/update draft event, then advance
  async function handleStep1(e: FormEvent) {
    e.preventDefault()
    if (!form.city || !form.address || form.lat === null || form.lng === null) {
      setError('Pick the event location from the map')
      return
    }
    const capacityError = validateCapacity(form.capacity)
    if (capacityError) {
      setError(capacityError)
      return
    }
    const dateOrderError = validateDateOrder(form.start_at, form.end_at)
    if (dateOrderError) {
      setError(dateOrderError)
      return
    }
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
      country:            form.country,
      lat:                form.lat,
      lng:                form.lng,
      venue_name:         form.venue_name || null,
      address:            form.address || null,
      start_at:           new Date(form.start_at).toISOString(),
      end_at:             form.end_at ? new Date(form.end_at).toISOString() : null,
      event_frequency:    form.event_frequency,
      recurrence_until:   shouldShowRecurrenceUntil && form.recurrence_until
        ? new Date(form.recurrence_until).toISOString()
        : null,
      capacity:           form.capacity ? Number(form.capacity) : null,
      max_group_size:     form.max_group_size ? Number(form.max_group_size) : null,
      is_free:            true,
        currency:           eventCurrency,
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
    const ticketCapacityError = validateTicketCapacities(tickets)
    if (ticketCapacityError) { setError(ticketCapacityError); return }
    setError(null)
    setLoading(true)

    const allFree = tickets.every((t) => t.is_free)
    const eventId = createdEventId!
    const eventRowPrice = getEventRowPriceFromTickets(tickets)

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
    await supabase
      .from('events')
      .update({
        is_free: allFree,
        price: allFree ? 0 : eventRowPrice,
        currency: eventCurrency,
      })
      .eq('id', eventId)

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
              <label className="label">Venue Name</label>
              <input type="text" value={form.venue_name} onChange={set('venue_name')} className="input" placeholder="King Abdullah Park" />
            </div>
          </div>

          <div>
            <label className="label">Event Location *</label>
            <div className="rounded-3xl border border-gray-200 bg-gray-50 p-4">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-gray-900">
                    {locationSummary?.title ?? 'No event location selected yet.'}
                  </p>
                  <p className="text-sm text-gray-500">
                    {locationSummary?.meta || 'Pick the exact event spot from the map and we will fill the city and address automatically.'}
                  </p>
                  {locationSummary?.coordinates ? (
                    <p className="text-xs text-gray-400">{locationSummary.coordinates}</p>
                  ) : null}
                </div>
                <button type="button" onClick={() => setShowLocationPicker(true)} className="btn-secondary whitespace-nowrap">
                  {selectedLocation ? 'Edit on Map' : 'Pick on Map'}
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Start Date & Time *</label>
              <input type="datetime-local" required value={form.start_at} onChange={setDateField('start_at')} className="input" />
            </div>
            <div>
              <label className="label">End Date & Time</label>
              <input type="datetime-local" value={form.end_at} min={form.start_at || undefined} onChange={setDateField('end_at')} className="input" />
            </div>
          </div>

          <div>
            <label className="label">Frequency</label>
            <select value={form.event_frequency} onChange={set('event_frequency')} className="input cursor-pointer">
              {EVENT_FREQUENCY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>

          {shouldShowRecurrenceUntil ? (
            <div>
              <label className="label">Repeat Until</label>
              <input
                type="datetime-local"
                value={form.recurrence_until}
                min={form.start_at || undefined}
                onChange={set('recurrence_until')}
                className="input"
              />
              <p className="mt-1 text-xs text-gray-400">Future sessions will be generated up to this date.</p>
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Total Capacity</label>
              <input type="number" min={1} value={form.capacity} onChange={set('capacity')} className="input" placeholder="Unlimited" />
              <p className="mt-1 text-xs text-gray-400">{capacityHelperText}</p>
            </div>
            <div>
              <label className="label">Max tickets per booking</label>
              <input
                type="number"
                min={1}
                max={20}
                value={form.max_group_size}
                onChange={set('max_group_size')}
                className="input"
                placeholder="Default: 5"
              />
              <p className="text-xs text-gray-400 mt-1">
                Maximum number of tickets a single user can purchase per booking. Leave blank for the default of 5.
              </p>
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
                        onClick={() => {
                          setSelectedCommunities((prev) => {
                            const next = selected ? prev.filter((id) => id !== c.id) : [...prev, c.id]
                            if (!selected) {
                              const levelMap: Record<string, EventVisibility> = {
                                micro: 'micro', interest: 'interest', district: 'city', city: 'city', country: 'national',
                              }
                              setVisibilityType(levelMap[c.level] ?? 'city')
                            } else if (next.length === 0) {
                              setVisibilityType('city')
                            }
                            return next
                          })
                        }}
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
            Define pricing tiers for your event. Ticket prices automatically use the event currency: {eventCurrency}.
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
                          <span className="absolute start-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">{eventCurrency}</span>
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
                      className="input" placeholder={getEffectiveTicketCapacityLimit() !== null ? 'Required' : 'Unlimited'} />
                    <p className="mt-1 text-xs text-gray-400">{ticketCapacityHelperText}</p>
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
                <dt className="text-gray-500 text-xs font-medium uppercase tracking-wide">Location</dt>
                <dd className="text-gray-900 font-medium mt-0.5">{form.address || form.city}</dd>
              </div>
              <div>
                <dt className="text-gray-500 text-xs font-medium uppercase tracking-wide">Start</dt>
                <dd className="text-gray-900 font-medium mt-0.5">{new Date(form.start_at).toLocaleString()}</dd>
              </div>
              <div>
                <dt className="text-gray-500 text-xs font-medium uppercase tracking-wide">Frequency</dt>
                <dd className="text-gray-900 font-medium mt-0.5">
                  {EVENT_FREQUENCY_OPTIONS.find((option) => option.value === form.event_frequency)?.label ?? 'One Time'}
                </dd>
              </div>
              {shouldShowRecurrenceUntil && form.recurrence_until ? (
                <div>
                  <dt className="text-gray-500 text-xs font-medium uppercase tracking-wide">Repeat Until</dt>
                  <dd className="text-gray-900 font-medium mt-0.5">{new Date(form.recurrence_until).toLocaleString()}</dd>
                </div>
              ) : null}
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
                      {t.is_free ? 'Free' : `${eventCurrency} ${t.price}`}
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

      <LocationPickerModal
        open={showLocationPicker}
        initialLocation={selectedLocation}
        onClose={() => setShowLocationPicker(false)}
        onConfirm={(location) => {
          applyPickedLocation(location)
          setShowLocationPicker(false)
        }}
      />
    </div>
  )
}
