import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/auth'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { created, handleApiError, ok, NotFoundException } from '@/lib/errors'
import { requireCommunityManager, writeCommunityAuditLog } from '@/lib/community-governance'

const CreateCommunityWarningSchema = z.object({
  severity: z.enum(['low', 'medium', 'high']).default('medium'),
  reason: z.string().trim().min(3).max(500),
  internal_note: z.string().trim().max(1000).nullable().optional(),
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

    const { data, error } = await (admin as any)
      .from('community_member_warnings')
      .select('*')
      .eq('community_id', gov.community.id)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })

    if (error) throw error
    return ok({ warnings: data ?? [] })
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
    const input = CreateCommunityWarningSchema.parse(await req.json())
    const ctx = await requireAuth()
    const gov = await requireCommunityManager(slug, ctx.userId, ctx.role)
    const admin = createSupabaseAdminClient()

    const { data: membership } = await (admin as any)
      .from('community_memberships')
      .select('user_id')
      .eq('community_id', gov.community.id)
      .eq('user_id', userId)
      .maybeSingle()

    if (!membership) throw new NotFoundException('Community membership')

    const insertPayload = {
      community_id: gov.community.id,
      user_id: userId,
      issued_by: ctx.userId,
      severity: input.severity,
      reason: input.reason,
      internal_note: input.internal_note ?? null,
    }

    const { data, error } = await (admin as any)
      .from('community_member_warnings')
      .insert(insertPayload)
      .select('*')
      .single()

    if (error) throw error

    await writeCommunityAuditLog({
      community_id: gov.community.id,
      actor_user_id: ctx.userId,
      action: 'warn_member',
      target_type: 'community_member_warning',
      target_id: data.id,
      meta: {
        warned_user_id: userId,
        severity: input.severity,
      },
    })

    return created(data)
  } catch (err) {
    return handleApiError(err)
  }
}
