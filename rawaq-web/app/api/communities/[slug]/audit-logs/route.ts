import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { handleApiError, ok } from '@/lib/errors'
import { requireCommunityManager } from '@/lib/community-governance'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params
    const ctx = await requireAuth()
    const gov = await requireCommunityManager(slug, ctx.userId, ctx.role)
    const admin = createSupabaseAdminClient()
    const limit = Math.min(Number(req.nextUrl.searchParams.get('limit') ?? '20'), 50)

    const { data: logs, error } = await admin
      .from('community_audit_logs')
      .select('*')
      .eq('community_id', gov.community.id)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) throw error

    const actorIds = [...new Set(((logs ?? []) as { actor_user_id: string }[]).map((log) => log.actor_user_id))]
    const { data: profiles } = actorIds.length === 0
      ? { data: [] as Array<{ id: string; display_name: string; avatar_url: string | null }> }
      : await admin
          .from('profiles')
          .select('id, display_name, avatar_url')
          .in('id', actorIds)

    const profileById = new Map((profiles ?? []).map((profile) => [profile.id, profile]))

    return ok({
      logs: (logs ?? []).map((log: { actor_user_id: string }) => ({
        ...log,
        actor: profileById.get(log.actor_user_id) ?? null,
      })),
    })
  } catch (err) {
    return handleApiError(err)
  }
}
