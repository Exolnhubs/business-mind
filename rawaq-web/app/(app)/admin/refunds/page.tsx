'use client'

import { useEffect, useState } from 'react'
import { Spinner } from '@/components/ui/Spinner'
import { TicketFlipLoader } from '@/components/ui/TicketFlipLoader'
import { formatCurrency } from '@/lib/utils'

interface VerifyResult {
  verified: boolean
  status?: string
  gateway?: string
  note?: string
  error?: string
  detail?: Record<string, unknown>
}

interface RefundRow {
  id: string
  amount: number
  status: 'pending' | 'approved' | 'completed' | 'rejected'
  user_note: string | null
  refund_method: 'original_payment' | 'manual'
  gateway_ref: string | null
  processed_at: string | null
  created_at: string
  requester: { id: string; display_name: string } | null
  booking: {
    id: string
    status: string
    event: { id: string; title: string; title_ar: string | null } | null
  } | null
  transaction: {
    id: string
    amount: number
    currency: string
    status: string
    gateway: string
    payment_method: string
  } | null
}

const STATUS_TABS = ['pending', 'approved', 'completed', 'rejected', 'all'] as const
type StatusTab = typeof STATUS_TABS[number]

const STATUS_STYLES: Record<string, string> = {
  pending:   'bg-amber-100 text-amber-700',
  approved:  'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700',
  rejected:  'bg-red-100 text-red-700',
}

const GATEWAY_LABELS: Record<string, string> = {
  paymob: 'Paymob',
  stripe: 'Stripe',
  fawry:  'Fawry',
}

