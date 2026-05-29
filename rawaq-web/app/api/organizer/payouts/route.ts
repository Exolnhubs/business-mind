import { NextRequest } from 'next/server'
import { z } from 'zod'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireAuth } from '@/lib/auth'
import { parsePerPage, parsePage } from '@/lib/pagination'
import { handleApiError, ok, created, ForbiddenException, BadRequestException } from '@/lib/errors'

const RequestPayoutSchema = z.object({
  amount: z.number().positive(),
})

// GET /api/organizer/payouts — list all payouts for the organizer
export async function GET(req: NextRequest) {
  try {
    const ctx = await requireAuth()
    if (ctx.role !== 'organizer' && ctx.role !== 'admin') {
      throw new ForbiddenException('Organizer access required')
    }

    const page    = parsePage(req.nextUrl.searchParams.get('page'))
    const perPage = parsePerPage(req.nextUrl.searchParams.get('per_page'), 20)
    const from    = (page - 1) * perPage

    const admin = createSupabaseAdminClient()

    const { data, count, error } = await admin
      .from('payouts')
      .select('*', { count: 'exact' })
      .eq('organizer_id', ctx.userId)
      .order('requested_at', { ascending: false })
      .range(from, from + perPage - 1)

    if (error) throw error

    return ok({ data, total: count ?? 0, page, per_page: perPage })
  } catch (err) {
    return handleApiError(err)
  }
}

// POST /api/organizer/payouts — request a real payout
// Requires a saved bank account. Creates a 'pending' payout for admin to process.
export async function POST(req: NextRequest) {
  try {
    const ctx = await requireAuth()
    if (ctx.role !== 'organizer') {
      throw new ForbiddenException('Organizer access required')
    }

    const body  = await req.json()
    const input = RequestPayoutSchema.parse(body)

    const admin = createSupabaseAdminClient()

    // ── Require saved bank account ────────────────────────────────────────────
    const { data: bankAccount } = await admin
      .from('organizer_bank_accounts')
      .select('id, bank_name, account_holder_name, iban, country')
      .eq('organizer_id', ctx.userId)
      .maybeSingle()

    if (!bankAccount) {
      return new Response(
        JSON.stringify({
          error:                 'Bank account required',
          requires_bank_account: true,
          message:               'Please add your bank account details before requesting a withdrawal.',
        }),
        { status: 422, headers: { 'Content-Type': 'application/json' } },
      )
    }

    // ── Check wallet balance ──────────────────────────────────────────────────
    const { data: wallet } = await admin
      .from('organizer_wallet')
      .select('balance, currency')
      .eq('organizer_id', ctx.userId)
      .maybeSingle()

    const balance = wallet?.balance ?? 0
    if (input.amount > balance) {
      throw new BadRequestException(
        `Insufficient balance. Available: ${balance} ${wallet?.currency ?? 'SAR'}`,
      )
    }

    // ── Block duplicate in-flight payout ─────────────────────────────────────
    const { data: existing } = await admin
      .from('payouts')
      .select('id')
      .eq('organizer_id', ctx.userId)
      .in('status', ['pending', 'processing'])
      .maybeSingle()

    if (existing) {
      throw new BadRequestException(
        'You already have a payout in progress. Please wait for it to complete.',
      )
    }

    // ── Insert payout (pending — admin processes and marks completed) ─────────
    // Snapshot bank details at request time so payout history is auditable
    // even if the organizer later changes their bank account.
    const { data: payout, error } = await admin
      .from('payouts')
      .insert({
        organizer_id:    ctx.userId,
        amount:          input.amount,
        currency:        wallet?.currency ?? 'SAR',
        status:          'pending',
        bank_account_id: bankAccount.id,
        bank_name:       bankAccount.bank_name,
        iban:            bankAccount.iban,
        is_simulated:    false,
      } as never)
      .select()
      .single()

    if (error) throw error

    return created(payout)
  } catch (err) {
    return handleApiError(err)
  }
}
