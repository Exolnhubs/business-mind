import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/auth'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { created, handleApiError, ok, BadRequestException, NotFoundException } from '@/lib/errors'
import { deriveCommunityMembershipState, requireCommunityManager, writeCommunityAuditLog } from '@/lib/community-governance'

const CreateCommunitySanctionSchema = z.object({
  sanction_type: z.enum(['timeout', 'removed', 'banned']),
  reason: z.string().trim().min(3).max(500),
  internal_note: z.string().trim().max(1000).nullable().optional(),
  ends_at: z.string().datetime().nullable().optional(),
})

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string; userId: string }> }
) {
  try {
    const { slug, userId } = await params
    const ctx = await requireAuth()
    const gov = await requireCommunityManager(slug, ctx.userId, ctx.role)
    const admin = createSupabaseAdminClient()

    const { data, error } = await admin
      .from('community_member_sanctions')
      .select('*')
      .eq('community_id', gov.community.id)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })

    if (error) throw error
    return ok({ sanctions: data ?? [] })
  } catch (err) {
    return handleApiError(err)
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string; userId: string }> }
) {
  try {
    const { slug, userId } = await params
    const input = CreateCommunitySanctionSchema.parse(await req.json())
    const ctx = await requireAuth()
    const gov = await requireCommunityManager(slug, ctx.userId, ctx.role)
    const admin = createSupabaseAdminClient()

    if (gov.community.owner_user_id === userId) {
      throw new BadRequestException('Community owners cannot be sanctioned through community moderation')
    }

    if (input.sanction_type === 'timeout' && !input.ends_at) {
      throw new BadRequestException('Timeout sanctions require an end time')
    }

    const { data: membership, error: membershipErr } = await admin
      .from('community_memberships')
      .select('user_id, role, status')
      .eq('community_id', gov.community.id)
      .eq('user_id', userId)
      .maybeSingle()

    if (membershipErr) throw membershipErr
    if (!membership) throw new NotFoundException('Community membership')
    if (membership.role === 'owner') {
      throw new BadRequestException('Community owners cannot be sanctioned through community moderation')
    }
    if (gov.actor.communityRole === 'community_admin' && membership.role === 'community_admin') {
      throw new BadRequestException('Community admins cannot sanction other community admins')
    }

    const insertPayload = {
      community_id: gov.community.id,
      user_id: userId,
      issued_by: ctx.userId,
      sanction_type: input.sanction_type,
      reason: input.reason,
      internal_note: input.internal_note ?? null,
      ends_at: input.ends_at ?? null,
    }

    const { data, error } = await admin
      .from('community_member_sanctions')
      .insert(insertPayload)
      .select('*')
      .single()

    if (error) throw error

    const { data: activeSanctions, error: sanctionsErr } = await admin
      .from('community_member_sanctions')
      .select('sanction_type, ends_at, revoked_at')
      .eq('community_id', gov.community.id)
      .eq('user_id', userId)
      .is('revoked_at', null)

    if (sanctionsErr) throw sanctionsErr

    const nextMembershipState = deriveCommunityMembershipState(activeSanctions ?? [])
    const { error: membershipUpdateErr } = await admin
      .from('community_memberships')
      .update({
        status: nextMembershipState.status,
        timeout_until: nextMembershipState.timeout_until,
        status_updated_at: new Date().toISOString(),
      })
      .eq('community_id', gov.community.id)
      .eq('user_id', userId)

    if (membershipUpdateErr) throw membershipUpdateErr

    await writeCommunityAuditLog({
      community_id: gov.community.id,
      actor_user_id: ctx.userId,
      action:
        input.sanction_type === 'timeout'
          ? 'timeout_member'
          : input.sanction_type === 'removed'
            ? 'remove_member'
            : 'ban_member',
      target_type: 'community_member_sanction',
      target_id: data.id,
      meta: {
        sanctioned_user_id: userId,
        sanction_type: input.sanction_type,
        ends_at: input.ends_at ?? null,
        membership_status: nextMembershipState.status,
      },
    })

    return created({
      ...data,
      membership_status: nextMembershipState.status,
      timeout_until: nextMembershipState.timeout_until,
    })
  } catch (err) {
    return handleApiError(err)
  }
}
