import { NextRequest } from 'next/server'
import { z } from 'zod'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireOwner } from '@/lib/auth'
import { handleApiError, ok } from '@/lib/errors'

const PatchSettingsSchema = z.object({
  updates: z.array(z.object({
    key:   z.string().min(1),
    value: z.unknown(),
  })).min(1),
})

// GET /api/owner/settings
export async function GET() {
  try {
    await requireOwner()
    const admin = createSupabaseAdminClient()
    const { data, error } = await admin
      .from('platform_settings')
      .select('*')
      .order('key')
    if (error) throw error
    return ok({ settings: data ?? [] })
  } catch (err) {
    return handleApiError(err)
  }
}

// PATCH /api/owner/settings — batch upsert
export async function PATCH(req: NextRequest) {
  try {
    const ctx = await requireOwner()
    const body = await req.json()
    const { updates } = PatchSettingsSchema.parse(body)

    const admin = createSupabaseAdminClient()
    const rows = updates.map(({ key, value }) => ({
      key,
      value,
      updated_at: new Date().toISOString(),
      updated_by: ctx.userId,
    }))

    const { data, error } = await admin
      .from('platform_settings')
      .upsert(rows as never, { onConflict: 'key' })
      .select()

    if (error) throw error
    return ok({ settings: data ?? [] })
  } catch (err) {
    return handleApiError(err)
  }
}
