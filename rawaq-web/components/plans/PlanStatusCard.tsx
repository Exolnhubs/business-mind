'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { PlanDefinition, Subscription } from '@/types/plans'

interface SubData {
  plan: PlanDefinition | null
  subscription: Subscription | null
  usage?: { events_created: number; month: string }
}

const PLAN_BADGE: Record<string, string> = {
  user_free:    'bg-gray-100 text-gray-600',
  user_premium: 'bg-purple-100 text-purple-700',
  org_basic:    'bg-gray-100 text-gray-600',
  org_pro:      'bg-blue-100 text-blue-700',
  org_elite:    'bg-amber-100 text-amber-700',
  ind_free:     'bg-teal-50 text-teal-600',
  ind_basic:    'bg-teal-100 text-teal-700',
  ind_pro:      'bg-teal-200 text-teal-800',
}

interface Props {
  planId: string
}

export function PlanStatusCard({ planId }: Props) {
  const [data, setData] = useState<SubData | null>(null)
  const [fetching, setFetching] = useState(true)

  useEffect(() => {
    fetch('/api/subscriptions')
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(json => { if (json.data) setData(json.data) })
      .catch(() => { /* silent — plan badge falls back to planId prop */ })
      .finally(() => setFetching(false))
  }, [])

  const plan = data?.plan
  const usage = data?.usage
  const subscription = data?.subscription

  const eventLimit = plan?.events_per_month ?? null
  const eventsUsed = usage?.events_created ?? 0
  const usagePct = eventLimit ? Math.min((eventsUsed / eventLimit) * 100, 100) : 0

  const periodEnd = subscription?.current_period_end
    ? new Date(subscription.current_period_end).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
      })
    : null

  const badge = PLAN_BADGE[planId] ?? 'bg-gray-100 text-gray-600'
  const isFree = planId === 'user_free' || planId === 'org_basic' || planId === 'ind_free'

  const barColor = !eventLimit
    ? 'var(--c-gold)'
    : usagePct >= 100 ? '#ef4444'
    : usagePct >= 80  ? '#f97316'
    : 'var(--c-gold)'

  return (
    <div className="card p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-gray-900">My Plan</h2>
        <Link
          href="/plans"
          className="text-sm text-brand-600 hover:text-brand-700 font-medium hover:underline transition-colors"
        >
          {isFree ? '⬆ Upgrade' : 'Manage'} →
        </Link>
      </div>

      {fetching ? (
        <div className="space-y-2.5">
          <div className="h-6 bg-gray-100 rounded-full w-20 animate-pulse" />
          <div className="h-1.5 bg-gray-100 rounded-full w-full animate-pulse" />
        </div>
      ) : (
        <div className="space-y-3">
          {/* Plan badge + renewal */}
          <div className="flex items-center justify-between">
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${badge}`}>
              {plan?.name ?? planId}
            </span>
            {periodEnd && (
              <span className="text-xs text-gray-400">Renews {periodEnd}</span>
            )}
            {!periodEnd && !isFree && (
              <span className="text-xs text-gray-400">Active</span>
            )}
          </div>

          {/* Organizer usage meter */}
          {usage !== undefined && eventLimit !== null && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs text-gray-500">Events this month</span>
                <span
                  className="text-xs font-semibold tabular-nums"
                  style={{
                    color: usagePct >= 100 ? '#ef4444' : usagePct >= 80 ? '#f97316' : 'var(--c-ink)',
                  }}
                >
                  {eventsUsed} / {eventLimit}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${usagePct}%`, background: barColor }}
                />
              </div>
              {usagePct >= 100 && (
                <p className="text-[11px] text-red-500 mt-1.5">
                  Limit reached —{' '}
                  <Link href="/plans" className="underline font-medium">upgrade to publish more</Link>
                </p>
              )}
              {usagePct >= 80 && usagePct < 100 && (
                <p className="text-[11px] text-orange-500 mt-1.5">
                  {eventLimit - eventsUsed} event{eventLimit - eventsUsed !== 1 ? 's' : ''} remaining this month
                </p>
              )}
            </div>
          )}

          {/* Unlimited indicator */}
          {usage !== undefined && eventLimit === null && (
            <p className="text-xs text-gray-400">Unlimited events · no monthly cap</p>
          )}
        </div>
      )}
    </div>
  )
}
