import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { ForbiddenException, NotFoundException } from '@/lib/errors'
import type { CommunityRole } from '@/types/database'

type CommunityGovernanceContext = {
  community: {
    id: string
    slug: string
    name: string
    owner_user_id: string | null
  }
  actor: {
    userId: string
    platformRole: 'user' | 'organizer' | 'admin'
    communityRole: CommunityRole | null
    isOwner: boolean
    isCommunityManager: boolean
    isPlatformAdmin: boolean
  }
}

export async function getCommunityGovernanceContext(
  slug: string,
  actorUserId: string,
  platformRole: 'user' | 'organizer' | 'admin'
): Promise<CommunityGovernanceContext> {
  const admin = createSupabaseAdminClient()

  const { data: community, error } = await admin
    .from('communities')
    .select('id, slug, name, owner_user_id')
    .eq('slug', slug)
    .single()

  if (error || !community) throw new NotFoundException('Community')

  const { data: membership } = await admin
    .from('community_memberships')
    .select('role')
    .eq('community_id', community.id)
    .eq('user_id', actorUserId)
    .maybeSingle()

  const communityRole = (membership?.role as CommunityRole | undefined) ?? null
  const isOwner = community.owner_user_id === actorUserId || communityRole === 'owner'
  const isPlatformAdmin = platformRole === 'admin'
  const isCommunityManager = isPlatformAdmin || isOwner || communityRole === 'community_admin'

  return {
    community,
    actor: {
      userId: actorUserId,
      platformRole,
      communityRole,
      isOwner,
      isCommunityManager,
      isPlatformAdmin,
    },
  }
}

export async function requireCommunityManager(
  slug: string,
  actorUserId: string,
  platformRole: 'user' | 'organizer' | 'admin'
) {
  const ctx = await getCommunityGovernanceContext(slug, actorUserId, platformRole)
  if (!ctx.actor.isCommunityManager) {
    throw new ForbiddenException('You do not have community moderation access')
  }
  return ctx
}

export async function requireCommunityOwner(
  slug: string,
  actorUserId: string,
  platformRole: 'user' | 'organizer' | 'admin'
) {
  const ctx = await getCommunityGovernanceContext(slug, actorUserId, platformRole)
  if (!(ctx.actor.isOwner || ctx.actor.isPlatformAdmin)) {
    throw new ForbiddenException('Only the community owner can manage community admins')
  }
  return ctx
}

export async function writeCommunityAuditLog(input: {
  community_id: string
  actor_user_id: string
  action:
    | 'assign_community_admin'
    | 'revoke_community_admin'
    | 'resolve_happening_report'
    | 'dismiss_happening_report'
    | 'delete_happening'
    | 'warn_member'
    | 'timeout_member'
    | 'remove_member'
    | 'ban_member'
    | 'unban_member'
    | 'revoke_sanction'
  target_type: string
  target_id: string
  meta?: Record<string, unknown>
}) {
  const admin = createSupabaseAdminClient()
  const { error } = await (admin as any)
    .from('community_audit_logs')
    .insert({
      community_id: input.community_id,
      actor_user_id: input.actor_user_id,
      action: input.action,
      target_type: input.target_type,
      target_id: input.target_id,
      meta: input.meta ?? {},
    })
  if (error) throw error
}
