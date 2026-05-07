import { createSupabaseServerClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/auth'
import { handleApiError, ok, ForbiddenException } from '@/lib/errors'

// GET /api/organizer/wallet
// Returns: wallet balance + last 30 ledger entries + pending payout summary
export async function GET() {
  try {
    const ctx = await requireAuth()
    if (ctx.role !== 'organizer' && ctx.role !== 'admin') {
      throw new ForbiddenException('Organizer access required')
    }

    const supabase = await createSupabaseServerClient()

    const [walletRes, ledgerRes, pendingPayoutRes] = await Promise.all([
      supabase
        .from('organizer_wallet')
        .select('*')
        .eq('organizer_id', ctx.userId)
        .maybeSingle(),

      supabase
        .from('wallet_ledger')
        .select('id, type, reason, amount, balance_before, balance_after, note, created_at')
        .eq('organizer_id', ctx.userId)
        .order('created_at', { ascending: false })
        .limit(30),

      supabase
        .from('payouts')
        .select('id, amount, status, requested_at')
        .eq('organizer_id', ctx.userId)
        .in('status', ['pending', 'processing'])
        .order('requested_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])

    // Return empty wallet if organizer hasn't received any payments yet
    const wallet = walletRes.data ?? {
      organizer_id: ctx.userId,
      balance: 0,
      held_balance: 0,
      total_earned: 0,
      total_withdrawn: 0,
      currency: 'SAR',
    }

    return ok({
      wallet,
      ledger: ledgerRes.data ?? [],
      pending_payout: pendingPayoutRes.data ?? null,
    })
  } catch (err) {
    return handleApiError(err)
  }
}
