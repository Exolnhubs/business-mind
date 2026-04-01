/**
 * GET /api/admin/refunds
 * Admin-only: list all refund requests with user + booking + payment details.
 */

import { NextRequest } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/auth'
import { handleApiError, ok } from '@/lib/errors'

export async function GET(req: NextRequest) {
  try {
    await requireAdmin()

    const status  = req.nextUrl.searchParams.get('status') ?? 'pending'
    const page    = Number(req.nextUrl.searchParams.get('page')     ?? 1)
    const perPage = Number(req.nextUrl.searchParams.get('per_page') ?? 25)
    const from    = (page - 1) * perPage

    const admin = createSupabaseAdminClient()

    let query = (admin as any)
      .from('refunds')
      .select(`
        id, amount, status, user_note, refund_method, gateway_ref,
        requested_by, processed_at, created_at,
        requester:requested_by (
          id, display_name
        ),
        booking:booking_id (
          id, status,
          event:events ( id, title, title_ar )
        ),
        transaction:payment_transaction_id (
          id, amount, currency, status, gateway, payment_method
        )
      `, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, from + perPage - 1)

    if (status !== 'all') {
      query = query.eq('status', status)
    }

    const { data, count, error } = await query
    if (error) throw error

    return ok({ data, total: count ?? 0, page, per_page: perPage })
  } catch (err) {
    return handleApiError(err)
  }
}
