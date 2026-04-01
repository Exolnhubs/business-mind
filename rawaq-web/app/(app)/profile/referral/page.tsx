'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Spinner } from '@/components/ui/Spinner'
import type { UserCoupon } from '@/types/database'

interface ReferralData {
  code: string
  referral_url: string
  clicks: number
  signups: number
  conversions: number
  coupons: UserCoupon[]
}

function CouponCard({ coupon }: { coupon: UserCoupon }) {
  const promo = coupon.promo
  if (!promo) return null
  const isUsed    = promo.used_count >= 1
  const isExpired = new Date(coupon.expires_at) < new Date()
  const status    = isUsed ? 'used' : isExpired ? 'expired' : 'active'
  const statusStyles = {
    active:  'bg-green-100 text-green-700',
    used:    'bg-gray-100 text-gray-500 line-through',
    expired: 'bg-red-50 text-red-400',
  }[status]

  return (
    <div className={`card p-4 flex items-center justify-between gap-3 ${isUsed || isExpired ? 'opacity-60' : ''}`}>
      <div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm font-bold text-gray-900 tracking-wide">{promo.code}</span>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusStyles}`}>{status}</span>
        </div>
        <p className="text-xs text-gray-500 mt-0.5">
          {promo.discount_type === 'percent' ? `${promo.discount_value}% off` : `${promo.discount_value} off`}
          {' · '}
          {coupon.reason === 'referral_signup' ? 'Signup reward' : 'First booking reward'}
          {' · '}
          Expires {new Date(coupon.expires_at).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })}
        </p>
      </div>
      {status === 'active' && (
        <button
          onClick={() => navigator.clipboard.writeText(promo.code)}
          className="text-xs btn-secondary px-3 py-1.5 shrink-0"
        >
          Copy
        </button>
      )}
    </div>
  )
}

export default function ReferralPage() {
  const [data, setData]     = useState<ReferralData | null>(null)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied]   = useState(false)

  useEffect(() => {
    fetch('/api/referral/code')
      .then((r) => r.json())
      .then(({ data }) => setData(data))
      .finally(() => setLoading(false))
  }, [])

  async function handleShare() {
    if (!data) return
    if (navigator.share) {
      await navigator.share({
        title: 'Join me on Rawaq 🎟️',
        text:  'Discover and book amazing local events. Use my link to join:',
        url:   data.referral_url,
      }).catch(() => {})
    } else {
      await navigator.clipboard.writeText(data.referral_url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    }
  }

  if (loading) return <div className="flex justify-center py-16"><Spinner /></div>
  if (!data)   return <div className="text-center py-16 text-gray-400">Could not load referral info.</div>

  const activeCoupons = data.coupons.filter((c) => c.promo && c.promo.used_count === 0 && new Date(c.expires_at) > new Date())

  return (
    <div className="max-w-xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/profile" className="text-gray-400 hover:text-gray-600 text-sm">← Profile</Link>
        <h1 className="text-xl font-bold text-gray-900">Refer &amp; Earn</h1>
      </div>

      {/* Hero explainer */}
      <div className="card p-5 bg-brand-50 border-brand-100 space-y-2">
        <p className="font-semibold text-gray-900">Invite friends, earn discounts 🎁</p>
        <ul className="text-sm text-gray-600 space-y-1">
          <li>✅ Friend registers with your link → <strong>15% off coupon</strong> for you</li>
          <li>🎟️ Friend makes their first paid booking → <strong>25% off coupon</strong> for you</li>
        </ul>
      </div>

      {/* Share link */}
      <div className="card p-5 space-y-3">
        <p className="text-sm font-medium text-gray-700">Your referral link</p>
        <div className="flex items-center gap-2">
          <input
            readOnly
            value={data.referral_url}
            className="input text-sm bg-gray-50 text-gray-600 flex-1 font-mono"
          />
          <button onClick={handleShare} className="btn-primary text-sm shrink-0">
            {copied ? 'Copied! ✓' : 'Share'}
          </button>
        </div>
        <p className="text-xs text-gray-400">Code: <strong className="font-mono">{data.code}</strong></p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Link clicks',    value: data.clicks },
          { label: 'Friends joined', value: data.signups },
          { label: 'Converted',      value: data.conversions },
        ].map(({ label, value }) => (
          <div key={label} className="card p-4 text-center">
            <p className="text-2xl font-bold text-brand-600">{value}</p>
            <p className="text-xs text-gray-500 mt-1">{label}</p>
          </div>
        ))}
      </div>

      {/* Coupons */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">Your Coupons</h2>
          {activeCoupons.length > 0 && (
            <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
              {activeCoupons.length} active
            </span>
          )}
        </div>
        {data.coupons.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">
            Share your link to start earning coupons.
          </p>
        ) : (
          <div className="space-y-2">
            {data.coupons.map((c) => <CouponCard key={c.id} coupon={c} />)}
          </div>
        )}
      </div>
    </div>
  )
}
