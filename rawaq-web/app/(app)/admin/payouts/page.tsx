'use client'

import { useEffect, useState } from 'react'
import { Spinner } from '@/components/ui/Spinner'
import { TicketFlipLoader } from '@/components/ui/TicketFlipLoader'
import { clientPatchJson, isToastHandledError } from '@/lib/client-fetch'
import { formatCurrency } from '@/lib/utils'

interface PayoutRow {
  id: string
  amount: number
  currency: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  bank_name: string | null
  iban: string | null
  gateway_ref: string | null
  failure_reason: string | null
  requested_at: string
  processed_at: string | null
  organizer: {
    id: string
    display_name: string
    organizer_profiles: { business_name: string } | null
  } | null
  bank_account: {
    bank_name: string
    bank_name_ar: string | null
    account_holder_name: string
    iban: string
    swift_code: string | null
    country: string
    is_verified: boolean
  } | null
}

const STATUS_TABS = ['pending', 'processing', 'completed', 'failed', 'all'] as const
type StatusTab = typeof STATUS_TABS[number]

const STATUS_STYLES: Record<string, string> = {
  pending:    'bg-amber-100 text-amber-700',
  processing: 'bg-blue-100 text-blue-700',
  completed:  'bg-green-100 text-green-700',
  failed:     'bg-red-100 text-red-700',
}

