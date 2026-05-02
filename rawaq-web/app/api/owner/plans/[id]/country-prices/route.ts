import { NextRequest } from 'next/server'
import { z } from 'zod'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireOwner } from '@/lib/auth'
import { handleApiError, ok } from '@/lib/errors'

const UpsertPriceSchema = z.object({
  country_code:  z.string().length(2).toUpperCase(),
  currency_code: z.string().min(3).max(3).toUpperCase(),
  amount:        z.number().min(0),
})

// PUT /api/owner/plans/:id/country-prices — upsert a country price override
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireOwner()
    const { id: plan_id } = await params
    const body = await req.json()
    const input = UpsertPriceSchema.parse(body)

    const admin = createSupabaseAdminClient()
    const { data, error } = await admin
      .from('plan_country_prices')
      .upsert({ plan_id, ...input, updated_at: new Date().toISOString() } as never, {
        onConflict: 'plan_id,country_code',
      })
      .select()
      .single()

    if (error) throw error
    return ok({ price: data })
  } catch (err) {
    return handleApiError(err)
  }
}
