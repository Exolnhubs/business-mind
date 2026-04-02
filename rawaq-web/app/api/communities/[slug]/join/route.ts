import { NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/auth'
import { handleApiError, ok, NotFoundException, ConflictException } from '@/lib/errors'

// POST /api/communities/:slug/join
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params
    const ctx      = await requireAuth()
    const supabase = await createSupabaseServerClient()

    const { data: community, error: cErr } = await supabase
      .from('communities')
      .select('id, name, member_count')
      .eq('slug', slug)
      .single()

    if (cErr || !community) throw new NotFoundException('Community not found')

    const { error: insertErr } = await supabase
      .from('community_memberships')
      .insert({ community_id: community.id, user_id: ctx.userId } as any)

    if (insertErr) {
      if (insertErr.code === '23505') throw new ConflictException('Already a member')
      throw insertErr
    }

    return ok({ community_id: community.id, member_count: community.member_count + 1 })
  } catch (err) {
    return handleApiError(err)
  }
}
