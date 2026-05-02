import { NextRequest } from 'next/server'
import { z } from 'zod'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireOwner } from '@/lib/auth'
import { handleApiError, ok, NotFoundException } from '@/lib/errors'

const UpdatePlanSchema = z.object({
  name:                z.string().min(1).max(80).optional(),
  name_ar:             z.string().min(1).max(80).optional(),
  price_sar:           z.number().min(0).optional(),
  billing_interval:    z.enum(['free', 'monthly', 'yearly']).optional(),
  events_per_month:    z.number().int().min(1).nullable().optional(),
  attendees_per_event: z.number().int().min(1).nullable().optional(),
  platform_fee_pct:    z.number().min(0).max(1).optional(),
  features:            z.record(z.unknown()).optional(),
  is_active:           z.boolean().optional(),
  sort_order:          z.number().int().min(0).optional(),
})

// GET /api/owner/plans/:id
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireOwner()
    const { id } = await params
    const admin = createSupabaseAdminClient()

    const [{ data: plan, error: planErr }, { data: prices, error: pricesErr }] = await Promise.all([
      admin.from('plan_definitions').select('*').eq('id', id).single(),
      admin.from('plan_country_prices').select('*').eq('plan_id', id).order('country_code'),
    ])
    if (planErr) throw planErr
    if (!plan) throw new NotFoundException('Plan')
    if (pricesErr) throw pricesErr

    return ok({ plan, countryPrices: prices ?? [] })
  } catch (err) {
    return handleApiError(err)
  }
}

// PATCH /api/owner/plans/:id
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireOwner()
    const { id } = await params
    const body = await req.json()
    const updates = UpdatePlanSchema.parse(body)

    const admin = createSupabaseAdminClient()
    const { data, error } = await admin
      .from('plan_definitions')
      .update({ ...updates, updated_at: new Date().toISOString() } as never)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    if (!data) throw new NotFoundException('Plan')
    return ok({ plan: data })
  } catch (err) {
    return handleApiError(err)
  }
}

// DELETE /api/owner/plans/:id — soft deactivate only (preserves subscriptions)
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireOwner()
    const { id } = await params
    const admin = createSupabaseAdminClient()

    const { error } = await admin
      .from('plan_definitions')
      .update({ is_active: false, updated_at: new Date().toISOString() } as never)
      .eq('id', id)

    if (error) throw error
    return ok({ ok: true })
  } catch (err) {
    return handleApiError(err)
  }
}
