import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/auth'
import { handleApiError, ok, ConflictException } from '@/lib/errors'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'

const RequestSchema = z.object({
  business_name: z.string().min(2).max(120),
  description:   z.string().max(1000).optional().nullable(),
})

// GET /api/organizer/request — current user's organizer request status
export async function GET() {
  try {
    const { userId } = await requireAuth()
    const admin = createSupabaseAdminClient()

    const { data } = await admin
      .from('organizer_profiles')
      .select('id, status, verified, business_name, created_at')
      .eq('user_id', userId)
      .maybeSingle()

    return ok(data)
  } catch (err) {
    return handleApiError(err)
  }
}

// POST /api/organizer/request — submit organizer application
export async function POST(req: NextRequest) {
  try {
    const { userId } = await requireAuth()
    const admin = createSupabaseAdminClient()

    // Check current role
    const { data: profile } = await admin
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .single()

    if (profile?.role === 'admin') {
      throw new ConflictException('Admin accounts cannot request organizer status')
    }
    if (profile?.role === 'organizer') {
      // Check if already approved — if so, reject; if pending/rejected, allow re-application
      const { data: existing } = await admin
        .from('organizer_profiles')
        .select('status')
        .eq('user_id', userId)
        .maybeSingle()

      if (existing?.status === 'approved') {
        throw new ConflictException('You are already an approved organizer')
      }
    }

    const body = await req.json()
    const input = RequestSchema.parse(body)

    // Elevate role to organizer (DB trigger fn_auto_create_organizer_profile fires)
    await admin
      .from('profiles')
      .update({ role: 'organizer' })
      .eq('id', userId)

    // Upsert organizer_profiles — handles new request and re-application after rejection
    const { data, error } = await admin
      .from('organizer_profiles')
      .upsert(
        {
          user_id:       userId,
          business_name: input.business_name,
          description:   input.description ?? null,
          status:        'pending',
          verified:      false,
          reviewed_by:   null,
          reviewed_at:   null,
        } as any,
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
