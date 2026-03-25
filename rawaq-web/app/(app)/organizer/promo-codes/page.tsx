'use client'

import { useState, useEffect, useTransition } from 'react'
import type { PromoCode } from '@/types/database'

const EMPTY_FORM = {
  code: '',
  event_id: '',
  discount_type: 'percent' as 'percent' | 'fixed',
  discount_value: 10,
  max_uses: '',
  min_order_amount: 0,
  expires_at: '',
}

function formatDiscount(promo: PromoCode) {
  return promo.discount_type === 'percent'
    ? `${promo.discount_value}% off`
    : `SAR ${promo.discount_value} off`
}

interface EventOption { id: string; title: string }

export default function PromoCodesPage() {
  const [promos, setPromos]         = useState<PromoCode[]>([])
  const [events, setEvents]         = useState<EventOption[]>([])
  const [loading, setLoading]       = useState(true)
  const [showForm, setShowForm]     = useState(false)
  const [form, setForm]             = useState(EMPTY_FORM)
  const [saving, startSaving]       = useTransition()
  const [error, setError]           = useState('')

  function loadPromos() {
    fetch('/api/promo-codes')
      .then((r) => r.json())
      .then((j) => { setPromos(j.data?.data ?? j.data ?? []); setLoading(false) })
      .catch(() => setLoading(false))
  }

  useEffect(() => {
    loadPromos()
    // Load organizer's published events for the event dropdown
    fetch('/api/events?organizer_own=true&per_page=100')
      .then((r) => r.json())
      .then((j) => setEvents((j.data?.data ?? j.data ?? []).map((e: { id: string; title: string }) => ({ id: e.id, title: e.title }))))
      .catch(() => {})
  }, [])

  function submit() {
    if (!form.code.trim()) { setError('Code is required'); return }
    if (!form.event_id) { setError('Please select an event'); return }
    if (form.discount_value <= 0) { setError('Discount value must be positive'); return }
    if (form.discount_type === 'percent' && form.discount_value > 100) { setError('Percent discount cannot exceed 100'); return }
    setError('')
    startSaving(async () => {
      const payload = {
        code:             form.code.toUpperCase().trim(),
        event_id:         form.event_id || null,
        discount_type:    form.discount_type,
        discount_value:   Number(form.discount_value),
        max_uses:         form.max_uses ? Number(form.max_uses) : null,
        min_order_amount: Number(form.min_order_amount),
        expires_at:       form.expires_at ? new Date(form.expires_at).toISOString() : null,
      }
      const res = await fetch('/api/promo-codes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) { const j = await res.json().catch(() => ({})); setError(j.error ?? j.message ?? 'Failed to create'); return }
      setShowForm(false)
      setForm(EMPTY_FORM)
      loadPromos()
    })
  }

  async function toggleActive(promo: PromoCode) {
    await fetch(`/api/promo-codes/${promo.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !promo.is_active }),
    })
    loadPromos()
  }

  async function deletePromo(promo: PromoCode) {
    if (!confirm(`Delete code "${promo.code}"?`)) return
    await fetch(`/api/promo-codes/${promo.id}`, { method: 'DELETE' })
    loadPromos()
  }

  if (loading) return <div className="p-8 text-center text-gray-400">Loading…</div>

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Promo Codes</h1>
          <p className="text-sm text-gray-500 mt-0.5">Create discount codes for your events</p>
        </div>
        {!showForm && (
          <button onClick={() => { setShowForm(true); setError('') }} className="btn-primary text-sm px-4 py-2">
            + New Code
          </button>
        )}
      </div>

      {/* Create form */}
      {showForm && (
        <div className="card p-5 space-y-4">
          <h2 className="text-base font-semibold text-gray-900">New Promo Code</h2>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="form-label">Code *</label>
              <input
                className="input font-mono uppercase"
                value={form.code}
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, '') }))}
                placeholder="SUMMER20"
                maxLength={32}
              />
            </div>
            <div>
              <label className="form-label">Event *</label>
              <select className="input" value={form.event_id} onChange={(e) => setForm((f) => ({ ...f, event_id: e.target.value }))}>
                <option value="">Select event…</option>
                {events.map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}
              </select>
            </div>

            <div>
              <label className="form-label">Discount type</label>
              <select className="input" value={form.discount_type} onChange={(e) => setForm((f) => ({ ...f, discount_type: e.target.value as 'percent' | 'fixed' }))}>
                <option value="percent">Percentage (%)</option>
                <option value="fixed">Fixed amount (SAR)</option>
              </select>
            </div>
            <div>
              <label className="form-label">Discount value *</label>
              <input
                className="input"
                type="number"
                min={1}
                max={form.discount_type === 'percent' ? 100 : undefined}
                step={form.discount_type === 'percent' ? 1 : 0.01}
                value={form.discount_value}
                onChange={(e) => setForm((f) => ({ ...f, discount_value: Number(e.target.value) }))}
              />
            </div>

            <div>
              <label className="form-label">Max uses <span className="text-gray-400 font-normal">(blank = unlimited)</span></label>
              <input className="input" type="number" min={1} value={form.max_uses} onChange={(e) => setForm((f) => ({ ...f, max_uses: e.target.value }))} placeholder="Unlimited" />
            </div>
            <div>
              <label className="form-label">Min order amount (SAR)</label>
              <input className="input" type="number" min={0} step={0.01} value={form.min_order_amount} onChange={(e) => setForm((f) => ({ ...f, min_order_amount: Number(e.target.value) }))} />
            </div>

            <div className="col-span-2">
              <label className="form-label">Expires at <span className="text-gray-400 font-normal">(optional)</span></label>
              <input className="input" type="datetime-local" value={form.expires_at} onChange={(e) => setForm((f) => ({ ...f, expires_at: e.target.value }))} />
            </div>
          </div>

          {/* Preview */}
          <div className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
            Preview: code <span className="font-mono font-bold text-brand-700">{form.code || 'CODE'}</span> gives{' '}
            <span className="font-semibold">
              {form.discount_type === 'percent' ? `${form.discount_value}%` : `SAR ${form.discount_value}`} off
            </span>
            {form.max_uses ? ` (max ${form.max_uses} uses)` : ' (unlimited uses)'}
            {form.expires_at ? ` until ${new Date(form.expires_at).toLocaleDateString()}` : ''}
          </div>

          {error && <p className="text-xs text-red-500">{error}</p>}

          <div className="flex gap-2">
            <button onClick={submit} disabled={saving} className="btn-primary text-sm px-5 py-2 disabled:opacity-60">
              {saving ? 'Creating…' : 'Create Code'}
            </button>
            <button onClick={() => { setShowForm(false); setError('') }} className="text-sm text-gray-500 hover:text-gray-700 px-3 py-2">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* List */}
      {promos.length === 0 ? (
        <div className="card p-8 text-center text-gray-400">
          No promo codes yet. Create one to offer discounts on your events.
        </div>
      ) : (
        <div className="space-y-2">
          {promos.map((p) => {
            const expired = p.expires_at ? new Date(p.expires_at) < new Date() : false
            const exhausted = p.max_uses !== null && p.used_count >= p.max_uses
            const effectivelyInactive = !p.is_active || expired || exhausted
            return (
              <div key={p.id} className={`card p-4 flex items-start gap-3 ${effectivelyInactive ? 'opacity-60' : ''}`}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-sm font-bold text-brand-700">{p.code}</span>
                    <span className="text-xs bg-brand-50 text-brand-700 px-2 py-0.5 rounded-full font-medium">
                      {formatDiscount(p)}
                    </span>
                    {!p.is_active && <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">Disabled</span>}
                    {expired && <span className="text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full">Expired</span>}
                    {exhausted && <span className="text-xs bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded-full">Limit reached</span>}
                  </div>
                  <div className="flex gap-3 mt-1 text-xs text-gray-500 flex-wrap">
                    <span>{p.used_count} used{p.max_uses ? ` / ${p.max_uses} max` : ''}</span>
                    {p.min_order_amount > 0 && <span>Min order: SAR {p.min_order_amount}</span>}
                    {p.expires_at && <span>Expires {new Date(p.expires_at).toLocaleDateString()}</span>}
                  </div>
                </div>
                <div className="flex gap-3 shrink-0">
                  <button onClick={() => toggleActive(p)} className={`text-xs hover:underline ${p.is_active ? 'text-gray-500' : 'text-green-600'}`}>
                    {p.is_active ? 'Disable' : 'Enable'}
                  </button>
                  <button onClick={() => deletePromo(p)} className="text-xs text-red-500 hover:underline">Delete</button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
