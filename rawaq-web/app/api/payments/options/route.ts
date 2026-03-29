/**
 * GET /api/payments/options?currency=EGP
 *
 * Returns available payment options for a given currency.
 * Called by the checkout form to dynamically show the right payment methods.
 */

import { NextRequest } from 'next/server'
import { handleApiError, ok } from '@/lib/errors'
import { getPaymentOptions } from '@/lib/gateways/selector'

export async function GET(req: NextRequest) {
  try {
    const currency = req.nextUrl.searchParams.get('currency') ?? 'SAR'
    const options  = getPaymentOptions(currency)
    return ok(options)
  } catch (err) {
    return handleApiError(err)
  }
}
