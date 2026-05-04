import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { handleApiError, ok } from '@/lib/errors'
import { requireCommunityOwner, writeCommunityAuditLog } from '@/lib/community-governance'

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string; userId: string }> },
) {
  try {
    const { slug, userId } = await params
    const ctx = await requireAuth()
    const gov = await requireCommunityOwner(slug, ctx.userId, ctx.role)
    const admin = createSupabaseAdminClient()

    const { error } = await admin
      .from('community_hosts')
      .delete()
      .eq('community_id', gov.community.id)
      .eq('user_id', userId)

    if (error) throw error

    await writeCommunityAuditLog({
      community_id: gov.community.id,
      actor_user_id: ctx.userId,
      action: 'revoke_host_role',
      target_type: 'community_host',
      target_id: userId,
      meta: { slug: gov.community.slug },
    })

    return ok({ user_id: userId, role: 'member' })
  } catch (err) {
    return handleApiError(err)
  }
}
