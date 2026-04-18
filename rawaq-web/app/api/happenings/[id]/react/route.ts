import { NextRequest } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireAuth } from '@/lib/auth'
import { ForbiddenException, handleApiError, ok, NotFoundException } from '@/lib/errors'
import { limiters, checkRateLimit } from '@/lib/rate-limit'

// POST /api/happenings/:id/react — react to a happening
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const ctx    = await requireAuth()
    await checkRateLimit(limiters.reactions, ctx.userId)
    const admin  = createSupabaseAdminClient()
    const body   = await req.json().catch(() => ({}))
    const emoji  = typeof body.emoji === 'string' && body.emoji.length <= 8 ? body.emoji : '👍'

    const { data: happening } = await (admin as any)
      .from('happenings')
      .select('id, community_id, expires_at')
      .eq('id', id)
      .maybeSingle()

    if (!happening) throw new NotFoundException('Happening not found')

    if (ctx.role !== 'admin') {
      const { data: membership } = await (admin as any)
        .from('community_memberships')
        .select('status')
        .eq('community_id', (happening as { community_id: string }).community_id)
        .eq('user_id', ctx.userId)
        .maybeSingle()

      if (!membership || membership.status !== 'active') {
        throw new ForbiddenException('Your community membership cannot react to happenings right now')
      }
    }

    await (admin as any)
      .from('happening_reactions')
      .upsert({ happening_id: id, user_id: ctx.userId, emoji }, { onConflict: 'happening_id,user_id' })

    const { data: updated } = await (admin as any)
      .from('happenings')
      .select('reaction_count')
      .eq('id', id)
      .single()

    return ok({ reacted: true, emoji, reaction_count: (updated as { reaction_count: number })?.reaction_count ?? 0 })
  } catch (err) {
    return handleApiError(err)
  }
}

// DELETE /api/happenings/:id/react — remove reaction
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const ctx    = await requireAuth()
    const admin  = createSupabaseAdminClient()

    await (admin as any)
      .from('happening_reactions')
      .delete()
      .eq('happening_id', id)
      .eq('user_id', ctx.userId)

    const { data: updated } = await (admin as any)
      .from('happenings')
      .select('reaction_count')
      .eq('id', id)
      .single()

    return ok({ reacted: false, reaction_count: (updated as { reaction_count: number })?.reaction_count ?? 0 })
  } catch (err) {
    return handleApiError(err)
  }
}
