'use client'

import { useState, useTransition } from 'react'
import type { PlanDefinition, PlanCountryPrice } from '@/types/plans'

interface Props {
  initialPlans: PlanDefinition[]
  initialCountryPrices: PlanCountryPrice[]
}

const FEATURE_KEYS: { key: string; label: string; type: 'boolean' | 'number' }[] = [
  { key: 'ticket_scanner',    label: 'Ticket Scanner',   type: 'boolean' },
  { key: 'unlimited_saves',   label: 'Unlimited Saves',  type: 'boolean' },
  { key: 'saves_limit',       label: 'Save Limit',       type: 'number'  },
  { key: 'analytics',         label: 'Analytics',        type: 'boolean' },
  { key: 'promo_codes',       label: 'Promo Codes',      type: 'boolean' },
  { key: 'custom_branding',   label: 'Custom Branding',  type: 'boolean' },
]

type PlanForm = {
  name: string
  name_ar: string
  price_sar: string
  billing_interval: 'free' | 'monthly' | 'yearly'
  events_per_month: string
  attendees_per_event: string
  community_limit: string
  platform_fee_pct: string
  is_active: boolean
  sort_order: string
  features: Record<string, unknown>
}

type PriceForm = { country_code: string; currency_code: string; amount: string }

function planToForm(plan: PlanDefinition): PlanForm {
  return {
    name:                plan.name,
    name_ar:             plan.name_ar,
    price_sar:           String(plan.price_sar),
    billing_interval:    plan.billing_interval as 'free' | 'monthly' | 'yearly',
    events_per_month:    plan.events_per_month === null ? '' : String(plan.events_per_month),
    attendees_per_event: plan.attendees_per_event === null ? '' : String(plan.attendees_per_event),
    community_limit:     plan.community_limit === null ? '' : String(plan.community_limit),
    platform_fee_pct:    String(Math.round(plan.platform_fee_pct * 100)),
    is_active:           plan.is_active,
    sort_order:          String(plan.sort_order),
    features:            plan.features ?? {},
  }
}

const emptyForm: PlanForm = {
  name: '', name_ar: '', price_sar: '0', billing_interval: 'monthly',
  events_per_month: '', attendees_per_event: '', community_limit: '', platform_fee_pct: '10',
  is_active: true, sort_order: '0', features: {},
}

