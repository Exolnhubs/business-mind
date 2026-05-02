/**
 * GET /api/admin/payouts
 * Admin-only: list all payout requests with organizer details.
 * Query params: status (filter), page, per_page
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

    let query = admin
      .from('payouts')
      .select(`
        id, amount, currency, status, bank_name, iban,
        bank_account_id, gateway_ref, failure_reason,
        requested_at, processed_at,
        organizer:organizer_id (
          id,
          display_name,
          organizer_profiles!user_id ( business_name )
        ),
        bank_account:bank_account_id (
          bank_name, bank_name_ar, account_holder_name, iban, swift_code, country, is_verified
        )
      `, { count: 'exact' })
      .order('requested_at', { ascending: false })
      .range(from, from + perPage - 1)

    if (status !== 'all') {
      query = query.eq('status', status as never)
    }

    const { data, count, error } = await query
    if (error) throw error

    return ok({ data, total: count ?? 0, page, per_page: perPage })
  } catch (err) {
    return handleApiError(err)
  }
}
