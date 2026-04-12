'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import type { ResolvedPlanDefinition, Subscription } from '@/types/plans'

// ── Plan UI metadata (display only) ────────────────────────────────────────

const PLAN_FLAGSHIP: Record<string, boolean> = {
  user_premium: true,
  org_pro: true,
}

const PLAN_FEATURES: Record<string, string[]> = {
  user_free: [
    'Book & attend any public event',
    'Save up to 20 events',
    'Community access & happenings',
    'Standard discovery experience',
  ],
  user_premium: [
    'Everything in Free',
    'Unlimited saved events',
    'Access premium-only events',
  ],
  org_basic: [
    '3 events published per month',
    'Up to 50 attendees per event',
    'Organizer dashboard access',
    '10% platform fee on revenue',
  ],
  org_pro: [
    '15 events published per month',
    'Up to 200 attendees per event',
    'Ticket scanner access',
    '6% platform fee on revenue',
  ],
  org_elite: [
    'Unlimited events published',
    'Unlimited attendees per event',
    'Ticket scanner access',
    '3% platform fee on revenue',
  ],
}

// ── Types ───────────────────────────────────────────────────────────────────

interface Props {
  plans: ResolvedPlanDefinition[]
  currentPlanId: string
  subscription: Subscription | null
  usage: { events_created: number; month: string } | null
  isOrganizer: boolean
}

type PlanAction = 'current' | 'upgrade' | 'downgrade'

function getPlanAction(plan: ResolvedPlanDefinition, activePlanId: string, plans: ResolvedPlanDefinition[]): PlanAction {
  if (plan.id === activePlanId) return 'current'
  const active = plans.find(p => p.id === activePlanId)
  if (!active) return 'upgrade'
  return plan.sort_order > active.sort_order ? 'upgrade' : 'downgrade'
}

function formatPlanAmount(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
    maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
  }).format(amount)
}

// ── Main component ──────────────────────────────────────────────────────────