function useSavePlan(onDone: (plan: PlanDefinition) => void) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  async function save(planId: string | null, type: 'user' | 'organizer' | 'individual', form: PlanForm, newId?: string) {
    setError(null)
    startTransition(async () => {
      try {
        const body: Record<string, unknown> = {
          name:                form.name,
          name_ar:             form.name_ar,
          price_sar:           parseFloat(form.price_sar) || 0,
          billing_interval:    form.billing_interval,
          events_per_month:    form.events_per_month ? parseInt(form.events_per_month) : null,
          attendees_per_event: form.attendees_per_event ? parseInt(form.attendees_per_event) : null,
          community_limit:     form.community_limit ? parseInt(form.community_limit) : null,
          platform_fee_pct:    (parseFloat(form.platform_fee_pct) || 0) / 100,
          is_active:           form.is_active,
          sort_order:          parseInt(form.sort_order) || 0,
          features:            form.features,
        }

        let res: Response
        if (planId) {
          res = await fetch(`/api/owner/plans/${planId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          })
        } else {
          body.id   = newId
          body.type = type
          res = await fetch('/api/owner/plans', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          })
        }

        if (!res.ok) {
          const j = await res.json().catch(() => ({}))
          setError((j as { error?: string }).error ?? 'Failed to save plan')
          return
        }
        const j = await res.json()
        onDone((j.data?.plan ?? j.data) as PlanDefinition)
      } catch {
        setError('Network error')
      }
    })
  }

  return { save, isPending, error }
}

function useUpsertCountryPrice(onDone: (price: PlanCountryPrice) => void) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function upsert(planId: string, form: PriceForm) {
    setError(null)
    startTransition(async () => {
      try {
        const res = await fetch(`/api/owner/plans/${planId}/country-prices`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            country_code:  form.country_code.toUpperCase(),
            currency_code: form.currency_code.toUpperCase(),
            amount:        parseFloat(form.amount) || 0,
          }),
        })
        if (!res.ok) {
          const j = await res.json().catch(() => ({}))
          setError((j as { error?: string }).error ?? 'Failed to save price')
          return
        }
        const j = await res.json()
        onDone((j.data?.price) as PlanCountryPrice)
      } catch {
        setError('Network error')
      }
    })
  }

  return { upsert, isPending, error }
}

function useDeleteCountryPrice(onDone: (planId: string, countryCode: string) => void) {
  const [, startTransition] = useTransition()

  function del(planId: string, countryCode: string) {
    startTransition(async () => {
      await fetch(`/api/owner/plans/${planId}/country-prices/${countryCode}`, { method: 'DELETE' })
      onDone(planId, countryCode)
    })
  }

  return { del }
}

export function PlanEditor({ initialPlans, initialCountryPrices }: Props) {
  const [plans, setPlans] = useState(initialPlans)
  const [allPrices, setAllPrices] = useState(initialCountryPrices)
  const [selectedId, setSelectedId] = useState<string | 'new' | null>(null)
  const [newType, setNewType] = useState<'user' | 'organizer' | 'individual'>('organizer')
  const [newPlanId, setNewPlanId] = useState('')
  const [form, setForm] = useState<PlanForm>(emptyForm)

  const selected = selectedId === 'new' ? null : plans.find((p) => p.id === selectedId) ?? null
  const prices = allPrices.filter((p) => p.plan_id === selectedId)

  const [priceForm, setPriceForm] = useState<PriceForm>({ country_code: '', currency_code: 'SAR', amount: '' })

  const { save, isPending, error: saveError } = useSavePlan((plan) => {
    setPlans((prev) => {
      const idx = prev.findIndex((p) => p.id === plan.id)
      if (idx >= 0) {
        const next = [...prev]; next[idx] = plan; return next
      }
      return [...prev, plan]
    })
    setSelectedId(plan.id)
    setForm(planToForm(plan))
  })

  const { upsert, isPending: priceIsPending, error: priceError } = useUpsertCountryPrice((price) => {
    setAllPrices((prev) => {
      const idx = prev.findIndex((p) => p.plan_id === price.plan_id && p.country_code === price.country_code)
      if (idx >= 0) { const next = [...prev]; next[idx] = price; return next }
      return [...prev, price]
    })
    setPriceForm({ country_code: '', currency_code: 'SAR', amount: '' })
  })

  const { del } = useDeleteCountryPrice((planId, cc) => {
    setAllPrices((prev) => prev.filter((p) => !(p.plan_id === planId && p.country_code === cc)))
  })

  function selectPlan(plan: PlanDefinition) {
    setSelectedId(plan.id)
    setForm(planToForm(plan))
  }

  function selectNew() {
    setSelectedId('new')
    setForm(emptyForm)
    setNewPlanId('')
  }

  function setFeature(key: string, value: unknown) {
    setForm((f) => ({ ...f, features: { ...f.features, [key]: value } }))
  }

  const userPlans  = plans.filter((p) => p.type === 'user')
  const orgPlans   = plans.filter((p) => p.type === 'organizer')
  const indPlans   = plans.filter((p) => p.type === 'individual')

  function PlanList({ items, label }: { items: PlanDefinition[]; label: string }) {
    return (
      <div>
        <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 px-1">{label}</div>
        <ul className="space-y-1">
          {items.map((p) => (
            <li key={p.id}>
              <button
                onClick={() => selectPlan(p)}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                  selectedId === p.id
                    ? 'bg-amber-100 text-amber-900 font-semibold'
                    : 'hover:bg-gray-100 text-gray-700'
                }`}
              >
                <span className={!p.is_active ? 'line-through text-gray-400' : ''}>{p.name}</span>
                <span className="ml-1 text-gray-400 font-normal">
                  {p.price_sar === 0 ? '(free)' : `(${p.price_sar} SAR)`}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    )
  }

  return (
    <div className="flex gap-6">
      {/* Plan list sidebar */}
      <div className="w-56 shrink-0 space-y-4">
        <PlanList items={orgPlans}  label="Organizer Plans" />
        <PlanList items={indPlans}  label="Individual Host Plans" />
        <PlanList items={userPlans} label="User Plans" />
        <button
          onClick={selectNew}
          className={`w-full text-left px-3 py-2 rounded-lg text-sm border-2 border-dashed transition-colors ${
            selectedId === 'new'
              ? 'border-amber-400 text-amber-700 bg-amber-50'
              : 'border-gray-300 text-gray-400 hover:border-amber-300 hover:text-amber-600'
          }`}
        >
          + New Plan
        </button>
      </div>

      {/* Edit panel */}
      {selectedId ? (
        <div className="flex-1 space-y-6">
          <div className="rounded-xl border border-gray-200 p-5 space-y-4">
            <h3 className="font-semibold text-gray-900 text-sm">
              {selectedId === 'new' ? 'Create New Plan' : `Editing: ${selected?.name}`}
            </h3>

            {selectedId === 'new' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Plan ID (slug)</label>
                  <input
                    value={newPlanId}
                    onChange={(e) => setNewPlanId(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                    placeholder="org_enterprise"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Type</label>
                  <select
                    value={newType}
                    onChange={(e) => setNewType(e.target.value as 'user' | 'organizer' | 'individual')}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  >
                    <option value="organizer">organizer</option>
                    <option value="individual">individual</option>
                    <option value="user">user</option>
                  </select>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Name (EN)</label>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Name (AR)</label>
                <input value={form.name_ar} onChange={(e) => setForm({ ...form, name_ar: e.target.value })} dir="rtl"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Base Price (SAR/mo)</label>
                <input type="number" min="0" value={form.price_sar}
                  onChange={(e) => setForm({ ...form, price_sar: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Billing Interval</label>
                <select value={form.billing_interval}
                  onChange={(e) => setForm({ ...form, billing_interval: e.target.value as 'free' | 'monthly' | 'yearly' })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                  <option value="free">Free</option>
                  <option value="monthly">Monthly</option>
                  <option value="yearly">Yearly</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Events/Month (blank = unlimited)</label>
                <input type="number" min="1" value={form.events_per_month}
                  onChange={(e) => setForm({ ...form, events_per_month: e.target.value })}
                  placeholder="unlimited"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Attendees/Event (blank = unlimited)</label>
                <input type="number" min="1" value={form.attendees_per_event}
                  onChange={(e) => setForm({ ...form, attendees_per_event: e.target.value })}
                  placeholder="unlimited"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Community Hosting Limit (blank = unlimited)</label>
                <input type="number" min="1" value={form.community_limit}
                  onChange={(e) => setForm({ ...form, community_limit: e.target.value })}
                  placeholder="unlimited"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Platform Fee (%)</label>
                <input type="number" min="0" max="100" step="0.1" value={form.platform_fee_pct}
                  onChange={(e) => setForm({ ...form, platform_fee_pct: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Sort Order</label>
                <input type="number" min="0" value={form.sort_order}
                  onChange={(e) => setForm({ ...form, sort_order: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </div>
            </div>

            {/* Features */}
            <div>
              <div className="text-xs font-medium text-gray-600 mb-2">Features</div>
              <div className="grid grid-cols-2 gap-2">
                {FEATURE_KEYS.map(({ key, label, type }) => (
                  <label key={key} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                    {type === 'boolean' ? (
                      <>
                        <input
                          type="checkbox"
                          checked={form.features[key] === true}
                          onChange={(e) => setFeature(key, e.target.checked)}
                          className="rounded"
                        />
                        {label}
                      </>
                    ) : (
                      <>
                        <span className="w-24 shrink-0">{label}:</span>
                        <input
                          type="number"
                          min="0"
                          value={typeof form.features[key] === 'number' ? String(form.features[key]) : ''}
                          onChange={(e) => setFeature(key, e.target.value ? parseInt(e.target.value) : undefined)}
                          className="w-20 border border-gray-300 rounded px-2 py-1 text-xs"
                          placeholder="—"
                        />
                      </>
                    )}
                  </label>
                ))}
              </div>
            </div>

            {/* Active toggle */}
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input type="checkbox" checked={form.is_active}
                onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                className="rounded" />
              Plan is active (visible to users)
            </label>

            {saveError && (
              <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{saveError}</div>
            )}

            <div className="flex gap-2">
              <button
                disabled={isPending}
                onClick={() => save(
                  selectedId === 'new' ? null : selectedId,
                  selectedId === 'new' ? newType : (selected?.type ?? 'organizer'),
                  form,
                  selectedId === 'new' ? newPlanId : undefined,
                )}
                className="px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 disabled:opacity-50 transition-colors"
              >
                {isPending ? 'Saving…' : selectedId === 'new' ? 'Create Plan' : 'Save Changes'}
              </button>
            </div>
          </div>

          {/* Country price overrides — only for existing plans */}
          {selectedId !== 'new' && selected && (
            <div className="rounded-xl border border-gray-200 p-5 space-y-3">
              <h3 className="font-semibold text-gray-900 text-sm">Country Price Overrides</h3>
              <p className="text-xs text-gray-500">Override the base SAR price for specific countries.</p>

              {prices.length > 0 && (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-gray-400">
                      <th className="text-left pb-1">Country</th>
                      <th className="text-left pb-1">Currency</th>
                      <th className="text-right pb-1">Amount</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {prices.map((p) => (
                      <tr key={p.country_code}>
                        <td className="py-1.5 font-mono text-xs">{p.country_code}</td>
                        <td className="py-1.5 text-gray-600">{p.currency_code}</td>
                        <td className="py-1.5 text-right tabular-nums">{Number(p.amount).toLocaleString()}</td>
                        <td className="py-1.5 text-right">
                          <button
                            onClick={() => del(selected.id, p.country_code)}
                            className="text-red-400 hover:text-red-600 text-xs"
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              <div className="flex gap-2 pt-1">
                <input value={priceForm.country_code} maxLength={2} placeholder="AE"
                  onChange={(e) => setPriceForm({ ...priceForm, country_code: e.target.value })}
                  className="w-16 border border-gray-300 rounded-lg px-2 py-1.5 text-sm font-mono uppercase" />
                <input value={priceForm.currency_code} maxLength={3} placeholder="AED"
                  onChange={(e) => setPriceForm({ ...priceForm, currency_code: e.target.value })}
                  className="w-20 border border-gray-300 rounded-lg px-2 py-1.5 text-sm font-mono uppercase" />
                <input type="number" min="0" value={priceForm.amount} placeholder="Amount"
                  onChange={(e) => setPriceForm({ ...priceForm, amount: e.target.value })}
                  className="w-28 border border-gray-300 rounded-lg px-2 py-1.5 text-sm" />
                <button
                  disabled={priceIsPending || !priceForm.country_code || !priceForm.amount}
                  onClick={() => upsert(selected.id, priceForm)}
                  className="px-3 py-1.5 bg-gray-800 text-white rounded-lg text-sm hover:bg-gray-700 disabled:opacity-50"
                >
                  {priceIsPending ? '…' : 'Add'}
                </button>
              </div>
              {priceError && <div className="text-xs text-red-500">{priceError}</div>}
            </div>
          )}
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
          Select a plan to edit or click <span className="mx-1 font-medium text-gray-600">+ New Plan</span>
        </div>
      )}
    </div>
  )
}
