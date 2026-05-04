import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/auth'
import { handleApiError, ok, ConflictException } from '@/lib/errors'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { limiters, checkRateLimit } from '@/lib/rate-limit'

const ApplySchema = z.object({
  display_name: z.string().min(2).max(60),
  bio: z.string().min(20).max(500),
  skills_tags: z.array(z.string().min(2).max(40)).min(1).max(10),
})

type ExistingOrganizerProfile = {
  id: string
  organizer_type: 'company' | 'individual'
  status: string
}

type IndividualHostApplication = {
  user_id: string
  organizer_type: 'individual'
  business_name: string
  business_name_ar: null
  description: null
  description_ar: null
  bio: string
  skills_tags: string[]
  sessions_hosted_count: 0
  cancellation_count: 0
  avg_rating: null
  payout_hold_days: 7
  logo_url: null
  website: null
  phone: null
  status: 'pending'
  verified: false
  reviewed_by: null
  reviewed_at: null
  paid_sessions_enabled: false
  plan_id: 'ind_free'
  followers_count: 0
  suspend_reason: null
}

export async function POST(req: NextRequest) {
  try {
    const { userId } = await requireAuth()
    await checkRateLimit(limiters.organizerReq, userId)

    const input = ApplySchema.parse(await req.json())
    const admin = createSupabaseAdminClient()

    const { data: profile } = await admin
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .single()

    if (profile?.role === 'admin' || profile?.role === 'owner') {
      throw new ConflictException('Admin accounts cannot request individual host access')
    }

    const { data: existing, error: existingError } = await admin
      .from('organizer_profiles')
      .select('id, organizer_type, status')
      .eq('user_id', userId)
      .maybeSingle<ExistingOrganizerProfile>()

    if (existingError) throw existingError
    if (existing) {
      throw new ConflictException(
        existing.organizer_type === 'individual'
          ? 'You already have an individual host application.'
          : 'You are already registered as a company organizer.'
      )
    }

    const application: IndividualHostApplication = {
      user_id: userId,
      organizer_type: 'individual',
      business_name: input.display_name,
      business_name_ar: null,
      description: null,
      description_ar: null,
      bio: input.bio,
      skills_tags: input.skills_tags,
      sessions_hosted_count: 0,
      cancellation_count: 0,
      avg_rating: null,
      payout_hold_days: 7,
      logo_url: null,
      website: null,
      phone: null,
      status: 'pending',
      verified: false,
      reviewed_by: null,
      reviewed_at: null,
      paid_sessions_enabled: false,
      plan_id: 'ind_free',
      followers_count: 0,
      suspend_reason: null,
    }

    const { data, error } = await admin
      .from('organizer_profiles')
      .insert(application)
      .select('id, organizer_type, status, business_name, bio, skills_tags, created_at')
      .single()

    if (error) throw error

    return ok(data)
  } catch (err) {
    return handleApiError(err)
  }
}
