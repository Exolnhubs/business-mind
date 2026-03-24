'use client'

import { useState } from 'react'
import type { PlanDefinition } from '@/types/plans'

const PLAN_FEATURES: Record<string, string[]> = {
  user_free:    ['Book events', 'Save up to 20 events', 'Basic profile'],
  user_premium: ['Everything in Free', 'Early access (+24h window)', 'Unlimited saves', 'Premium-only events', 'Premium badge', 'Ad-free experience'],
  org_basic:    ['3 events/month', 'Up to 100 attendees/event', 'Basic analytics', '10% platform fee on revenue'],
  org_pro:      ['15 events/month', 'Up to 1,000 attendees/event', 'Full analytics dashboard', '1 featured event/month', 'Ticket scanner access', '6% platform fee on revenue'],
  org_elite:    ['Unlimited events', 'Unlimited attendees', 'Full analytics + CSV export', '5 featured events/month', 'Ticket scanner access', 'Priority support', 'Custom ticket branding', '3% platform fee on revenue'],
}

const PLAN_COLOR: Record<string, { ring: string; badge: string; btn: string }> = {
  user_free:    { ring: 'ring-gray-200',  badge: 'bg-gray-100 text-gray-600',     btn: 'bg-gray-800 text-white' },
  user_premium: { ring: 'ring-purple-400', badge: 'bg-purple-100 text-purple-700', btn: 'bg-purple-600 text-white' },
  org_basic:    { ring: 'ring-gray-200',  badge: 'bg-gray-100 text-gray-600',     btn: 'bg-gray-800 text-white' },
  org_pro:      { ring: 'ring-blue-400',  badge: 'bg-blue-100 text-blue-700',     btn: 'bg-blue-600 text-white' },
  org_elite:    { ring: 'ring-amber-400', badge: 'bg-amber-100 text-amber-700',   btn: 'bg-amber-500 text-white' },
}

interface Props {
  plans: PlanDefinition[]
  currentPlanId: string
}

export function PlanSelector({ plans, currentPlanId }: Props) {
  const [activePlanId, setActivePlanId] = useState(currentPlanId)
  const [loading, setLoading] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  async function selectPlan(planId: string) {
    if (planId === activePlanId) return
    setLoading(planId)
    setMsg(null)
    try {
      const res = await fetch('/api/subscriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan_id: planId }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to change plan')
      setActivePlanId(planId)
      setMsg({ ok: true, text: `Plan changed to ${json.data?.plan_name ?? planId}` })
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'Error' })
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="space-y-6">
      {msg && (
        <div className={`rounded-xl px-4 py-3 text-sm font-medium ${msg.ok ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
          {msg.ok ? '✓ ' : '✕ '}{msg.text}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {plans.map((plan) => {
          const isCurrent = plan.id === activePlanId
          const isLoading = loading === plan.id
          const colors    = PLAN_COLOR[plan.id] ?? PLAN_COLOR.org_basic
          const features  = PLAN_FEATURES[plan.id] ?? []

          return (
            <div
              key={plan.id}
              className={`relative rounded-2xl border-2 p-5 flex flex-col gap-4 transition-all ${
                isCurrent ? `ring-2 ${colors.ring} border-transparent` : 'border-gray-100 hover:border-gray-200'
              }`}
            >
              {isCurrent && (
                <span className="absolute top-3 right-3 text-[10px] font-semibold uppercase tracking-wide bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                  Current
                </span>
              )}

              <div>
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${colors.badge}`}>
                  {plan.name}
                </span>
                <div className="mt-2 text-2xl font-bold text-gray-900">
                  {plan.price_sar > 0 ? (
                    <>{plan.price_sar} <span className="text-sm font-normal text-gray-500">SAR / month</span></>
                  ) : (
                    <>Free</>
                  )}
                </div>
                {plan.type === 'organizer' && (
                  <div className="mt-1 text-xs text-gray-500">
                    {(plan.platform_fee_pct * 100).toFixed(0)}% platform fee on revenue
                  </div>
                )}
              </div>

              <ul className="flex-1 space-y-1.5">
                {features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-gray-600">
                    <span className="text-green-500 mt-0.5">✓</span>
                    {f}
                  </li>
                ))}
              </ul>

              <button
                onClick={() => selectPlan(plan.id)}
                disabled={isCurrent || isLoading || loading !== null}
                className={`w-full py-2.5 rounded-xl text-sm font-semibold transition-opacity disabled:opacity-40 ${
                  isCurrent ? 'bg-gray-100 text-gray-500 cursor-default' : `${colors.btn} hover:opacity-90`
                }`}
              >
                {isLoading ? 'Updating…' : isCurrent ? 'Current plan' : plan.price_sar > 0 ? `Upgrade to ${plan.name}` : `Switch to ${plan.name}`}
              </button>
            </div>
          )
        })}
      </div>

      <p className="text-xs text-gray-400 text-center">
        MVP: plan changes take effect immediately. Billing is simulated — no charges are made.
      </p>
    </div>
  )
}
