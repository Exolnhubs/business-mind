import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/auth'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import {
  handleApiError, ok, created,
  BadRequestException, ConflictException, ForbiddenException, NotFoundException,
} from '@/lib/errors'

// Plan-based limit: how many communities can this host be active in simultaneously?
const PLAN_HOST_COMMUNITY_LIMIT: Record<string, number | null> = {
  ind_free:  1,
  ind_basic: 3,
  ind_pro:   null, // unlimited
}

const RequestSchema = z.object({
  message: z.string().max(300).optional(),
})

// POST /api/communities/[slug]/hosts/request — individual host submits a request
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params
    const ctx = await requireAuth()
    const admin = createSupabaseAdminClient()

    // Must be an approved individual organizer
    const { data: orgProfile } = await admin
      .from('organizer_profiles')
      .select('organizer_type, status, plan_id')
      .eq('user_id', ctx.userId)
      .maybeSingle<{ organizer_type: string; status: string; plan_id: string }>()

    if (!orgProfile || orgProfile.organizer_type !== 'individual' || orgProfile.status !== 'approved') {
      throw new ForbiddenException('Only approved individual hosts can request community host roles')
    }

    // Resolve community
    const { data: community } = await admin
      .from('communities')
      .select('id, slug')
      .eq('slug', slug)
      .maybeSingle<{ id: string; slug: string }>()

    if (!community) throw new NotFoundException('Community')

    // Must be an active member
    const { data: membership } = await admin
      .from('community_memberships')
      .select('status')
      .eq('community_id', community.id)
      .eq('user_id', ctx.userId)
      .maybeSingle<{ status: string }>()

    if (!membership || membership.status !== 'active') {
      throw new BadRequestException('You must be an active member of this community to request host role')
    }

    // Not already a host
    const { data: existingHost } = await admin
      .from('community_hosts')
      .select('user_id')
      .eq('community_id', community.id)
      .eq('user_id', ctx.userId)
      .maybeSingle()

    if (existingHost) throw new ConflictException('You are already a host in this community')

    // Check plan-based community limit
    const limit = PLAN_HOST_COMMUNITY_LIMIT[orgProfile.plan_id] ?? 1
    if (limit !== null) {
      const { count } = await admin
        .from('community_hosts')
        .select('community_id', { count: 'exact', head: true })
        .eq('user_id', ctx.userId)

      if ((count ?? 0) >= limit) {
        throw new ForbiddenException(
          `Your ${orgProfile.plan_id} plan allows hosting in at most ${limit} ${limit === 1 ? 'community' : 'communities'}. Upgrade to host in more.`,
        )
      }
    }

    // Upsert request (idempotent — reinstates if previously rejected)
    const body = RequestSchema.parse(await req.json().catch(() => ({})))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: request, error } = await (admin as any)
      .from('community_host_requests')
      .upsert({
        community_id: community.id,
        user_id: ctx.userId,
        message: body.message ?? null,
        status: 'pending',
        responded_by: null,
        responded_at: null,
      }, { onConflict: 'community_id,user_id' })
      .select('id, status, created_at')
      .single()

    if (error) throw error

    return created(request)
  } catch (err) {
    return handleApiError(err)
  }
}

// DELETE /api/communities/[slug]/hosts/request — withdraw a pending request
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params
    const ctx = await requireAuth()
    const admin = createSupabaseAdminClient()

    const { data: community } = await admin
      .from('communities')
      .select('id')
      .eq('slug', slug)
      .maybeSingle<{ id: string }>()

    if (!community) throw new NotFoundException('Community')

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (admin as any)
      .from('community_host_requests')
      .delete()
      .eq('community_id', community.id)
      .eq('user_id', ctx.userId)
      .eq('status', 'pending')

    return ok({ withdrawn: true })
  } catch (err) {
    return handleApiError(err)
  }
}
