import { NextRequest } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireOwner } from '@/lib/auth'
import { handleApiError, ok } from '@/lib/errors'

// DELETE /api/owner/plans/:id/country-prices/:countryCode
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; countryCode: string }> }
) {
  try {
    await requireOwner()
    const { id: plan_id, countryCode } = await params
    const admin = createSupabaseAdminClient()

    const { error } = await admin
      .from('plan_country_prices')
      .delete()
      .eq('plan_id', plan_id)
      .eq('country_code', countryCode.toUpperCase())

    if (error) throw error
    return ok({ ok: true })
  } catch (err) {
    return handleApiError(err)
  }
}
