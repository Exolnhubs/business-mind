import { NextRequest } from 'next/server'
import { z } from 'zod'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/auth'
import { handleApiError, ok, created, ForbiddenException, BadRequestException } from '@/lib/errors'

const RequestPayoutSchema = z.object({
  amount:    z.number().positive(),
  bank_name: z.string().min(2).max(100).optional(),
  iban:      z.string().min(15).max(34).optional(),
})

// GET /api/organizer/payouts — list all payouts for the organizer
export async function GET(req: NextRequest) {
  try {
    const ctx = await requireAuth()
    if (ctx.role !== 'organizer' && ctx.role !== 'admin') {
      throw new ForbiddenException('Organizer access required')
    }

    const page    = Number(req.nextUrl.searchParams.get('page')     ?? 1)
    const perPage = Number(req.nextUrl.searchParams.get('per_page') ?? 20)
    const from    = (page - 1) * perPage

    const supabase = await createSupabaseServerClient()

    const { data, count, error } = await supabase
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

// POST /api/organizer/payouts — request a payout
// MVP: simulated — auto-completes immediately (debit via trigger)
export async function POST(req: NextRequest) {
  try {
    const ctx = await requireAuth()
    if (ctx.role !== 'organizer') {
      throw new ForbiddenException('Organizer access required')
    }

    const body  = await req.json()
    const input = RequestPayoutSchema.parse(body)

    const supabase = await createSupabaseServerClient()

    // Check wallet balance
    const { data: wallet } = await supabase
      .from('organizer_wallet')
      .select('balance, currency')
      .eq('organizer_id', ctx.userId)
      .maybeSingle()

    const balance = wallet?.balance ?? 0
    if (input.amount > balance) {
      throw new BadRequestException(
        `Insufficient balance. Available: ${balance} ${wallet?.currency ?? 'SAR'}`
      )
    }

    // Block if there's already a pending payout
    const { data: existing } = await supabase
      .from('payouts')
      .select('id')
      .eq('organizer_id', ctx.userId)
      .in('status', ['pending', 'processing'])
      .maybeSingle()

    if (existing) {
      throw new BadRequestException('You already have a payout in progress. Please wait for it to complete.')
    }

    // Insert payout — for simulated MVP, immediately mark as completed
    // The trg_payout_wallet_debit trigger fires on status = 'completed'
    const { data: payout, error } = await supabase
      .from('payouts')
      .insert({
        organizer_id: ctx.userId,
        amount:       input.amount,
        bank_name:    input.bank_name ?? null,
        iban:         input.iban      ?? null,
        status:       'completed',   // simulated: instant
        processed_at: new Date().toISOString(),
        gateway_ref:  `sim_payout_${Date.now()}`,
        is_simulated: true,
      })
      .select()
      .single()

    if (error) throw error

    return created(payout)
  } catch (err) {
    return handleApiError(err)
  }
}
