import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/auth'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { handleApiError, ok, NotFoundException } from '@/lib/errors'
import { deriveCommunityMembershipState, requireCommunityManager, writeCommunityAuditLog } from '@/lib/community-governance'

const RevokeCommunitySanctionSchema = z.object({
  revoke_note: z.string().trim().max(1000).nullable().optional(),
})

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string; userId: string; sanctionId: string }> }
) {
  try {
    const { slug, userId, sanctionId } = await params
    const input = RevokeCommunitySanctionSchema.parse(await req.json())
    const ctx = await requireAuth()
    const gov = await requireCommunityManager(slug, ctx.userId, ctx.role)
    const admin = createSupabaseAdminClient()

    const { data: sanction, error } = await (admin as any)
      .from('community_member_sanctions')
      .select('*')
      .eq('id', sanctionId)
      .eq('community_id', gov.community.id)
      .eq('user_id', userId)
      .maybeSingle()

    if (error) throw error
    if (!sanction) throw new NotFoundException('Community sanction')

    const { error: updateErr } = await (admin as any)
      .from('community_member_sanctions')
      .update({
        revoked_by: ctx.userId,
        revoked_at: new Date().toISOString(),
        revoke_note: input.revoke_note ?? null,
      })
      .eq('id', sanctionId)

    if (updateErr) throw updateErr

    const { data: activeSanctions, error: sanctionsErr } = await (admin as any)
      .from('community_member_sanctions')
      .select('sanction_type, ends_at, revoked_at')
      .eq('community_id', gov.community.id)
      .eq('user_id', userId)
      .is('revoked_at', null)

    if (sanctionsErr) throw sanctionsErr

    const nextMembershipState = deriveCommunityMembershipState(activeSanctions ?? [])
    const { data: existingMembership, error: membershipLookupErr } = await (admin as any)
      .from('community_memberships')
      .select('id, role')
      .eq('community_id', gov.community.id)
      .eq('user_id', userId)
      .maybeSingle()

    if (membershipLookupErr) throw membershipLookupErr

    if (existingMembership) {
      const { error: membershipUpdateErr } = await (admin as any)
        .from('community_memberships')
        .update({
          status: nextMembershipState.status,
          timeout_until: nextMembershipState.timeout_until,
          status_updated_at: new Date().toISOString(),
        })
        .eq('community_id', gov.community.id)
        .eq('user_id', userId)

      if (membershipUpdateErr) throw membershipUpdateErr
    } else {
      const { error: membershipInsertErr } = await (admin as any)
        .from('community_memberships')
        .insert({
          community_id: gov.community.id,
          user_id: userId,
          role: 'member',
          status: nextMembershipState.status,
          timeout_until: nextMembershipState.timeout_until,
        })

      if (membershipInsertErr) throw membershipInsertErr
    }

    await writeCommunityAuditLog({
      community_id: gov.community.id,
      actor_user_id: ctx.userId,
      action: 'revoke_sanction',
      target_type: 'community_member_sanction',
      target_id: sanctionId,
      meta: {
        sanctioned_user_id: userId,
        sanction_type: sanction.sanction_type,
        membership_status: nextMembershipState.status,
      },
    })

    return ok({
      revoked: true,
      membership_status: nextMembershipState.status,
      timeout_until: nextMembershipState.timeout_until,
    })
  } catch (err) {
    return handleApiError(err)
  }
}
