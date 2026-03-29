import { NextRequest } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/auth'
import { handleApiError, ok, NotFoundException } from '@/lib/errors'
import { z } from 'zod'

const UpdateSchema = z.object({
  status:      z.enum(['open', 'in_progress', 'resolved', 'closed']).optional(),
  admin_notes: z.string().max(2000).optional(),
})

// PATCH /api/admin/support/:id
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const ctx    = await requireAdmin()
    const body   = await req.json()
    const input  = UpdateSchema.parse(body)
    const admin  = createSupabaseAdminClient()

    const updates: Record<string, unknown> = { ...input }
    if (input.status === 'resolved' || input.status === 'closed') {
      updates.resolved_by = ctx.userId
      updates.resolved_at = new Date().toISOString()
    }

    const { data, error } = await (admin as any)
      .from('support_tickets')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error || !data) throw new NotFoundException('Ticket')
    return ok(data)
  } catch (err) {
    return handleApiError(err)
  }
}