export default function AdminRefundsPage() {
  const [tab,        setTab]        = useState<StatusTab>('pending')
  const [refunds,    setRefunds]    = useState<RefundRow[]>([])
  const [total,      setTotal]      = useState(0)
  const [loading,    setLoading]    = useState(true)
  const [actionId,   setActionId]   = useState<string | null>(null)
  const [gatewayRef, setGatewayRef] = useState('')
  const [msg,        setMsg]        = useState<{ ok: boolean; text: string } | null>(null)
  const [verifyingId,  setVerifyingId]  = useState<string | null>(null)
  const [verifyResult, setVerifyResult] = useState<Record<string, VerifyResult>>({})

  async function load(status: StatusTab) {
    setLoading(true)
    setMsg(null)
    const res  = await fetch(`/api/admin/refunds?status=${status}&per_page=50`)
    const json = await res.json()
    setRefunds(json.data?.data ?? [])
    setTotal(json.data?.total ?? 0)
    setLoading(false)
  }

  useEffect(() => { load(tab) }, [tab])

  async function verify(id: string) {
    setVerifyingId(id)
    const res  = await fetch(`/api/admin/refunds/${id}/verify`)
    const json = await res.json()
    setVerifyingId(null)
    setVerifyResult((prev) => ({ ...prev, [id]: json.data ?? { verified: false, error: 'No response' } }))
  }

  async function transition(id: string, status: 'approved' | 'completed' | 'rejected', method?: string) {
    setActionId(id)
    setMsg(null)

    const body: Record<string, string> = { status }
    if (gatewayRef) body.gateway_ref = gatewayRef
    if (method)     body.refund_method = method

    const res  = await fetch(`/api/admin/refunds/${id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    })
    const json = await res.json()
    setActionId(null)
    setGatewayRef('')

    if (res.ok) {
      setMsg({ ok: true, text: `Refund marked as ${status}.` })
      load(tab)
    } else {
      setMsg({ ok: false, text: json.error ?? 'Action failed.' })
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Refund Requests</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Most refunds are processed automatically via the original gateway.
          Only failed or unsupported gateway refunds appear here as <span className="font-medium text-amber-600">pending</span> for manual action.
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
      ) : refunds.length === 0 ? (
        <div className="card p-12 text-center text-gray-400">
          <div className="text-3xl mb-2">📭</div>
          <p className="text-sm">No {tab === 'all' ? '' : tab} refund requests.</p>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-xs text-gray-400">{total} request{total !== 1 ? 's' : ''}</p>
          {refunds.map((r) => (
            <div key={r.id} className="card p-5 space-y-4">
              {/* Header */}
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-gray-900 text-lg">
                      {formatCurrency(r.amount)}
                    </span>
                    <span className={`px-2 py-0.5 rounded text-xs font-semibold ${STATUS_STYLES[r.status]}`}>
                      {r.status}
                    </span>
                    <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                      r.refund_method === 'original_payment'
                        ? 'bg-green-100 text-green-700'
                        : 'bg-amber-100 text-amber-700'
                    }`}>
                      {r.refund_method === 'original_payment' ? '⚡ Auto' : '🔧 Manual'}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Requested {new Date(r.created_at).toLocaleString()}
                    {r.processed_at && ` · Processed ${new Date(r.processed_at).toLocaleString()}`}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium text-gray-800">{r.requester?.display_name ?? '—'}</p>
                </div>
              </div>

              {/* Event + payment details */}
              <div className="bg-gray-50 rounded-xl px-4 py-3 text-sm space-y-1">
                {r.booking?.event && (
                  <div className="flex gap-2">
                    <span className="text-gray-500 shrink-0">Event:</span>
                    <span className="font-medium text-gray-800">{r.booking.event.title}</span>
                  </div>
                )}
                {r.transaction && (
                  <div className="flex gap-2">
                    <span className="text-gray-500 shrink-0">Paid via:</span>
                    <span className="text-gray-700">
                      {GATEWAY_LABELS[r.transaction.gateway] ?? r.transaction.gateway}
                      {' · '}{r.transaction.payment_method}
                    </span>
                  </div>
                )}
                {r.user_note && (
                  <div className="flex gap-2">
                    <span className="text-gray-500 shrink-0">Reason:</span>
                    <span className="text-gray-700 italic">&quot;{r.user_note}&quot;</span>
                  </div>
                )}
                {r.gateway_ref && (
                  <div className="flex gap-2">
                    <span className="text-gray-500 shrink-0">Ref:</span>
                    <span className="font-mono text-xs text-gray-500">{r.gateway_ref}</span>
                  </div>
                )}
              </div>

              {/* Actions */}
              {r.status === 'pending' && (
                <div className="flex gap-3 flex-wrap items-end">
                  <button
                    onClick={() => transition(r.id, 'approved')}
                    disabled={actionId === r.id}
                    className="btn-primary text-sm disabled:opacity-50"
                  >
                    {actionId === r.id ? <Spinner size="sm" /> : 'Approve'}
                  </button>
                  <button
                    onClick={() => transition(r.id, 'rejected')}
                    disabled={actionId === r.id}
                    className="btn-secondary text-sm text-red-600 border-red-200 hover:bg-red-50 disabled:opacity-50"
                  >
                    Reject
                  </button>
                </div>
              )}

              {r.status === 'approved' && (
                <div className="flex gap-3 flex-wrap items-end">
                  <div className="flex-1 min-w-[200px]">
                    <label className="text-xs text-gray-500 mb-1 block">
                      Reference / confirmation number
                    </label>
                    <input
                      type="text"
                      className="input text-sm py-1.5"
                      placeholder="Bank transfer ref or gateway reversal ID"
                      value={actionId === r.id ? gatewayRef : ''}
                      onChange={(e) => { setActionId(r.id); setGatewayRef(e.target.value) }}
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => transition(r.id, 'completed', 'manual')}
                      disabled={actionId === r.id}
                      className="btn-primary text-sm disabled:opacity-50"
                    >
                      {actionId === r.id ? <Spinner size="sm" /> : 'Mark Refunded (Manual)'}
                    </button>
                    <button
                      onClick={() => transition(r.id, 'completed', 'original_payment')}
                      disabled={actionId === r.id}
                      className="btn-secondary text-sm disabled:opacity-50"
                    >
                      Mark Refunded (Gateway)
                    </button>
                  </div>
                  <button
                    onClick={() => transition(r.id, 'rejected')}
                    disabled={actionId === r.id}
                    className="btn-secondary text-sm text-red-600 border-red-200 hover:bg-red-50 disabled:opacity-50"
                  >
                    Reject
                  </button>
                </div>
              )}

              {/* Verify with gateway — for completed auto refunds */}
              {r.status === 'completed' && r.refund_method === 'original_payment' && r.gateway_ref && (
                <div className="border-t border-gray-100 pt-4">
                  <div className="flex items-center gap-3 flex-wrap">
                    <button
                      onClick={() => verify(r.id)}
                      disabled={verifyingId === r.id}
                      className="btn-secondary text-sm disabled:opacity-50"
                    >
                      {verifyingId === r.id ? <Spinner size="sm" /> : '🔍 Verify with Gateway'}
                    </button>
                    <span className="text-xs text-gray-400 font-mono">ref: {r.gateway_ref}</span>
                  </div>

                  {verifyResult[r.id] && (
                    <div className={`mt-3 rounded-xl px-4 py-3 text-sm space-y-1 ${
                      verifyResult[r.id].status === 'refunded'
                        ? 'bg-green-50 border border-green-200'
                        : verifyResult[r.id].status === 'pending'
                        ? 'bg-amber-50 border border-amber-200'
                        : 'bg-red-50 border border-red-200'
                    }`}>
                      {verifyResult[r.id].verified ? (
                        <>
                          <p className={`font-semibold ${
                            verifyResult[r.id].status === 'refunded' ? 'text-green-700'
                            : verifyResult[r.id].status === 'pending' ? 'text-amber-700'
                            : 'text-red-700'
                          }`}>
                            {verifyResult[r.id].status === 'refunded'
                              ? '✓ Confirmed — refund settled on the user\'s card'
                              : verifyResult[r.id].status === 'pending'
                              ? '⏳ Pending — refund is in transit, not yet settled'
                              : `⚠️ Status: ${verifyResult[r.id].status}`}
                          </p>
                          {verifyResult[r.id].note && (
                            <p className="text-gray-500 text-xs">{verifyResult[r.id].note}</p>
                          )}
                          {verifyResult[r.id].detail && Object.entries(verifyResult[r.id].detail!).map(([k, v]) => (
                            v != null && (
                              <p key={k} className="text-xs text-gray-500">
                                <span className="font-medium text-gray-600">{k}:</span>{' '}
                                {String(v)}
                              </p>
                            )
                          ))}
                        </>
                      ) : (
                        <p className="text-red-600 font-medium">
                          ✗ Gateway lookup failed: {verifyResult[r.id].error}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
