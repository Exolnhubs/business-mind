/**
 * GET  /api/organizer/bank-account  — fetch saved bank account (null if none)
 * POST /api/organizer/bank-account  — create or update bank account (upsert)
 */

import { NextRequest } from 'next/server'
import { z } from 'zod'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireOrganizer } from '@/lib/auth'
import { handleApiError, ok } from '@/lib/errors'

const BankAccountSchema = z.object({
  bank_name:           z.string().min(2).max(120),
  bank_name_ar:        z.string().max(120).optional().nullable(),
  account_holder_name: z.string().min(2).max(200),
  iban:                z.string().min(15).max(34).transform((v) => v.replace(/\s+/g, '').toUpperCase()),
  swift_code:          z.string().min(8).max(11).optional().nullable(),
  country:             z.string().length(2).default('SA'),
})

export async function GET() {
  try {
    const ctx   = await requireOrganizer()
    const admin = createSupabaseAdminClient()

    const { data, error } = await (admin as any)
      .from('organizer_bank_accounts')
      .select('*')
      .eq('organizer_id', ctx.userId)
      .maybeSingle()

    if (error) throw error

    return ok({ bank_account: data ?? null })
  } catch (err) {
    return handleApiError(err)
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx   = await requireOrganizer()
    const body  = await req.json()
    const input = BankAccountSchema.parse(body)

    const admin = createSupabaseAdminClient()

    const { data, error } = await (admin as any)
      .from('organizer_bank_accounts')
      .upsert(
        {
          organizer_id:        ctx.userId,
          bank_name:           input.bank_name,
          bank_name_ar:        input.bank_name_ar ?? null,
          account_holder_name: input.account_holder_name,
          iban:                input.iban,
          swift_code:          input.swift_code ?? null,
          country:             input.country,
          updated_at:          new Date().toISOString(),
          // Reset verification on update — admin must re-verify changed details
          is_verified:         false,
        },
        { onConflict: 'organizer_id' },
      )
      .select()
      .single()

    if (error) throw error

    return ok({ bank_account: data })
  } catch (err) {
    return handleApiError(err)
  }
}
