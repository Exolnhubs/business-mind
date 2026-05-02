import { NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireAuth } from '@/lib/auth'
import { ForbiddenException, handleApiError, ok, NotFoundException } from '@/lib/errors'
import { limiters, checkRateLimit } from '@/lib/rate-limit'

// POST /api/communities/:slug/join
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params
    const ctx      = await requireAuth()
    await checkRateLimit(limiters.communityJoin, ctx.userId)
    const supabase = await createSupabaseServerClient()
    const admin    = createSupabaseAdminClient()

    const { data: community, error: cErr } = await supabase
      .from('communities')
      .select('id, name, member_count, owner_user_id')
      .eq('slug', slug)
      .single()

    if (cErr || !community) throw new NotFoundException('Community not found')

    const { data: existingMembership } = await admin
      .from('community_memberships')
      .select('id, role, status')
      .eq('community_id', community.id)
      .eq('user_id', ctx.userId)
      .maybeSingle()

    if (existingMembership) {
      if (existingMembership.status === 'banned') {
        throw new ForbiddenException('You are banned from this community')
      }

      if (existingMembership.status === 'removed') {
        const { error: reactivateErr } = await admin
          .from('community_memberships')
          .update({
            role: community.owner_user_id === ctx.userId ? 'owner' : existingMembership.role,
            status: 'active',
            timeout_until: null,
            status_updated_at: new Date().toISOString(),
          } as never)
          .eq('community_id', community.id)
          .eq('user_id', ctx.userId)

        if (reactivateErr) throw reactivateErr

        return ok({
          community_id: community.id,
          member_count: community.member_count + 1,
          is_member: true,
          member_role: community.owner_user_id === ctx.userId ? 'owner' : existingMembership.role,
          member_status: 'active',
        })
      }

      return ok({
        community_id: community.id,
        member_count: community.member_count,
        is_member: existingMembership.status === 'active' || existingMembership.status === 'timed_out',
        member_role: existingMembership.role,
        member_status: existingMembership.status,
      })
    }

    const memberRole = community.owner_user_id === ctx.userId ? 'owner' : 'member'
    const { error: insertErr } = await admin
      .from('community_memberships')
      .insert({ community_id: community.id, user_id: ctx.userId, role: memberRole, status: 'active', timeout_until: null } as never)

    if (insertErr) {
      throw insertErr
    }

    return ok({
      community_id: community.id,
      member_count: community.member_count + 1,
      is_member: true,
      member_role: memberRole,
      member_status: 'active',
    })
  } catch (err) {
    return handleApiError(err)
  }
}
