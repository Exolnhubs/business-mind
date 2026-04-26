import { NextRequest } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireAuth } from '@/lib/auth'
import { handleApiError, ok, NotFoundException } from '@/lib/errors'
import { limiters, checkRateLimit } from '@/lib/rate-limit'

const DEFAULT_LIMIT = 15
const MAX_LIMIT = 50

type Participant = {
  id: string
  display_name: string
  avatar_url: string | null
  joined_at: string
  platform_joined_at: string
}

// GET /api/happenings/:id/participants — list users who RSVP'd a happening
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const ctx   = await requireAuth()
    await checkRateLimit(limiters.happeningParticipants, ctx.userId)
    const admin = createSupabaseAdminClient()

    const url      = new URL(req.url)
    const rawLimit = Number(url.searchParams.get('limit') ?? DEFAULT_LIMIT)
    const rawOffset = Number(url.searchParams.get('offset') ?? 0)
    const limit  = Math.min(MAX_LIMIT, Math.max(1, Number.isFinite(rawLimit) ? rawLimit : DEFAULT_LIMIT))
    const offset = Math.max(0, Number.isFinite(rawOffset) ? rawOffset : 0)

    const { data: happening } = await (admin as any)
      .from('happenings')
      .select('id, rsvp_count')
      .eq('id', id)
      .maybeSingle()

    if (!happening) throw new NotFoundException('Happening not found')

    const { data: rows } = await (admin as any)
      .from('happening_rsvps')
      .select('created_at, profile:profiles!user_id(id, display_name, avatar_url, created_at)')
      .eq('happening_id', id)
      .order('created_at', { ascending: true })
      .range(offset, offset + limit - 1)

    const participants: Participant[] = ((rows ?? []) as Array<{
      created_at: string
      profile: { id: string; display_name: string; avatar_url: string | null; created_at: string } | null
    }>)
      .filter((r) => r.profile !== null)
      .map((r) => ({
        id: r.profile!.id,
        display_name: r.profile!.display_name,
        avatar_url: r.profile!.avatar_url,
        joined_at: r.created_at,
        platform_joined_at: r.profile!.created_at,
      }))

    return ok({
      total: (happening as { rsvp_count: number }).rsvp_count ?? 0,
      participants,
    })
  } catch (err) {
    return handleApiError(err)
  }
}
