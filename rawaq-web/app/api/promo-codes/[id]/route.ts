import { NextRequest } from 'next/server'
import { z } from 'zod'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/auth'
import { handleApiError, ok, NotFoundException, ForbiddenException } from '@/lib/errors'

const UpdatePromoSchema = z.object({
  discount_type:    z.enum(['percent', 'fixed']).optional(),
  discount_value:   z.number().positive().optional(),
  max_uses:         z.number().int().positive().optional().nullable(),
  min_order_amount: z.number().min(0).optional(),
  expires_at:       z.string().datetime().optional().nullable(),
  is_active:        z.boolean().optional(),
})

type Ctx = { params: Promise<{ id: string }> }

async function getPromoAndVerifyOwnership(promoId: string, userId: string, role: string) {
  const supabase = await createSupabaseServerClient()
  const { data: promo } = await supabase
    .from('promo_codes')
    .select('*, event:events(organizer_id)')
    .eq('id', promoId)
    .single()

  if (!promo) throw new NotFoundException('Promo code')

  const isOrganizer = (promo.event as unknown as { organizer_id: string } | null)?.organizer_id === userId
  if (!isOrganizer && role !== 'admin') {
    throw new ForbiddenException('Not your promo code')
  }

  return { promo, supabase }
}

// PATCH /api/promo-codes/[id]
export async function PATCH(req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params
    const ctx = await requireAuth()
    const { supabase } = await getPromoAndVerifyOwnership(id, ctx.userId, ctx.role)

    const body  = await req.json()
    const input = UpdatePromoSchema.parse(body)

    const { data, error } = await supabase
      .from('promo_codes')
      .update(input)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return ok(data)
  } catch (err) {
    return handleApiError(err)
  }
}

// DELETE /api/promo-codes/[id]
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params
    const ctx = await requireAuth()
    const { supabase } = await getPromoAndVerifyOwnership(id, ctx.userId, ctx.role)

    const { error } = await supabase.from('promo_codes').delete().eq('id', id)
    if (error) throw error
    return ok({ deleted: true })
  } catch (err) {
    return handleApiError(err)
  }
}
