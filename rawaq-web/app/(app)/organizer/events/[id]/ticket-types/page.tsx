'use client'

import { useState, useEffect, useTransition } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { formatCurrency } from '@/lib/utils'
import type { TicketType } from '@/types/database'

const EMPTY_FORM = {
  name: '',
  name_ar: '',
  description: '',
  price: 0,
  capacity: '',
  is_free: false,
  sale_starts_at: '',
  sale_ends_at: '',
  sort_order: 0,
  is_hot_offer: false,
  hot_offer_price: 0,
  hot_offer_ends_at: '',
}

export default function ManageTicketTypesPage() {
  const params  = useParams<{ id: string }>()
  const eventId = params.id
  const router  = useRouter()

  const [types, setTypes]         = useState<TicketType[]>([])
  const [eventCurrency, setEventCurrency] = useState('SAR')
  const [loading, setLoading]     = useState(true)
  const [showForm, setShowForm]   = useState(false)
  const [editing, setEditing]     = useState<TicketType | null>(null)
  const [form, setForm]           = useState(EMPTY_FORM)
  const [saving, startSaving]     = useTransition()
  const [error, setError]         = useState('')

  function load() {
    Promise.all([
      fetch(`/api/events/${eventId}/ticket-types?organizer=1`).then((r) => r.json()),
      fetch(`/api/events/${eventId}`).then((r) => r.json()).catch(() => null),
    ])
      .then(([ticketJson, eventJson]) => {
        setTypes(ticketJson.data ?? ticketJson ?? [])
        setEventCurrency(eventJson?.data?.currency ?? 'SAR')
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }

  useEffect(load, [eventId])

  function openCreate() {
    setEditing(null)
    setForm(EMPTY_FORM)
    setError('')
    setShowForm(true)
  }

  function openEdit(t: TicketType) {
    setEditing(t)
    setForm({
      name:              t.name,
      name_ar:           t.name_ar ?? '',
      description:       t.description ?? '',
      price:             t.price,
      capacity:          t.capacity?.toString() ?? '',
      is_free:           t.is_free,
      sale_starts_at:    t.sale_starts_at ? t.sale_starts_at.slice(0, 16) : '',
      sale_ends_at:      t.sale_ends_at   ? t.sale_ends_at.slice(0, 16)   : '',
      sort_order:        t.sort_order,
      is_hot_offer:      t.is_hot_offer,
      hot_offer_price:   t.hot_offer_price ?? 0,
      hot_offer_ends_at: t.hot_offer_ends_at ? t.hot_offer_ends_at.slice(0, 16) : '',
    })
    setError('')
    setShowForm(true)
  }

  function submit() {
    if (!form.name.trim()) { setError('Name is required'); return }
    if (form.is_hot_offer) {
      if (!form.hot_offer_price || Number(form.hot_offer_price) <= 0) {
        setError('Hot offer price is required'); return
      }
      if (!form.hot_offer_ends_at) {
        setError('Offer end date is required'); return
      }
      if (new Date(form.hot_offer_ends_at) <= new Date()) {
        setError('Offer end date must be in the future'); return
      }
    }
    setError('')
    startSaving(async () => {
      const payload = {
        name:              form.name.trim(),
        name_ar:           form.name_ar.trim() || null,
        description:       form.description.trim() || null,
        price:             form.is_free ? 0 : Number(form.price),
        capacity:          form.capacity ? Number(form.capacity) : null,
        is_free:           form.is_free,
        sale_starts_at:    form.sale_starts_at ? new Date(form.sale_starts_at).toISOString() : null,
        sale_ends_at:      form.sale_ends_at   ? new Date(form.sale_ends_at).toISOString()   : null,
        sort_order:        Number(form.sort_order),
        is_hot_offer:      form.is_hot_offer,
        hot_offer_price:   form.is_hot_offer ? Number(form.hot_offer_price) : null,
        hot_offer_ends_at: form.is_hot_offer && form.hot_offer_ends_at
          ? new Date(form.hot_offer_ends_at).toISOString()
          : null,
      }

      const url    = editing ? `/api/events/${eventId}/ticket-types/${editing.id}` : `/api/events/${eventId}/ticket-types`
      const method = editing ? 'PATCH' : 'POST'
      const res    = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      if (!res.ok) { const j = await res.json().catch(() => ({})); setError(j.error ?? j.message ?? 'Failed to save'); return }
      setShowForm(false)
      load()
    })
  }

  async function deleteType(t: TicketType) {
    if (!confirm(`Remove "${t.name}"? Existing bookings won't be affected.`)) return
    const res = await fetch(`/api/events/${eventId}/ticket-types/${t.id}`, { method: 'DELETE' })
    if (res.ok) load()
    else { const j = await res.json().catch(() => ({})); alert(j.error ?? 'Delete failed') }
  }

  if (loading) return <div className="p-8 text-center text-gray-400">Loading…</div>

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="text-gray-400 hover:text-gray-600">← Back</button>
        <h1 className="text-xl font-bold text-gray-900 flex-1">Ticket Types</h1>
        {!showForm && (
          <button onClick={openCreate} className="btn-primary text-sm px-4 py-2">+ Add Type</button>
        )}
      </div>

      {/* Form */}
      {showForm && (
        <div className="card p-5 space-y-3">
          <h2 className="text-base font-semibold text-gray-900">{editing ? 'Edit' : 'New'} Ticket Type</h2>

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="form-label">Name *</label>
              <input className="input" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Early Bird" />
            </div>
            <div className="col-span-2">
              <label className="form-label">Name (Arabic)</label>
              <input className="input" dir="rtl" value={form.name_ar} onChange={(e) => setForm((f) => ({ ...f, name_ar: e.target.value }))} placeholder="بالعربي" />
            </div>
            <div className="col-span-2">
              <label className="form-label">Description</label>
              <textarea className="input" rows={2} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
            </div>

            <div>
              <label className="form-label">Price ({eventCurrency})</label>
              <input className="input" type="number" min={0} step={0.01} value={form.price} onChange={(e) => setForm((f) => ({ ...f, price: Number(e.target.value) }))} disabled={form.is_free} />
            </div>
            <div className="flex items-end pb-0.5">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.is_free} onChange={(e) => setForm((f) => ({ ...f, is_free: e.target.checked, price: 0 }))} className="w-4 h-4 accent-brand-500" />
                <span className="text-sm text-gray-600">Free ticket</span>
              </label>
            </div>

            <div>
              <label className="form-label">Capacity (optional)</label>
              <input className="input" type="number" min={1} value={form.capacity} onChange={(e) => setForm((f) => ({ ...f, capacity: e.target.value }))} placeholder="Unlimited" />
            </div>
            <div>
              <label className="form-label">Sort order</label>
              <input className="input" type="number" value={form.sort_order} onChange={(e) => setForm((f) => ({ ...f, sort_order: Number(e.target.value) }))} />
            </div>

            <div>
              <label className="form-label">Sale starts</label>
              <input className="input" type="datetime-local" value={form.sale_starts_at} onChange={(e) => setForm((f) => ({ ...f, sale_starts_at: e.target.value }))} />
            </div>
            <div>
              <label className="form-label">Sale ends</label>
              <input className="input" type="datetime-local" value={form.sale_ends_at} onChange={(e) => setForm((f) => ({ ...f, sale_ends_at: e.target.value }))} />
            </div>

            <div className="col-span-2 border-t pt-3 mt-1">
              <label className="flex items-center gap-2 cursor-pointer mb-3">
                <input
                  type="checkbox"
                  checked={form.is_hot_offer}
                  onChange={(e) => setForm((f) => ({
                    ...f,
                    is_hot_offer: e.target.checked,
                    hot_offer_price:   e.target.checked ? f.hot_offer_price : 0,
                    hot_offer_ends_at: e.target.checked ? f.hot_offer_ends_at : '',
                  }))}
                  className="w-4 h-4 accent-brand-500"
                />
                <span className="text-sm font-semibold text-gray-700">🔥 Hot Offer</span>
              </label>

              {form.is_hot_offer && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="form-label">Hot offer price ({eventCurrency})</label>
                    <input
                      className="input"
                      type="number"
                      min={0}
                      step={0.01}
                      value={form.hot_offer_price}
                      onChange={(e) => setForm((f) => ({ ...f, hot_offer_price: Number(e.target.value) }))}
                    />
                  </div>
                  <div>
                    <label className="form-label">Offer ends at</label>
                    <input
                      className="input"
                      type="datetime-local"
                      value={form.hot_offer_ends_at}
                      onChange={(e) => setForm((f) => ({ ...f, hot_offer_ends_at: e.target.value }))}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {error && <p className="text-xs text-red-500">{error}</p>}

          <div className="flex gap-2">
            <button onClick={submit} disabled={saving} className="btn-primary text-sm px-5 py-2 disabled:opacity-60">
              {saving ? 'Saving…' : editing ? 'Update' : 'Create'}
            </button>
            <button onClick={() => setShowForm(false)} className="text-sm text-gray-500 hover:text-gray-700 px-3 py-2">Cancel</button>
          </div>
        </div>
      )}

      {/* List */}
      {types.length === 0 ? (
        <div className="card p-8 text-center text-gray-400">
          No ticket types yet. Add one to let attendees choose pricing tiers.
        </div>
      ) : (
        <div className="space-y-2">
          {types.map((t) => {
            const soldOut    = t.capacity !== null && t.sold_count >= t.capacity
            const hotActive  = t.is_hot_offer && !!t.hot_offer_ends_at && new Date(t.hot_offer_ends_at) > new Date()
            const hotExpired = t.is_hot_offer && !!t.hot_offer_ends_at && new Date(t.hot_offer_ends_at) <= new Date()
            return (
              <div key={t.id} className={`card p-4 flex items-center gap-3 ${!t.is_active ? 'opacity-50' : ''}`}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-gray-900">{t.name}</span>
                    {!t.is_active && <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">Inactive</span>}
                    {soldOut && <span className="text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full">Sold out</span>}
                    {hotActive && <span className="text-xs bg-orange-100 text-orange-500 px-1.5 py-0.5 rounded-full">🔥 Hot</span>}
                  </div>
                  <div className="flex gap-3 mt-0.5 text-xs text-gray-500 flex-wrap">
                    {hotActive ? (
                      <span className="flex items-center gap-1">
                        <span className="line-through text-gray-400">{t.is_free ? 'Free' : formatCurrency(t.price, eventCurrency)}</span>
                        <span className="font-semibold text-orange-600">🔥 {formatCurrency(t.hot_offer_price!, eventCurrency)}</span>
                        <span className="text-gray-400">until {new Date(t.hot_offer_ends_at!).toLocaleDateString()}</span>
                      </span>
                    ) : (
                      <span className="font-medium text-brand-700">{t.is_free ? 'Free' : formatCurrency(t.price, eventCurrency)}</span>
                    )}
                    {hotExpired && <span className="text-xs bg-orange-100 text-orange-500 px-1.5 py-0.5 rounded-full">Offer expired</span>}
                    {t.capacity && <span>{t.sold_count}/{t.capacity} sold</span>}
                    {!t.capacity && t.sold_count > 0 && <span>{t.sold_count} sold</span>}
                    {t.sale_ends_at && !hotActive && <span>Ends {new Date(t.sale_ends_at).toLocaleDateString()}</span>}
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button onClick={() => openEdit(t)} className="text-xs text-brand-600 hover:underline">Edit</button>
                  <button onClick={() => deleteType(t)} className="text-xs text-red-500 hover:underline">Delete</button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div className="text-center">
        <Link href={`/organizer/events/${eventId}/attendees`} className="text-sm text-brand-600 hover:underline">
          View Attendees →
        </Link>
      </div>
    </div>
  )
}
