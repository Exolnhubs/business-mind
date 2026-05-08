import { NextRequest } from 'next/server'
import { z } from 'zod'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireOwner } from '@/lib/auth'
import { handleApiError, ok, created } from '@/lib/errors'

const CreatePlanSchema = z.object({
  id:                  z.string().min(2).max(64).regex(/^[a-z0-9_]+$/),
  type:                z.enum(['user', 'organizer', 'individual']),
  name:                z.string().min(1).max(80),
  name_ar:             z.string().min(1).max(80),
  price_sar:           z.number().min(0),
  billing_interval:    z.enum(['free', 'monthly', 'yearly']),
  events_per_month:    z.number().int().min(1).nullable(),
  attendees_per_event: z.number().int().min(1).nullable(),
  community_limit:     z.number().int().min(1).nullable().optional().default(null),
  platform_fee_pct:    z.number().min(0).max(1),
  features:            z.record(z.unknown()).default({}),
  is_active:           z.boolean().default(true),
  sort_order:          z.number().int().min(0).default(0),
})

// GET /api/owner/plans — list all plan definitions + all country prices
export async function GET() {
  try {
    await requireOwner()
    const admin = createSupabaseAdminClient()

    const [{ data: plans, error: plansErr }, { data: prices, error: pricesErr }] = await Promise.all([
      admin.from('plan_definitions').select('*').order('type').order('sort_order'),
      admin.from('plan_country_prices').select('*').order('plan_id').order('country_code'),
    ])
    if (plansErr) throw plansErr
    if (pricesErr) throw pricesErr

    return ok({ plans: plans ?? [], countryPrices: prices ?? [] })
  } catch (err) {
    return handleApiError(err)
  }
}

// POST /api/owner/plans — create a new plan definition
export async function POST(req: NextRequest) {
  try {
    await requireOwner()
    const body = await req.json()
    const input = CreatePlanSchema.parse(body)

    const admin = createSupabaseAdminClient()
    const { data, error } = await admin
      .from('plan_definitions')
      .insert(input as never)
      .select()
      .single()

    if (error) throw error
    return created(data)
  } catch (err) {
    return handleApiError(err)
  }
}
