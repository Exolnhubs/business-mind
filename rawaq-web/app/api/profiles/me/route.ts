import { NextRequest } from 'next/server'
import { z } from 'zod'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/auth'
import { handleApiError, ok } from '@/lib/errors'

const UpdateProfileSchema = z.object({
  display_name: z.string().min(2).max(80).optional(),
  avatar_url: z.string().url().optional().nullable(),
  gender: z.enum(['male', 'female', 'mixed']).optional().nullable(),
  city: z.string().max(100).optional().nullable(),
  bio: z.string().max(500).optional().nullable(),
  preferences: z.record(z.unknown()).optional(),
})

// GET /api/profiles/me
export async function GET() {
  try {
    const ctx = await requireAuth()
    const supabase = await createSupabaseServerClient()

    const { data, error } = await supabase
      .from('profiles')
      .select('*, organizer_profile:organizer_profiles!user_id(*)')
      .eq('id', ctx.userId)
      .single()

    if (error) throw error

    return ok(data)
  } catch (err) {
    return handleApiError(err)
  }
}

// PATCH /api/profiles/me
export async function PATCH(req: NextRequest) {
  try {
    const ctx = await requireAuth()
    const body = await req.json()
    const input = UpdateProfileSchema.parse(body)

    const supabase = await createSupabaseServerClient()

    const { data, error } = await supabase
      .from('profiles')
      .update(input)
      .eq('id', ctx.userId)
      .select()
      .single()

    if (error) throw error

    return ok(data)
  } catch (err) {
    return handleApiError(err)
  }
}
