import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { handleApiError, ok, BadRequestException, NotFoundException } from '@/lib/errors'
import { requireCommunityOwner, writeCommunityAuditLog } from '@/lib/community-governance'

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string; userId: string }> }
) {
  try {
    const { slug, userId } = await params
    const ctx = await requireAuth()
    const gov = await requireCommunityOwner(slug, ctx.userId, ctx.role)
    const admin = createSupabaseAdminClient()

    if (gov.community.owner_user_id === userId) {
      throw new BadRequestException('Ownership must be transferred before removing owner privileges')
    }

    const { data: membership, error } = await (admin as any)
      .from('community_memberships')
      .select('community_id, user_id, role')
      .eq('community_id', gov.community.id)
      .eq('user_id', userId)
      .maybeSingle()

    if (error) throw error
    if (!membership) throw new NotFoundException('Community membership')

    if (membership.role !== 'community_admin') {
      return ok({ user_id: userId, role: membership.role })
    }

    const { error: updateErr } = await (admin as any)
      .from('community_memberships')
      .update({ role: 'member' })
      .eq('community_id', gov.community.id)
      .eq('user_id', userId)

    if (updateErr) throw updateErr

    await writeCommunityAuditLog({
      community_id: gov.community.id,
      actor_user_id: ctx.userId,
      action: 'revoke_community_admin',
      target_type: 'community_membership',
      target_id: userId,
      meta: { slug: gov.community.slug },
    })

    return ok({ user_id: userId, role: 'member' })
  } catch (err) {
    return handleApiError(err)
  }
}
