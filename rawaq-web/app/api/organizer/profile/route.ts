import { NextRequest } from 'next/server'
import { z } from 'zod'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { requireOrganizer } from '@/lib/auth'
import { handleApiError, ok } from '@/lib/errors'

const UpdateOrganizerProfileSchema = z.object({
  business_name:    z.string().min(2).max(120),
  business_name_ar: z.string().max(120).optional().nullable(),
  description:      z.string().max(1000).optional().nullable(),
  description_ar:   z.string().max(1000).optional().nullable(),
  logo_url:         z.string().url().optional().nullable(),
  website:          z.string().url().optional().nullable(),
  phone:            z.string().max(30).optional().nullable(),
})

// PATCH /api/organizer/profile
export async function PATCH(req: NextRequest) {
  try {
    const ctx = await requireOrganizer()
    const body = await req.json()
    const input = UpdateOrganizerProfileSchema.parse(body)

    const supabase = await createSupabaseServerClient()

    // Upsert — organizer may not have a profile row yet
    const { data, error } = await supabase
      .from('organizer_profiles')
      .upsert(
        { user_id: ctx.userId, ...input } as never,
        { onConflict: 'user_id', ignoreDuplicates: false },
      )
      .select()
      .single()

    if (error) throw error

    return ok(data)
  } catch (err) {
    return handleApiError(err)
  }
}
