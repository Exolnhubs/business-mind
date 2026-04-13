'use client'

import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/auth-context'
import { Spinner } from '@/components/ui/Spinner'
import { clientFetchInvalidate, clientGetJson } from '@/lib/client-fetch'
import { formatCurrency } from '@/lib/utils'
import type { OrganizerWallet, WalletLedgerEntry, Payout } from '@/types/database'

interface BankAccount {
  id: string
  bank_name: string
  bank_name_ar: string | null
  account_holder_name: string
  iban: string
  swift_code: string | null
  country: string
  is_verified: boolean
}

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
  const cacheScopeKey = user?.id ?? null

  const [wallet,        setWallet]        = useState<OrganizerWallet | null>(null)
  const [ledger,        setLedger]        = useState<WalletLedgerEntry[]>([])
  const [payouts,       setPayouts]       = useState<Payout[]>([])
  const [pendingPayout, setPendingPayout] = useState<Payout | null>(null)
  const [bankAccount,   setBankAccount]   = useState<BankAccount | null>(null)
  const [loading,       setLoading]       = useState(true)

  // Payout form
  const [showPayoutForm, setShowPayoutForm] = useState(false)
  const [payoutAmount,   setPayoutAmount]   = useState('')
  const [payoutLoading,  setPayoutLoading]  = useState(false)
  const [payoutMsg,      setPayoutMsg]      = useState<{ ok: boolean; text: string } | null>(null)

  // Bank account form
  const [showBankForm, setShowBankForm] = useState(false)
  const [bankForm,     setBankForm]     = useState({
    bank_name:           '',
    bank_name_ar:        '',
    account_holder_name: '',
    iban:                '',
    swift_code:          '',
    country:             'SA',
  })
  const [bankLoading, setBankLoading] = useState(false)
  const [bankMsg,     setBankMsg]     = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    if (!authLoading && !user) router.replace('/login')
    if (!authLoading && profile?.role !== 'organizer') router.replace('/organizer')
  }, [authLoading, user, profile, router])

  const loadEarnings = useCallback(async (force = false) => {
    if (!user) return
    setLoading(true)
    try {
      const [walletData, payoutsData, bankData] = await Promise.all([
        clientGetJson<{ data?: { wallet?: OrganizerWallet | null; ledger?: WalletLedgerEntry[]; pending_payout?: Payout | null } }>(
          '/api/organizer/wallet',
          { ttlMs: 60_000, force, scopeKey: cacheScopeKey },
        ),
        clientGetJson<{ data?: { data?: Payout[] } }>(
          '/api/organizer/payouts?per_page=10',
          { ttlMs: 60_000, force, scopeKey: cacheScopeKey },
        ),
        clientGetJson<{ data?: { bank_account?: BankAccount | null } }>(
          '/api/organizer/bank-account',
          { ttlMs: 60_000, force, scopeKey: cacheScopeKey },
        ),
      ])

      setWallet(walletData.data?.wallet ?? null)
      setLedger(walletData.data?.ledger ?? [])
      setPendingPayout(walletData.data?.pending_payout ?? null)
      setPayouts(payoutsData.data?.data ?? [])
      setBankAccount(bankData.data?.bank_account ?? null)
    } finally {
      setLoading(false)
    }
  }, [cacheScopeKey, user])

  useEffect(() => {
    void loadEarnings()
  }, [loadEarnings])

  function openEditBankForm(account: BankAccount | null) {
    setBankForm({
      bank_name:           account?.bank_name           ?? '',
      bank_name_ar:        account?.bank_name_ar        ?? '',
      account_holder_name: account?.account_holder_name ?? '',
      iban:                account?.iban                 ?? '',
      swift_code:          account?.swift_code          ?? '',
      country:             account?.country             ?? 'SA',
    })
    setBankMsg(null)
    setShowBankForm(true)
    setShowPayoutForm(false)
  }

  async function handleSaveBankAccount(e: FormEvent) {
    e.preventDefault()
    setBankLoading(true)
    setBankMsg(null)

    const res = await fetch('/api/organizer/bank-account', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bank_name:           bankForm.bank_name,
        bank_name_ar:        bankForm.bank_name_ar  || undefined,
        account_holder_name: bankForm.account_holder_name,
        iban:                bankForm.iban,
        swift_code:          bankForm.swift_code   || undefined,
        country:             bankForm.country       || 'SA',
      }),
    })

    const json = await res.json()
    setBankLoading(false)

    if (res.ok) {
      clientFetchInvalidate('/api/organizer', cacheScopeKey)
      setBankAccount(json.data?.bank_account ?? null)
      setBankMsg({ ok: true, text: '✓ Banking details saved.' })
      setShowBankForm(false)
    } else {
      setBankMsg({ ok: false, text: json.error ?? 'Failed to save bank account.' })
    }
  }

  async function handlePayout(e: FormEvent) {
    e.preventDefault()
    setPayoutLoading(true)
    setPayoutMsg(null)

    const res = await fetch('/api/organizer/payouts', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ amount: parseFloat(payoutAmount) }),
    })

    const json = await res.json()

    if (res.status === 422 && json.requires_bank_account) {
      setPayoutLoading(false)
      setShowPayoutForm(false)
      setBankAccount(null)
      openEditBankForm(null)
      return
    }

    if (res.ok) {
      clientFetchInvalidate('/api/organizer', cacheScopeKey)
      await loadEarnings(true)
      setPayoutMsg({
        ok:   true,
        text: `✓ Withdrawal of ${formatCurrency(parseFloat(payoutAmount))} requested. Processing in 1–3 business days.`,
      })
      setPayoutAmount('')
      setShowPayoutForm(false)
    } else {
      setPayoutMsg({ ok: false, text: json.error ?? 'Payout failed.' })
    }
    setPayoutLoading(false)
  }

  if (authLoading || loading) {
    return <div className="flex items-center justify-center h-[60vh]"><Spinner size="lg" /></div>
  }

  const balance        = wallet?.balance ?? 0
  const pendingAmount  = pendingPayout?.amount ?? 0
  const availableToWithdraw = Math.max(0, balance - pendingAmount)

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
        <div className="card p-5 bg-brand-50 border border-brand-200">
          <div className="text-2xl mb-1">💰</div>
          <div className="text-2xl font-bold text-brand-700">{formatCurrency(availableToWithdraw)}</div>
          <div className="text-xs text-gray-500 mt-0.5">Available to Withdraw</div>
          {pendingAmount > 0 && (
            <div className="text-xs text-amber-600 mt-1">
              🔒 {formatCurrency(pendingAmount)} pending withdrawal
            </div>
          )}
        </div>
        {[
          { label: 'Total Earned',    value: formatCurrency(wallet?.total_earned ?? 0),    icon: '📈' },
          { label: 'Total Withdrawn', value: formatCurrency(wallet?.total_withdrawn ?? 0), icon: '🏦' },
        ].map((s) => (
          <div key={s.label} className="card p-5">
            <div className="text-2xl mb-1">{s.icon}</div>
            <div className="text-2xl font-bold text-gray-900">{s.value}</div>
            <div className="text-xs text-gray-500 mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* ── Banking details ─────────────────────────────────────────────────── */}
      <div className="card p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-semibold text-gray-900">Banking details</h2>
            {bankAccount ? (
              <div className="mt-1 space-y-0.5">
                <p className="text-sm text-gray-700 font-medium">
                  {bankAccount.bank_name}
                  {bankAccount.is_verified && (
                    <span className="ml-2 text-xs font-semibold text-green-600">✓ Verified</span>
                  )}
                </p>
                <p className="text-xs text-gray-500 font-mono">
                  {bankAccount.iban.replace(/(.{4})/g, '$1 ').trim()}
                </p>
                <p className="text-xs text-gray-500">{bankAccount.account_holder_name}</p>
              </div>
            ) : (
              <p className="text-sm text-amber-600 mt-1">
                No banking details saved — required to request a withdrawal.
              </p>
            )}
          </div>
          <button
            onClick={() => openEditBankForm(bankAccount)}
            className="btn-secondary text-sm whitespace-nowrap"
          >
            {bankAccount ? 'Edit' : 'Add banking details'}
          </button>
        </div>

        {/* Bank account form (inline) */}
        {showBankForm && (
          <form onSubmit={handleSaveBankAccount} className="mt-5 border-t border-gray-100 pt-5 space-y-4">
            <h3 className="font-semibold text-gray-900 text-sm">
              {bankAccount ? 'Update banking details' : 'Add banking details'}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label">Bank Name (English) *</label>
                <input
                  type="text"
                  required
                  value={bankForm.bank_name}
                  onChange={(e) => setBankForm((f) => ({ ...f, bank_name: e.target.value }))}
                  className="input"
                  placeholder="Al Rajhi Bank"
                />
              </div>
              <div>
                <label className="label">اسم البنك (Arabic)</label>
                <input
                  type="text"
                  value={bankForm.bank_name_ar}
                  onChange={(e) => setBankForm((f) => ({ ...f, bank_name_ar: e.target.value }))}
                  className="input text-right"
                  placeholder="بنك الراجحي"
                  dir="rtl"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="label">Account Holder Name *</label>
                <input
                  type="text"
                  required
                  value={bankForm.account_holder_name}
                  onChange={(e) => setBankForm((f) => ({ ...f, account_holder_name: e.target.value }))}
                  className="input"
                  placeholder="Mohammed Al-Hassan"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="label">IBAN *</label>
                <input
                  type="text"
                  required
                  value={bankForm.iban}
                  onChange={(e) => setBankForm((f) => ({ ...f, iban: e.target.value.toUpperCase() }))}
                  className="input font-mono"
                  placeholder="SA29 0000 0000 0000 0000 0000"
                  minLength={15}
                  maxLength={34}
                />
              </div>
              <div>
                <label className="label">SWIFT / BIC Code</label>
                <input
                  type="text"
                  value={bankForm.swift_code}
                  onChange={(e) => setBankForm((f) => ({ ...f, swift_code: e.target.value.toUpperCase() }))}
                  className="input font-mono"
                  placeholder="RJHISARI"
                  minLength={8}
                  maxLength={11}
                />
              </div>
            </div>
            {bankMsg && (
              <div className={`text-sm rounded-xl px-4 py-3 ${
                bankMsg.ok
                  ? 'bg-green-50 border border-green-200 text-green-700'
                  : 'bg-red-50 border border-red-200 text-red-700'
              }`}>{bankMsg.text}</div>
            )}
            <div className="flex gap-3">
              <button type="submit" disabled={bankLoading} className="btn-primary disabled:opacity-50">
                {bankLoading ? <Spinner size="sm" /> : 'Save Details'}
              </button>
              <button
                type="button"
                onClick={() => { setShowBankForm(false); setBankMsg(null) }}
                className="btn-secondary"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>

      {/* ── Payout CTA ──────────────────────────────────────────────────────── */}
      {!pendingPayout && (
        <div className="card p-5">
          {!showPayoutForm ? (
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <p className="font-medium text-gray-900">Request a withdrawal</p>
                <p className="text-sm text-gray-500 mt-0.5">
                  {bankAccount
                    ? `To ${bankAccount.bank_name} · ····${bankAccount.iban.slice(-4)}`
                    : 'Add banking details above before withdrawing.'}
                </p>
              </div>
              <button
                onClick={() => { setShowPayoutForm(true); setPayoutMsg(null) }}
                disabled={availableToWithdraw <= 0 || !bankAccount}
                className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
              >
                Withdraw Funds
              </button>
            </div>
          ) : (
            <form onSubmit={handlePayout} className="space-y-4">
              <h3 className="font-semibold text-gray-900">Withdrawal details</h3>

              {bankAccount && (
                <div className="bg-gray-50 rounded-xl px-4 py-3 text-sm text-gray-600">
                  To: <span className="font-medium text-gray-800">{bankAccount.bank_name}</span>
                  {' · '}
                  <span className="font-mono text-xs">{bankAccount.iban.replace(/(.{4})/g, '$1 ').trim()}</span>
                </div>
              )}

              <div>
                <label className="label">Amount ({wallet?.currency ?? 'SAR'}) *</label>
                <input
                  type="number"
                  required
                  min="1"
                  max={availableToWithdraw}
                  step="0.01"
                  value={payoutAmount}
                  onChange={(e) => setPayoutAmount(e.target.value)}
                  className="input"
                  placeholder={`Max ${availableToWithdraw}`}
                />
              </div>

              <p className="text-xs text-gray-400">
                ℹ️ Payouts are processed within 1–3 business days.
              </p>

              {payoutMsg && (
                <div className={`text-sm rounded-xl px-4 py-3 ${
                  payoutMsg.ok
                    ? 'bg-green-50 border border-green-200 text-green-700'
                    : 'bg-red-50 border border-red-200 text-red-700'
                }`}>{payoutMsg.text}</div>
              )}
              <div className="flex gap-3">
                <button type="submit" disabled={payoutLoading || !payoutAmount} className="btn-primary disabled:opacity-50">
                  {payoutLoading ? <Spinner size="sm" /> : 'Request Withdrawal'}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowPayoutForm(false); setPayoutMsg(null) }}
                  className="btn-secondary"
                >
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
            <p className="text-sm">No transactions yet. Revenue from donations and ticket sales will appear here.</p>
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
