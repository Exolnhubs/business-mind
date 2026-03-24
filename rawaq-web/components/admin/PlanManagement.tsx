'use client'

import { useState } from 'react'
import type { PlanDefinition } from '@/types/plans'

interface OrganizerRow {
  user_id: string
  plan_id: string
  business_name: string
  status: string
  plan: Pick<PlanDefinition, 'id' | 'name' | 'name_ar' | 'price_sar' | 'platform_fee_pct'> | null
  user: { id: string; display_name: string; avatar_url: string | null; is_banned: boolean } | null
}

interface UserRow {
  id: string
  display_name: string
  avatar_url: string | null
  plan_id: string
  is_banned: boolean
  created_at: string
  plan: Pick<PlanDefinition, 'id' | 'name' | 'name_ar' | 'price_sar'> | null
}

interface Props {
  plans: PlanDefinition[]
  organizers: OrganizerRow[]
  users: UserRow[]
}

const PLAN_BADGE: Record<string, string> = {
  user_free:    'bg-gray-100 text-gray-600',
  user_premium: 'bg-purple-100 text-purple-700',
  org_basic:    'bg-gray-100 text-gray-600',
  org_pro:      'bg-blue-100 text-blue-700',
  org_elite:    'bg-amber-100 text-amber-700',
}

function PlanBadge({ planId, planName }: { planId: string; planName: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${PLAN_BADGE[planId] ?? 'bg-gray-100 text-gray-600'}`}>
      {planName}
    </span>
  )
}

// Inline Change → Save flow per row — no ambiguity about what "save" does
function PlanCell({
  userId,
  currentPlanId,
  options,
  onSaved,
}: {
  userId: string
  currentPlanId: string
  options: PlanDefinition[]
  onSaved: (userId: string, planId: string) => void
}) {
  const [editing, setEditing]   = useState(false)
  const [selected, setSelected] = useState(currentPlanId)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [savedMsg, setSavedMsg] = useState(false)

  const current = options.find((p) => p.id === currentPlanId)

  function startEdit() {
    setSelected(currentPlanId)
    setError(null)
    setEditing(true)
  }

  function cancel() {
    setSelected(currentPlanId)
    setEditing(false)
    setError(null)
  }

  async function save() {
    if (selected === currentPlanId) { setEditing(false); return }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/plans/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan_id: selected }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to save')
      onSaved(userId, selected)
      setEditing(false)
      setSavedMsg(true)
      setTimeout(() => setSavedMsg(false), 2500)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error')
    } finally {
      setLoading(false)
    }
  }

  if (!editing) {
    return (
      <div className="flex items-center gap-2 flex-wrap">
        <PlanBadge planId={currentPlanId} planName={current?.name ?? currentPlanId} />
        <button
          onClick={startEdit}
          className="text-xs text-brand-600 hover:text-brand-700 hover:underline font-medium"
        >
          Change
        </button>
        {savedMsg && (
          <span className="text-xs text-green-600 font-medium">✓ Saved</span>
        )}
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <select
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
        className="text-sm border border-gray-200 rounded px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-brand/30"
      >
        {options.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name} {p.price_sar > 0 ? `(${p.price_sar} SAR/mo)` : '(Free)'}
          </option>
        ))}
      </select>
      <button
        onClick={save}
        disabled={loading}
        className="px-3 py-1 text-xs font-medium rounded bg-brand text-white disabled:opacity-50 hover:bg-brand/90 transition-colors"
      >
        {loading ? 'Saving…' : 'Save'}
      </button>
      <button
        onClick={cancel}
        disabled={loading}
        className="text-xs text-gray-500 hover:text-gray-700 hover:underline"
      >
        Cancel
      </button>
      {error && <span className="text-xs text-red-500">{error}</span>}
    </div>
  )
}

export function PlanManagement({ plans, organizers, users }: Props) {
  const [orgRows, setOrgRows]   = useState(organizers)
  const [userRows, setUserRows] = useState(users)

  const orgPlans  = plans.filter((p) => p.type === 'organizer')
  const userPlans = plans.filter((p) => p.type === 'user')

  function handleOrgSaved(userId: string, planId: string) {
    setOrgRows((prev) => prev.map((r) => r.user_id === userId ? { ...r, plan_id: planId } : r))
  }
  function handleUserSaved(id: string, planId: string) {
    setUserRows((prev) => prev.map((r) => r.id === id ? { ...r, plan_id: planId } : r))
  }

  return (
    <div className="space-y-10">

      {/* Plan catalogue overview */}
      <section>
        <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-3">
          Plan Catalogue
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {plans.map((p) => (
            <div key={p.id} className="card p-4 space-y-1">
              <div className="flex items-center justify-between">
                <PlanBadge planId={p.id} planName={p.name} />
                <span className="text-xs text-gray-400 capitalize">{p.type}</span>
              </div>
              <div className="text-lg font-bold text-gray-900">
                {p.price_sar > 0 ? `${p.price_sar} SAR/mo` : 'Free'}
              </div>
              <div className="text-xs text-gray-500 space-y-0.5">
                <div>Events/mo: {p.events_per_month ?? 'Unlimited'}</div>
                <div>Attendees/event: {p.attendees_per_event ?? 'Unlimited'}</div>
                <div>Platform fee: {(p.platform_fee_pct * 100).toFixed(0)}%</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Organizer plans */}
      <section>
        <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-3">
          Organizer Plans ({orgRows.length})
        </h3>
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-4 py-2.5 font-medium text-gray-600">Organizer</th>
                <th className="text-left px-4 py-2.5 font-medium text-gray-600">Status</th>
                <th className="text-left px-4 py-2.5 font-medium text-gray-600">Plan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {orgRows.map((org) => (
                <tr key={org.user_id} className="hover:bg-gray-50/50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{org.business_name}</div>
                    <div className="text-xs text-gray-400">{org.user?.display_name}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium capitalize ${
                      org.status === 'approved'  ? 'text-green-600' :
                      org.status === 'suspended' ? 'text-red-500'   :
                      'text-gray-500'
                    }`}>
                      {org.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <PlanCell
                      userId={org.user_id}
                      currentPlanId={org.plan_id}
                      options={orgPlans}
                      onSaved={handleOrgSaved}
                    />
                  </td>
                </tr>
              ))}
              {orgRows.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-6 text-center text-sm text-gray-400">
                    No organizers yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* User plans */}
      <section>
        <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-3">
          User Plans ({userRows.length})
        </h3>
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-4 py-2.5 font-medium text-gray-600">User</th>
                <th className="text-left px-4 py-2.5 font-medium text-gray-600">Plan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {userRows.map((user) => (
                <tr key={user.id} className="hover:bg-gray-50/50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{user.display_name}</div>
                    {user.is_banned && (
                      <span className="text-xs text-red-500">Banned</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <PlanCell
                      userId={user.id}
                      currentPlanId={user.plan_id}
                      options={userPlans}
                      onSaved={handleUserSaved}
                    />
                  </td>
                </tr>
              ))}
              {userRows.length === 0 && (
                <tr>
                  <td colSpan={2} className="px-4 py-6 text-center text-sm text-gray-400">
                    No users yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