export default function AdminPayoutsPage() {
  const [tab,        setTab]        = useState<StatusTab>('pending')
  const [payouts,    setPayouts]    = useState<PayoutRow[]>([])
  const [total,      setTotal]      = useState(0)
  const [loading,    setLoading]    = useState(true)
  const [actionId,   setActionId]   = useState<string | null>(null)
  const [gatewayRef, setGatewayRef] = useState('')
  const [failReason, setFailReason] = useState('')
  const [msg,        setMsg]        = useState<{ ok: boolean; text: string } | null>(null)

  async function load(status: StatusTab) {
    setLoading(true)
    setMsg(null)
    const res  = await fetch(`/api/admin/payouts?status=${status}&per_page=50`)
    const json = await res.json()
    setPayouts(json.data?.data ?? [])
    setTotal(json.data?.total ?? 0)
    setLoading(false)
  }

  useEffect(() => { load(tab) }, [tab])

  async function transition(id: string, status: 'processing' | 'completed' | 'failed') {
    setActionId(id)
    setMsg(null)

    const body: Record<string, string> = { status }
    if (status === 'completed' && gatewayRef) body.gateway_ref = gatewayRef
    if (status === 'failed'    && failReason) body.failure_reason = failReason

    try {
      await clientPatchJson(`/api/admin/payouts/${id}`, body)
      setMsg({ ok: true, text: `Payout marked as ${status}.` })
      load(tab)
    } catch (error) {
      if (!isToastHandledError(error)) {
        setMsg({ ok: false, text: error instanceof Error ? error.message : 'Action failed.' })
      }
    } finally {
      setActionId(null)
      setGatewayRef('')
      setFailReason('')
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Payout Requests</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Review and process organizer withdrawal requests.
        </p>
      </div>

      {/* Status tabs */}
      <div className="flex gap-2 flex-wrap">
        {STATUS_TABS.map((s) => (
          <button
            key={s}
            onClick={() => setTab(s)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors capitalize ${
              tab === s
                ? 'bg-brand-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {msg && (
        <div className={`text-sm rounded-xl px-4 py-3 ${
          msg.ok
            ? 'bg-green-50 border border-green-200 text-green-700'
            : 'bg-red-50 border border-red-200 text-red-700'
        }`}>{msg.text}</div>
      )}

      {loading ? (
        <div className="flex justify-center py-16"><TicketFlipLoader size="md" /></div>
      ) : payouts.length === 0 ? (
        <div className="card p-12 text-center text-gray-400">
          <div className="text-3xl mb-2">📭</div>
          <p className="text-sm">No {tab === 'all' ? '' : tab} payout requests.</p>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-xs text-gray-400">{total} request{total !== 1 ? 's' : ''}</p>
          {payouts.map((p) => (
            <div key={p.id} className="card p-5 space-y-4">
              {/* Header row */}
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-gray-900 text-lg">
                      {formatCurrency(p.amount)}
                    </span>
                    <span className={`px-2 py-0.5 rounded text-xs font-semibold ${STATUS_STYLES[p.status]}`}>
                      {p.status}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Requested {new Date(p.requested_at).toLocaleString()}
                    {p.processed_at && ` · Processed ${new Date(p.processed_at).toLocaleString()}`}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium text-gray-800">
                    {p.organizer?.organizer_profiles?.business_name ?? p.organizer?.display_name ?? '—'}
                  </p>
                  <p className="text-xs text-gray-400">{p.organizer?.display_name}</p>
                </div>
              </div>

              {/* Bank details */}
              <div className="bg-gray-50 rounded-xl px-4 py-3 text-sm space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-gray-500">Bank:</span>
                  <span className="font-medium text-gray-800">
                    {p.bank_account?.bank_name ?? p.bank_name ?? '—'}
                    {p.bank_account?.bank_name_ar && (
                      <span className="text-gray-400 font-normal mr-1"> · {p.bank_account.bank_name_ar}</span>
                    )}
                  </span>
                  {p.bank_account?.is_verified && (
                    <span className="text-xs font-semibold text-green-600">✓ Verified</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-gray-500">IBAN:</span>
                  <span className="font-mono text-xs text-gray-800">
                    {(p.bank_account?.iban ?? p.iban ?? '—').replace(/(.{4})/g, '$1 ').trim()}
                  </span>
                </div>
                {p.bank_account?.account_holder_name && (
                  <div className="flex items-center gap-2">
                    <span className="text-gray-500">Holder:</span>
                    <span className="text-gray-800">{p.bank_account.account_holder_name}</span>
                  </div>
                )}
                {p.bank_account?.swift_code && (
                  <div className="flex items-center gap-2">
                    <span className="text-gray-500">SWIFT:</span>
                    <span className="font-mono text-xs text-gray-800">{p.bank_account.swift_code}</span>
                  </div>
                )}
                {p.gateway_ref && (
                  <div className="flex items-center gap-2">
                    <span className="text-gray-500">Ref:</span>
                    <span className="font-mono text-xs text-gray-500">{p.gateway_ref}</span>
                  </div>
                )}
                {p.failure_reason && (
                  <div className="flex items-center gap-2">
                    <span className="text-red-500">Failure:</span>
                    <span className="text-red-600 text-xs">{p.failure_reason}</span>
                  </div>
                )}
              </div>

              {/* Action buttons */}
              {p.status === 'pending' && (
                <div className="flex gap-3 flex-wrap items-end">
                  <div className="flex-1 min-w-[180px]">
                    <label className="text-xs text-gray-500 mb-1 block">Gateway ref (optional)</label>
                    <input
                      type="text"
                      className="input text-sm py-1.5"
                      placeholder="Bank transfer ref / TXN ID"
                      value={actionId === p.id ? gatewayRef : ''}
                      onChange={(e) => { setActionId(p.id); setGatewayRef(e.target.value) }}
                    />
                  </div>
                  <button
                    onClick={() => transition(p.id, 'processing')}
                    disabled={actionId === p.id}
                    className="btn-primary text-sm disabled:opacity-50 whitespace-nowrap"
                  >
                    {actionId === p.id ? <Spinner size="sm" /> : 'Mark as Processing'}
                  </button>
                  <div className="flex-1 min-w-[180px]">
                    <label className="text-xs text-gray-500 mb-1 block">Rejection reason</label>
                    <input
                      type="text"
                      className="input text-sm py-1.5"
                      placeholder="Reason for rejection"
                      value={actionId === p.id ? failReason : ''}
                      onChange={(e) => { setActionId(p.id); setFailReason(e.target.value) }}
                    />
                  </div>
                  <button
                    onClick={() => transition(p.id, 'failed')}
                    disabled={actionId === p.id}
                    className="btn-secondary text-sm text-red-600 border-red-200 hover:bg-red-50 disabled:opacity-50 whitespace-nowrap"
                  >
                    Reject
                  </button>
                </div>
              )}

              {p.status === 'processing' && (
                <div className="flex gap-3 flex-wrap items-end">
                  <div className="flex-1 min-w-[200px]">
                    <label className="text-xs text-gray-500 mb-1 block">Gateway ref / confirmation number *</label>
                    <input
                      type="text"
                      className="input text-sm py-1.5"
                      placeholder="Bank confirmation ref"
                      value={actionId === p.id ? gatewayRef : ''}
                      onChange={(e) => { setActionId(p.id); setGatewayRef(e.target.value) }}
                    />
                  </div>
                  <button
                    onClick={() => transition(p.id, 'completed')}
                    disabled={actionId === p.id}
                    className="btn-primary text-sm disabled:opacity-50 whitespace-nowrap"
                  >
                    {actionId === p.id ? <Spinner size="sm" /> : 'Confirm Completed'}
                  </button>
                  <div className="flex-1 min-w-[180px]">
                    <label className="text-xs text-gray-500 mb-1 block">Failure reason</label>
                    <input
                      type="text"
                      className="input text-sm py-1.5"
                      placeholder="Why did the transfer fail?"
                      value={actionId === p.id ? failReason : ''}
                      onChange={(e) => { setActionId(p.id); setFailReason(e.target.value) }}
                    />
                  </div>
                  <button
                    onClick={() => transition(p.id, 'failed')}
                    disabled={actionId === p.id}
                    className="btn-secondary text-sm text-red-600 border-red-200 hover:bg-red-50 disabled:opacity-50 whitespace-nowrap"
                  >
                    Mark Failed
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
