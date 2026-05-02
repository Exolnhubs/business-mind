import { NextRequest } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireAuth } from '@/lib/auth'
import { handleApiError, ok, NotFoundException, ForbiddenException } from '@/lib/errors'

// DELETE /api/happenings/:id — author or admin deletes a happening
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id }  = await params
    const ctx     = await requireAuth()
    const admin   = createSupabaseAdminClient()

    const { data: happening, error } = await admin
      .from('happenings')
      .select('id, author_id')
      .eq('id', id)
      .maybeSingle()

    if (error || !happening) throw new NotFoundException('Happening not found')

    // Check caller is author (admin bypass handled by RLS in the delete)
    const { data: profile } = await admin
      .from('profiles')
      .select('role')
      .eq('id', ctx.userId)
      .single()

    const isAdmin = (profile as { role: string } | null)?.role === 'admin'
    if ((happening as { author_id: string }).author_id !== ctx.userId && !isAdmin) {
      throw new ForbiddenException('Not allowed')
    }

    await admin.from('happenings').delete().eq('id', id)

    return ok({ deleted: true })
  } catch (err) {
    return handleApiError(err)
  }
}
