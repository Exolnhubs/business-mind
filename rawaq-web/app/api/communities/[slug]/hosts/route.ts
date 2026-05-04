import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/auth'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { handleApiError, ok, created, BadRequestException, NotFoundException } from '@/lib/errors'
import { requireCommunityManager, requireCommunityOwner, writeCommunityAuditLog } from '@/lib/community-governance'

const AssignHostSchema = z.object({
  user_id: z.string().uuid(),
})

type HostGrantRow = {
  user_id: string
  granted_at: string
  granted_by: string | null
}

type HostMembershipRow = {
  user_id: string
  role: string
  status: string
  joined_at: string
}

type HostProfileRow = {
  id: string
  display_name: string
  avatar_url: string | null
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params
    const ctx = await requireAuth()
    const gov = await requireCommunityManager(slug, ctx.userId, ctx.role)
    const admin = createSupabaseAdminClient()

    const { data: grants, error: grantsError } = await admin
      .from('community_hosts')
      .select('user_id, granted_at, granted_by')
      .eq('community_id', gov.community.id)
      .returns<HostGrantRow[]>()

    if (grantsError) throw grantsError

    const userIds = (grants ?? []).map((grant) => grant.user_id)
    const [{ data: profiles }, { data: memberships }] = userIds.length === 0
      ? [
          { data: [] as HostProfileRow[] },
          { data: [] as HostMembershipRow[] },
        ]
      : await Promise.all([
          admin
            .from('profiles')
            .select('id, display_name, avatar_url')
            .in('id', userIds)
            .returns<HostProfileRow[]>(),
          admin
            .from('community_memberships')
            .select('user_id, role, status, joined_at')
            .eq('community_id', gov.community.id)
            .in('user_id', userIds)
            .returns<HostMembershipRow[]>(),
        ])

    const profileById = new Map((profiles ?? []).map((profile) => [profile.id, profile]))
    const membershipByUserId = new Map((memberships ?? []).map((membership) => [membership.user_id, membership]))
    const hosts = (grants ?? [])
      .map((grant) => {
        const membership = membershipByUserId.get(grant.user_id)
        return {
          user_id: grant.user_id,
          role: 'host' as const,
          member_role: membership?.role ?? null,
          member_status: membership?.status ?? null,
          joined_at: membership?.joined_at ?? null,
          granted_at: grant.granted_at,
          granted_by: grant.granted_by,
          profile: profileById.get(grant.user_id) ?? null,
        }
      })
      .filter((host) => host.member_status === 'active')

    return ok(hosts)
  } catch (err) {
    return handleApiError(err)
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params
    const input = AssignHostSchema.parse(await req.json())
    const ctx = await requireAuth()
    const gov = await requireCommunityOwner(slug, ctx.userId, ctx.role)
    const admin = createSupabaseAdminClient()

    const { data: membership, error } = await admin
      .from('community_memberships')
      .select('community_id, user_id, role, status')
      .eq('community_id', gov.community.id)
      .eq('user_id', input.user_id)
      .maybeSingle<{ community_id: string; user_id: string; role: string; status: string }>()

    if (error) throw error
    if (!membership) throw new NotFoundException('Community membership')
    if (membership.status !== 'active') {
      throw new BadRequestException('Only active members can be granted host role')
    }

    const { error: upsertError } = await admin
      .from('community_hosts')
      .upsert({
        community_id: gov.community.id,
        user_id: input.user_id,
        granted_by: ctx.userId,
      }, { onConflict: 'community_id,user_id' })

    if (upsertError) throw upsertError

    await writeCommunityAuditLog({
      community_id: gov.community.id,
      actor_user_id: ctx.userId,
      action: 'assign_host_role',
      target_type: 'community_host',
      target_id: input.user_id,
      meta: { slug: gov.community.slug, member_role: membership.role },
    })

    return created({ user_id: input.user_id, role: 'host' })
  } catch (err) {
    return handleApiError(err)
  }
}
