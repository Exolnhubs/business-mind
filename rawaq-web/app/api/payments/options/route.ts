/**
 * GET /api/payments/options?currency=EGP
 *
 * Returns available payment options for a given currency.
 * Called by the checkout form to dynamically show the right payment methods.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getPaymentOptions } from '@/lib/gateways/selector'

export const runtime = 'edge'

export async function GET(req: NextRequest) {
  try {
    const currency = req.nextUrl.searchParams.get('currency') ?? 'SAR'
    const options = getPaymentOptions(currency)
    return NextResponse.json(
      { data: options },
      {
        status: 200,
        headers: {
          'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
        },
      },
    )
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
