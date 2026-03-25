'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/auth-context'
import { Spinner } from '@/components/ui/Spinner'
import { formatCurrency } from '@/lib/utils'
import type { OrganizerWallet, WalletLedgerEntry, Payout } from '@/types/database'

const REASON_LABELS: Record<string, string> = {
  tip:              '💝 Tip received',
  ticket_sale:      '🎟️ Ticket sale',
  refund_deducted:  '↩️ Refund deducted',
  payout:           '🏦 Payout',
  adjustment:       '⚙️ Adjustment',
}

export default function EarningsPage() {
  const { user, profile, loading: authLoading } = useAuth()
  const router = useRouter()

  const [wallet,  setWallet]  = useState<OrganizerWallet | null>(null)
  const [ledger,  setLedger]  = useState<WalletLedgerEntry[]>([])
  const [payouts, setPayouts] = useState<Payout[]>([])
  const [pendingPayout, setPendingPayout] = useState<Payout | null>(null)
  const [loading, setLoading] = useState(true)

  // Payout form
  const [showPayoutForm, setShowPayoutForm] = useState(false)
  const [payoutForm, setPayoutForm] = useState({ amount: '', bank_name: '', iban: '' })
  const [payoutLoading, setPayoutLoading] = useState(false)
  const [payoutMsg, setPayoutMsg] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    if (!authLoading && !user) router.replace('/login')
    if (!authLoading && profile?.role !== 'organizer') router.replace('/organizer')
  }, [authLoading, user, profile, router])

  useEffect(() => {
    if (!user) return
    setLoading(true)
    Promise.all([
      fetch('/api/organizer/wallet').then((r) => r.json()),
      fetch('/api/organizer/payouts?per_page=10').then((r) => r.json()),
    ]).then(([walletData, payoutsData]) => {
      setWallet(walletData.data?.wallet ?? null)
      setLedger(walletData.data?.ledger ?? [])
      setPendingPayout(walletData.data?.pending_payout ?? null)
      setPayouts(payoutsData.data?.data ?? [])
    }).finally(() => setLoading(false))
  }, [user])

  async function handlePayout(e: FormEvent) {
    e.preventDefault()
    setPayoutLoading(true)
    setPayoutMsg(null)

    const res = await fetch('/api/organizer/payouts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount:    parseFloat(payoutForm.amount),
        bank_name: payoutForm.bank_name || undefined,
        iban:      payoutForm.iban      || undefined,
      }),
    })

    const json = await res.json()
    if (res.ok) {
      // Refresh wallet
      const walletRes = await fetch('/api/organizer/wallet').then((r) => r.json())
      setWallet(walletRes.data?.wallet ?? null)
      setLedger(walletRes.data?.ledger ?? [])
      setPayouts((prev) => [json.data, ...prev])
      setPayoutMsg({ ok: true, text: `✓ Payout of ${formatCurrency(parseFloat(payoutForm.amount))} processed.` })
      setPayoutForm({ amount: '', bank_name: '', iban: '' })
      setShowPayoutForm(false)
    } else {
      setPayoutMsg({ ok: false, text: json.error ?? 'Payout failed.' })
    }
    setPayoutLoading(false)
  }

  if (authLoading || loading) {
    return <div className="flex items-center justify-center h-[60vh]"><Spinner size="lg" /></div>
  }

  const balance = wallet?.balance ?? 0

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Earnings</h1>
          <p className="text-sm text-gray-500 mt-0.5">Your wallet, ledger, and payout history</p>
        </div>
        <a href="/organizer" className="text-sm text-brand-600 hover:underline font-medium">← Dashboard</a>
      </div>

      {/* Wallet summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: 'Available Balance', value: formatCurrency(wallet?.balance ?? 0), highlight: true, icon: '💰' },
          { label: 'Total Earned',      value: formatCurrency(wallet?.total_earned ?? 0),    icon: '📈' },
          { label: 'Total Withdrawn',   value: formatCurrency(wallet?.total_withdrawn ?? 0), icon: '🏦' },
        ].map((s) => (
          <div key={s.label} className={`card p-5 ${s.highlight ? 'bg-brand-50 border border-brand-200' : ''}`}>
            <div className="text-2xl mb-1">{s.icon}</div>
            <div className={`text-2xl font-bold ${s.highlight ? 'text-brand-700' : 'text-gray-900'}`}>{s.value}</div>
            <div className="text-xs text-gray-500 mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Payout CTA */}
      {!pendingPayout && (
        <div className="card p-5">
          {!showPayoutForm ? (
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <p className="font-medium text-gray-900">Request a payout</p>
                <p className="text-sm text-gray-500 mt-0.5">
                  Withdraw your available balance to your bank account.
                  {wallet?.is_simulated !== false && (
                    <span className="ml-1 text-amber-600">Simulated — no real transfer.</span>
                  )}
                </p>
              </div>
              <button
                onClick={() => setShowPayoutForm(true)}
                disabled={balance <= 0}
                className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
              >
                Withdraw Funds
              </button>
            </div>
          ) : (
            <form onSubmit={handlePayout} className="space-y-4">
              <h3 className="font-semibold text-gray-900">Payout Details</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="label">Amount (SAR) *</label>
                  <input
                    type="number"
                    required
                    min="1"
                    max={balance}
                    step="0.01"
                    value={payoutForm.amount}
                    onChange={(e) => setPayoutForm((f) => ({ ...f, amount: e.target.value }))}
                    className="input"
                    placeholder={`Max ${balance}`}
                  />
                </div>
                <div>
                  <label className="label">Bank Name</label>
                  <input
                    type="text"
                    value={payoutForm.bank_name}
                    onChange={(e) => setPayoutForm((f) => ({ ...f, bank_name: e.target.value }))}
                    className="input"
                    placeholder="Al Rajhi Bank"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="label">IBAN</label>
                  <input
                    type="text"
                    value={payoutForm.iban}
                    onChange={(e) => setPayoutForm((f) => ({ ...f, iban: e.target.value }))}
                    className="input"
                    placeholder="SA00 0000 0000 0000 0000 0000"
                  />
                </div>
              </div>
              {payoutMsg && (
                <div className={`text-sm rounded-xl px-4 py-3 ${
                  payoutMsg.ok
                    ? 'bg-green-50 border border-green-200 text-green-700'
                    : 'bg-red-50 border border-red-200 text-red-700'
                }`}>{payoutMsg.text}</div>
              )}
              <div className="flex gap-3">
                <button type="submit" disabled={payoutLoading || !payoutForm.amount} className="btn-primary disabled:opacity-50">
                  {payoutLoading ? <Spinner size="sm" /> : 'Confirm Payout'}
                </button>
                <button type="button" onClick={() => { setShowPayoutForm(false); setPayoutMsg(null) }} className="btn-secondary">
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {pendingPayout && (
        <div className="card p-4 bg-amber-50 border border-amber-200">
          <p className="text-sm text-amber-800">
            ⏳ Payout of <strong>{formatCurrency(pendingPayout.amount)}</strong> is currently being processed.
          </p>
        </div>
      )}

      {payoutMsg && !showPayoutForm && (
        <div className={`text-sm rounded-xl px-4 py-3 ${
          payoutMsg.ok
            ? 'bg-green-50 border border-green-200 text-green-700'
            : 'bg-red-50 border border-red-200 text-red-700'
        }`}>{payoutMsg.text}</div>
      )}

      {/* Ledger */}
      <div>
        <h2 className="font-semibold text-gray-900 mb-3">Transaction History</h2>
        {ledger.length === 0 ? (
          <div className="card p-8 text-center text-gray-400">
            <div className="text-3xl mb-2">📭</div>
            <p className="text-sm">No transactions yet. Revenue from tips and ticket sales will appear here.</p>
          </div>
        ) : (
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Type</th>
                  <th className="text-end px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Amount</th>
                  <th className="text-end px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden sm:table-cell">Balance after</th>
                  <th className="text-end px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden md:table-cell">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {ledger.map((entry) => (
                  <tr key={entry.id} className="hover:bg-gray-50/50">
                    <td className="px-4 py-3 text-gray-700">
                      {REASON_LABELS[entry.reason] ?? entry.reason}
                      {entry.note && <span className="text-xs text-gray-400 ml-2">{entry.note}</span>}
                    </td>
                    <td className={`px-4 py-3 text-end font-semibold ${
                      entry.type === 'credit' ? 'text-green-600' : 'text-red-500'
                    }`}>
                      {entry.type === 'credit' ? '+' : '-'}{formatCurrency(entry.amount)}
                    </td>
                    <td className="px-4 py-3 text-end text-gray-500 hidden sm:table-cell">
                      {formatCurrency(entry.balance_after)}
                    </td>
                    <td className="px-4 py-3 text-end text-gray-400 hidden md:table-cell">
                      {new Date(entry.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Payout history */}
      {payouts.length > 0 && (
        <div>
          <h2 className="font-semibold text-gray-900 mb-3">Payout History</h2>
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Amount</th>
                  <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                  <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden sm:table-cell">Bank</th>
                  <th className="text-end px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {payouts.map((p) => (
                  <tr key={p.id} className="hover:bg-gray-50/50">
                    <td className="px-4 py-3 font-semibold text-gray-900">{formatCurrency(p.amount)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${
                        p.status === 'completed'  ? 'bg-green-100 text-green-700' :
                        p.status === 'pending'    ? 'bg-amber-100 text-amber-700' :
                        p.status === 'processing' ? 'bg-blue-100 text-blue-700'   :
                        'bg-red-100 text-red-700'
                      }`}>
                        {p.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 hidden sm:table-cell">{p.bank_name ?? '—'}</td>
                    <td className="px-4 py-3 text-end text-gray-400">
                      {new Date(p.requested_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
