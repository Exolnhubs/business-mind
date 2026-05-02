import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/auth'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { handleApiError, ok, created, BadRequestException, NotFoundException } from '@/lib/errors'
import { requireCommunityManager, requireCommunityOwner, writeCommunityAuditLog } from '@/lib/community-governance'

const AssignCommunityAdminSchema = z.object({
  user_id: z.string().uuid(),
})

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params
    const ctx = await requireAuth()
    const gov = await requireCommunityManager(slug, ctx.userId, ctx.role)
    const admin = createSupabaseAdminClient()

    const { data: memberships, error } = await admin
      .from('community_memberships')
      .select('user_id, role, joined_at')
      .eq('community_id', gov.community.id)
      .eq('status', 'active')
      .in('role', ['owner', 'community_admin'])
      .order('joined_at', { ascending: true })

    if (error) throw error

    const userIds = (memberships ?? []).map((m: { user_id: string }) => m.user_id)
    const { data: profiles } = userIds.length === 0
      ? { data: [] as Array<{ id: string; display_name: string; avatar_url: string | null }> }
      : await admin
          .from('profiles')
          .select('id, display_name, avatar_url')
          .in('id', userIds)

    const profileById = new Map((profiles ?? []).map((p) => [p.id, p]))
    const data = (memberships ?? []).map((membership: { user_id: string; role: string; joined_at: string }) => ({
      user_id: membership.user_id,
      role: membership.role,
      joined_at: membership.joined_at,
      profile: profileById.get(membership.user_id) ?? null,
    }))

    return ok(data)
  } catch (err) {
    return handleApiError(err)
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params
    const input = AssignCommunityAdminSchema.parse(await req.json())
    const ctx = await requireAuth()
    const gov = await requireCommunityOwner(slug, ctx.userId, ctx.role)
    const admin = createSupabaseAdminClient()

    if (gov.community.owner_user_id === input.user_id) {
      throw new BadRequestException('The community owner already has full community access')
    }

    const { data: membership, error } = await admin
      .from('community_memberships')
      .select('community_id, user_id, role, status')
      .eq('community_id', gov.community.id)
      .eq('user_id', input.user_id)
      .maybeSingle()

    if (error) throw error
    if (!membership) throw new NotFoundException('Community membership')
    if (membership.status !== 'active') {
      throw new BadRequestException('Only active members can be promoted to community admin')
    }

    if (membership.role === 'community_admin') {
      return ok({ user_id: input.user_id, role: 'community_admin' })
    }

    const { error: updateErr } = await admin
      .from('community_memberships')
      .update({ role: 'community_admin' })
      .eq('community_id', gov.community.id)
      .eq('user_id', input.user_id)

    if (updateErr) throw updateErr

    await writeCommunityAuditLog({
      community_id: gov.community.id,
      actor_user_id: ctx.userId,
      action: 'assign_community_admin',
      target_type: 'community_membership',
      target_id: input.user_id,
      meta: { slug: gov.community.slug },
    })

    return created({ user_id: input.user_id, role: 'community_admin' })
  } catch (err) {
    return handleApiError(err)
  }
}