export function PlanSelector({ plans, currentPlanId, subscription, usage, isOrganizer }: Props) {
  const searchParams = useSearchParams()
  const [activePlanId, setActivePlanId] = useState(currentPlanId)
  const [loading, setLoading] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [confirmDowngrade, setConfirmDowngrade] = useState<string | null>(null)

  const activePlan = plans.find(p => p.id === activePlanId)
  const eventLimit = activePlan?.events_per_month ?? null
  const eventsUsed = usage?.events_created ?? 0
  const usagePct = eventLimit ? Math.min((eventsUsed / eventLimit) * 100, 100) : 0

  const periodEnd = subscription?.current_period_end
    ? new Date(subscription.current_period_end).toLocaleDateString('en-US', {
        month: 'long', day: 'numeric', year: 'numeric',
      })
    : null

  const monthLabel = usage?.month
    ? new Date(usage.month + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : null

  async function doSelectPlan(plan: ResolvedPlanDefinition) {
    setLoading(plan.id)
    setMsg(null)
    setConfirmDowngrade(null)
    try {
      const res = await fetch('/api/subscriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan_id: plan.id, source: 'web' }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to change plan')

      if (json.data?.redirect_url) {
        window.location.href = json.data.redirect_url as string
        return
      }

      setActivePlanId(plan.id)
      setMsg({ ok: true, text: `Switched to ${json.data?.plan_name ?? plan.name}` })
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'Error' })
    } finally {
      setLoading(null)
    }
  }

  function handlePlanClick(plan: ResolvedPlanDefinition, action: PlanAction) {
    if (action === 'current') return
    if (action === 'downgrade') setConfirmDowngrade(plan.id)
    else doSelectPlan(plan)
  }

  // Separate fill (bar) vs text color — unlimited uses a dimmed bar but still gold text
  const usageColor = usagePct >= 100 ? '#f87171' : usagePct >= 80 ? '#fb923c' : 'var(--c-gold)'
  const usageFill = !eventLimit ? 'oklch(0.78 0.18 72 / 0.35)' : usageColor

  useEffect(() => {
    const transactionId = searchParams.get('transaction_id')
    const paymentStatus = searchParams.get('payment')
    if (!transactionId || !paymentStatus) return

    if (paymentStatus === 'cancelled' || paymentStatus === 'failed') {
      setMsg({ ok: false, text: 'Membership payment was not completed.' })
      return
    }

    let cancelled = false

    async function poll() {
      setMsg({ ok: true, text: 'Membership payment received. Finalizing your plan…' })

      for (const delay of [1500, 2500, 3500, 5000, 5000]) {
        await new Promise((resolve) => setTimeout(resolve, delay))
        if (cancelled) return

        const res = await fetch(`/api/subscriptions/status/${transactionId}`)
        const json = await res.json().catch(() => null) as {
          data?: {
            activated?: boolean
            active_subscription?: { plan_id?: string | null } | null
          }
        } | null

        const activated = json?.data?.activated
        const activatedPlanId = json?.data?.active_subscription?.plan_id
        if (activated && activatedPlanId) {
          setActivePlanId(activatedPlanId)
          setMsg({ ok: true, text: 'Membership activated successfully.' })
          window.setTimeout(() => {
            window.location.replace('/plans')
          }, 600)
          return
        }
      }

      if (!cancelled) {
        setMsg({ ok: true, text: 'Payment is processing. Refresh in a moment if your new plan is not visible yet.' })
      }
    }

    poll().catch(() => {
      if (!cancelled) {
        setMsg({ ok: false, text: 'We could not verify your membership payment yet.' })
      }
    })

    return () => {
      cancelled = true
    }
  }, [searchParams])

  return (
    <div className="space-y-8">

      {/* ── Page header ──────────────────────────────────────── */}
      <div>
        <h1
          className="font-display text-[2rem] font-black tracking-tight leading-none"
          style={{ color: 'var(--c-ink)' }}
        >
          {isOrganizer ? 'Organizer plan' : 'Your membership'}
        </h1>
        <p className="mt-2 text-sm text-gray-500 max-w-[44ch] leading-relaxed">
          {isOrganizer
            ? 'Publish more events and keep more of what you earn as you grow.'
            : 'Upgrade for unlimited saves and premium-only event access.'}
        </p>
      </div>

      {/* ── Current plan status strip ────────────────────────── */}
      <div className="rounded-2xl p-5 sm:p-6" style={{ background: 'var(--c-ink)' }}>
        <div className="flex flex-wrap items-start gap-6 sm:gap-12">

          {/* Identity */}
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-white/40 mb-1.5">
              Current plan
            </p>
            <p className="font-display text-2xl font-black tracking-tight" style={{ color: 'var(--c-gold)' }}>
              {activePlan?.name ?? '—'}
            </p>
            {periodEnd ? (
              <p className="text-[12px] text-white/30 mt-1">Renews {periodEnd}</p>
            ) : (
              <p className="text-[12px] text-white/25 mt-1">
                {(activePlan?.price_amount ?? 0) === 0 ? 'Free · no billing' : 'Active'}
              </p>
            )}
          </div>

          {/* Organizer usage meter */}
          {isOrganizer && (
            <div className="flex-1 min-w-[180px] max-w-[260px]">
              <div className="flex items-baseline justify-between mb-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-white/35">
                  Events{monthLabel ? ` · ${monthLabel}` : ' this month'}
                </span>
                <span
                  className="text-sm font-bold tabular-nums"
                  style={{ color: usageColor }}
                >
                  {eventLimit !== null ? `${eventsUsed} / ${eventLimit}` : `${eventsUsed} events`}
                </span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'oklch(1 0 0 / 0.08)' }}>
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{
                    width: eventLimit ? `${usagePct}%` : '100%',
                    background: usageFill,
                  }}
                />
              </div>
              {eventLimit && usagePct >= 80 && usagePct < 100 && (
                <p className="text-[11px] text-orange-300/75 mt-1.5">
                  {eventLimit - eventsUsed} remaining — consider upgrading
                </p>
              )}
              {eventLimit && usagePct >= 100 && (
                <p className="text-[11px] text-red-400/75 mt-1.5">
                  Monthly limit reached — upgrade to publish more
                </p>
              )}
              {!eventLimit && (
                <p className="text-[11px] text-white/20 mt-1.5">No monthly cap on this plan</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Feedback ─────────────────────────────────────────── */}
      {msg && (
        <div className={`rounded-xl px-4 py-3 text-sm font-medium border ${
          msg.ok
            ? 'bg-green-50 text-green-800 border-green-200'
            : 'bg-red-50 text-red-800 border-red-200'
        }`}>
          {msg.ok ? '✓' : '✕'} {msg.text}
        </div>
      )}

      {/* ── Plan cards ───────────────────────────────────────── */}
      <div className={`grid gap-4 ${plans.length === 2 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1 sm:grid-cols-3'}`}>
        {plans.map((plan) => {
          const isFlagship = !!PLAN_FLAGSHIP[plan.id]
          const isCurrent = plan.id === activePlanId
          const isConfirming = confirmDowngrade === plan.id
          const action = getPlanAction(plan, activePlanId, plans)
          const features = PLAN_FEATURES[plan.id] ?? []
          const feeSavedVsBasic = isOrganizer && plan.platform_fee_pct < 0.10
            ? Math.round((0.10 - plan.platform_fee_pct) * 100)
            : null

          if (isFlagship) {
            // ── Dark flagship card ──────────────────────────────
            return (
              <div
                key={plan.id}
                className="rounded-2xl p-6 flex flex-col"
                style={{ background: 'var(--c-ink)' }}
              >
                {/* Name row */}
                <div className="flex items-center justify-between mb-4">
                  <span className="text-[11px] font-semibold tracking-wider uppercase text-white/25">
                    {plan.name_ar}
                  </span>
                  {isCurrent ? (
                    <span className="text-[10px] font-bold uppercase tracking-widest px-2.5 py-0.5 rounded-full bg-green-500/15 text-green-400">
                      Active
                    </span>
                  ) : (
                    <span
                      className="text-[10px] font-bold uppercase tracking-widest px-2.5 py-0.5 rounded-full"
                      style={{ background: 'var(--c-gold)', color: 'var(--c-ink)' }}
                    >
                      Best value
                    </span>
                  )}
                </div>

                {/* Price */}
                <div className="mb-5">
                  <h3 className="font-display text-2xl font-black tracking-tight text-white mb-3">
                    {plan.name}
                  </h3>
                  <div className="flex items-baseline gap-1.5">
                    {plan.price_amount > 0 ? (
                      <>
                        <span className="font-display text-4xl font-black" style={{ color: 'var(--c-gold)' }}>
                          {formatPlanAmount(plan.price_amount)}
                        </span>
                        <span className="text-sm text-white/35">{plan.price_currency} / month</span>
                      </>
                    ) : (
                      <span className="font-display text-4xl font-black text-white">Free</span>
                    )}
                  </div>
                  {plan.type === 'organizer' && (
                    <p className="text-[12px] text-white/35 mt-1.5">
                      {(plan.platform_fee_pct * 100).toFixed(0)}% platform fee on revenue
                    </p>
                  )}
                </div>

                {/* Savings callout */}
                {feeSavedVsBasic && (
                  <div
                    className="rounded-xl px-3.5 py-2 mb-4 text-xs font-semibold"
                    style={{ background: 'oklch(0.78 0.18 72 / 0.12)', color: 'oklch(0.78 0.18 72)' }}
                  >
                    Save {feeSavedVsBasic}% in platform fees vs Basic
                  </div>
                )}

                {/* Features */}
                <ul className="flex-1 space-y-2.5 mb-6">
                  {features.map((f) => (
                    <li key={f} className="flex items-start gap-2.5 text-sm text-white/60">
                      <span className="shrink-0 mt-px text-[11px]" style={{ color: 'var(--c-gold)' }}>✓</span>
                      {f}
                    </li>
                  ))}
                </ul>

                {/* CTA */}
                {isCurrent ? (
                  <button
                    disabled
                    className="w-full py-3 rounded-xl text-sm font-semibold cursor-default"
                    style={{ background: 'oklch(1 0 0 / 0.06)', color: 'oklch(1 0 0 / 0.3)' }}
                  >
                    Current plan
                  </button>
                ) : isConfirming ? (
                  <div className="space-y-2">
                    <p className="text-[12px] text-orange-300/80 text-center">
                      Downgrading reduces your quota. Continue?
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => doSelectPlan(plan)}
                        disabled={loading !== null}
                        className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-orange-500 hover:bg-orange-600 transition-colors disabled:opacity-40"
                      >
                        {loading === plan.id ? 'Updating…' : 'Confirm'}
                      </button>
                      <button
                        onClick={() => setConfirmDowngrade(null)}
                        className="py-2.5 px-4 rounded-xl text-sm transition-colors"
                        style={{ color: 'oklch(1 0 0 / 0.4)' }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => handlePlanClick(plan, action)}
                    disabled={loading !== null}
                    className="w-full py-3 rounded-xl text-sm font-bold transition-opacity hover:opacity-90 disabled:opacity-40"
                    style={{ background: 'var(--c-gold)', color: 'var(--c-ink)' }}
                  >
                    {loading === plan.id
                      ? 'Updating…'
                      : action === 'upgrade'
                      ? `Upgrade to ${plan.name}`
                      : `Switch to ${plan.name}`}
                  </button>
                )}
              </div>
            )
          }

          // ── Light card (free / basic / elite) ──────────────────
          const isElite = plan.id === 'org_elite'

          return (
            <div
              key={plan.id}
              className={`rounded-2xl p-6 flex flex-col border ${
                isCurrent
                  ? 'border-brand-200 bg-brand-50/40'
                  : isElite
                  ? 'border-amber-200/50 bg-amber-50/20'
                  : 'border-gray-100 bg-white'
              }`}
            >
              {/* Name row */}
              <div className="flex items-center justify-between mb-4">
                <span className="text-[11px] font-semibold tracking-wider uppercase text-gray-400">
                  {plan.name_ar}
                </span>
                {isCurrent && (
                  <span className="text-[10px] font-bold uppercase tracking-widest px-2.5 py-0.5 rounded-full bg-green-100 text-green-700">
                    Active
                  </span>
                )}
              </div>

              {/* Price */}
              <div className="mb-5">
                <h3 className="font-display text-2xl font-black tracking-tight text-gray-900 mb-3">
                  {plan.name}
                </h3>
                <div className="flex items-baseline gap-1.5">
                  {plan.price_amount > 0 ? (
                    <>
                      <span className="font-display text-4xl font-black text-gray-900">{formatPlanAmount(plan.price_amount)}</span>
                      <span className="text-sm text-gray-400">{plan.price_currency} / month</span>
                    </>
                  ) : (
                    <span className="font-display text-3xl font-black text-gray-500">Free</span>
                  )}
                </div>
                {plan.type === 'organizer' && (
                  <p className="text-[12px] text-gray-400 mt-1.5">
                    {(plan.platform_fee_pct * 100).toFixed(0)}% platform fee on revenue
                  </p>
                )}
              </div>

              {/* Savings callout (elite) */}
              {feeSavedVsBasic && (
                <div className="rounded-xl px-3.5 py-2 mb-4 text-xs font-semibold bg-brand-50 text-brand-700">
                  Save {feeSavedVsBasic}% in platform fees vs Basic
                </div>
              )}

              {/* Features */}
              <ul className="flex-1 space-y-2.5 mb-6">
                {features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-sm text-gray-600">
                    <span className={`shrink-0 mt-px text-[11px] ${isElite ? 'text-brand-600' : 'text-brand-500'}`}>
                      ✓
                    </span>
                    {f}
                  </li>
                ))}
              </ul>

              {/* CTA */}
              {isCurrent ? (
                <button
                  disabled
                  className="w-full py-3 rounded-xl text-sm font-semibold bg-gray-100 text-gray-400 cursor-default"
                >
                  Current plan
                </button>
              ) : isConfirming ? (
                <div className="space-y-2">
                  <p className="text-xs text-orange-600 text-center">
                    Downgrading reduces your quota. Continue?
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => doSelectPlan(plan)}
                      disabled={loading !== null}
                      className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-orange-500 hover:bg-orange-600 transition-colors disabled:opacity-40"
                    >
                      {loading === plan.id ? 'Updating…' : 'Confirm'}
                    </button>
                    <button
                      onClick={() => setConfirmDowngrade(null)}
                      className="py-2.5 px-4 rounded-xl text-sm text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => handlePlanClick(plan, action)}
                  disabled={loading !== null}
                  className={`w-full py-3 rounded-xl text-sm font-bold transition-all disabled:opacity-40 ${
                    action === 'upgrade' ? 'btn-primary' : 'btn-secondary'
                  }`}
                >
                  {loading === plan.id
                    ? 'Updating…'
                    : action === 'upgrade'
                    ? `Upgrade to ${plan.name}`
                    : `Switch to ${plan.name}`}
                </button>
              )}
            </div>
          )
        })}
      </div>

      {/* ── Footer note ──────────────────────────────────────── */}
      <p className="text-xs text-center text-gray-400 pb-2">
        Paid plans open a secure checkout. Free plan changes take effect immediately.
      </p>
    </div>
  )
}
