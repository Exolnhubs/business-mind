import { NextRequest } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { optionalAuth } from '@/lib/auth'
import { handleApiError, ok, NotFoundException } from '@/lib/errors'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params
    const admin = createSupabaseAdminClient()
    const ctx = await optionalAuth()

    const { data: community, error: communityError } = await admin
      .from('communities')
      .select('id')
      .eq('slug', slug)
      .maybeSingle()

    if (communityError) throw communityError
    if (!community) throw new NotFoundException('Community not found')

    let memberIds: string[] = []
    const memberRoleByCommunityId = new Map<string, string>()
    const memberStatusByCommunityId = new Map<string, string>()

    if (ctx?.userId) {
      const { data: memberships } = await admin
        .from('community_memberships')
        .select('community_id, role, status')
        .eq('user_id', ctx.userId)

      memberIds = (memberships ?? [])
        .filter((membership) => membership.status !== 'removed' && membership.status !== 'banned')
        .map((membership) => membership.community_id)

      for (const membership of memberships ?? []) {
        memberRoleByCommunityId.set(membership.community_id, membership.role)
        memberStatusByCommunityId.set(membership.community_id, membership.status)
      }
    }

    const { data, error } = await admin
      .from('communities')
      .select('id, name, name_ar, slug, description, description_ar, level, type, city, country, cover_url, member_count, is_verified, is_private, created_by, owner_user_id, parent_community_id, created_at, updated_at')
      .eq('parent_community_id', community.id)
      .order('member_count', { ascending: false })
      .order('name')

    if (error) throw error

    const memberSet = new Set(memberIds)

    return ok({
      children: (data ?? []).map((child) => ({
        ...child,
        is_member: memberSet.has(child.id) && !['removed', 'banned'].includes(memberStatusByCommunityId.get(child.id) ?? ''),
        member_role: memberRoleByCommunityId.get(child.id) ?? null,
        member_status: memberStatusByCommunityId.get(child.id) ?? null,
      })),
    })
  } catch (err) {
    return handleApiError(err)
  }
}
