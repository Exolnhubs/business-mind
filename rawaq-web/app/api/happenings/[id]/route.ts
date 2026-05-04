import { NextRequest } from 'next/server'
import { z } from 'zod'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireAuth } from '@/lib/auth'
import { handleApiError, ok, NotFoundException, ForbiddenException } from '@/lib/errors'

const PatchSchema = z.object({
  requires_approval: z.boolean().optional(),
  capacity:          z.number().int().min(1).max(50).optional(),
}).refine((d) => d.requires_approval !== undefined || d.capacity !== undefined, {
  message: 'At least one field must be provided',
})

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

// PATCH /api/happenings/:id — author updates capacity or requires_approval
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const ctx    = await requireAuth()
    const admin  = createSupabaseAdminClient()

    const body   = await req.json()
    const parsed = PatchSchema.parse(body)

    const { data: happening } = await admin
      .from('happenings')
      .select('id, author_id')
      .eq('id', id)
      .maybeSingle()

    if (!happening) throw new NotFoundException('Happening not found')

    const { data: profile } = await admin
      .from('profiles')
      .select('role')
      .eq('id', ctx.userId)
      .single()

    const isAdmin = (profile as { role: string } | null)?.role === 'admin'
    if ((happening as { author_id: string }).author_id !== ctx.userId && !isAdmin) {
      throw new ForbiddenException('Not allowed')
    }

    const updates: Record<string, unknown> = {}
    if (parsed.requires_approval !== undefined) updates.requires_approval = parsed.requires_approval
    if (parsed.capacity !== undefined) updates.capacity = parsed.capacity

    const { data: updated, error } = await admin
      .from('happenings')
      .update(updates)
      .eq('id', id)
      .select('id, capacity, requires_approval')
      .single()

    if (error) throw error

    return ok(updated)
  } catch (err) {
    return handleApiError(err)
  }
}
