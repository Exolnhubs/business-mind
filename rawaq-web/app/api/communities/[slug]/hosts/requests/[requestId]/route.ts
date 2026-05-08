import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/auth'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import {
  handleApiError, ok,
  BadRequestException, ForbiddenException, NotFoundException,
} from '@/lib/errors'
import { requireCommunityOwner, writeCommunityAuditLog } from '@/lib/community-governance'

const PLAN_HOST_COMMUNITY_LIMIT: Record<string, number | null> = {
  ind_free:  1,
  ind_basic: 3,
  ind_pro:   null,
}

const RespondSchema = z.object({
  action: z.enum(['approve', 'reject']),
})

// PATCH /api/communities/[slug]/hosts/requests/[requestId] — approve or reject
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string; requestId: string }> },
) {
  try {
    const { slug, requestId } = await params
    const { action } = RespondSchema.parse(await req.json())
    const ctx = await requireAuth()
    const gov = await requireCommunityOwner(slug, ctx.userId, ctx.role)
    const admin = createSupabaseAdminClient()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: request } = await (admin as any)
      .from('community_host_requests')
      .select('id, community_id, user_id, status')
      .eq('id', requestId)
      .eq('community_id', gov.community.id)
      .maybeSingle() as { data: { id: string; community_id: string; user_id: string; status: string } | null }

    if (!request) throw new NotFoundException('Host request')
    if (request.status !== 'pending') {
      throw new BadRequestException('This request has already been responded to')
    }

    if (action === 'approve') {
      // Check the requester's plan limit before approving
      const { data: orgProfile } = await admin
        .from('organizer_profiles')
        .select('plan_id, status, organizer_type')
        .eq('user_id', request.user_id)
        .maybeSingle<{ plan_id: string; status: string; organizer_type: string }>()

      if (!orgProfile || orgProfile.organizer_type !== 'individual' || orgProfile.status !== 'approved') {
        throw new ForbiddenException('This user is no longer an approved individual host')
      }

      const limit = PLAN_HOST_COMMUNITY_LIMIT[orgProfile.plan_id] ?? 1
      if (limit !== null) {
        const { count } = await admin
          .from('community_hosts')
          .select('community_id', { count: 'exact', head: true })
          .eq('user_id', request.user_id)

        if ((count ?? 0) >= limit) {
          throw new ForbiddenException(
            `This host's ${orgProfile.plan_id} plan only allows hosting in ${limit} ${limit === 1 ? 'community' : 'communities'}.`,
          )
        }
      }

      // Assign the host
      const { error: hostError } = await admin
        .from('community_hosts')
        .upsert({
          community_id: gov.community.id,
          user_id: request.user_id,
          granted_by: ctx.userId,
        }, { onConflict: 'community_id,user_id' })

      if (hostError) throw hostError

      await writeCommunityAuditLog({
        community_id: gov.community.id,
        actor_user_id: ctx.userId,
        action: 'assign_host_role',
        target_type: 'community_host',
        target_id: request.user_id,
        meta: { slug: gov.community.slug, via: 'host_request', request_id: requestId },
      })
    }

    // Mark request as approved/rejected
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: updateError } = await (admin as any)
      .from('community_host_requests')
      .update({
        status: action === 'approve' ? 'approved' : 'rejected',
        responded_by: ctx.userId,
        responded_at: new Date().toISOString(),
      })
      .eq('id', requestId)

    if (updateError) throw updateError

    return ok({ request_id: requestId, action, user_id: request.user_id })
  } catch (err) {
    return handleApiError(err)
  }
}
