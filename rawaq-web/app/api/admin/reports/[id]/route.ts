import { NextRequest } from 'next/server'
import { z } from 'zod'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth'
import { handleApiError, ok, NotFoundException } from '@/lib/errors'

const ResolveSchema = z.object({
  action:          z.enum(['resolve', 'dismiss']),
  resolution_note: z.string().max(500).optional(),
  public_response: z.string().max(2000).optional(),
})

// PATCH /api/admin/reports/:id — resolve or dismiss an event report
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const ctx    = await requireAdmin()
    const body   = await req.json()
    const input  = ResolveSchema.parse(body)

    const supabase = await createSupabaseServerClient()

    const { data: report } = await supabase
      .from('event_reports').select('id, event_id, reason').eq('id', id).single()
    if (!report) throw new NotFoundException('Report')

    const newStatus = input.action === 'resolve' ? 'resolved' : 'dismissed'

    const { data, error } = await supabase
      .from('event_reports')
      .update({
        status:          newStatus,
        resolved_by:     ctx.userId,
        resolved_at:     new Date().toISOString(),
        resolution_note: input.resolution_note ?? null,
        public_response: input.public_response ?? null,
      })
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    // Write to audit_log
    await supabase.from('audit_logs').insert({
      admin_id:    ctx.userId,
      action:      input.action === 'resolve' ? 'resolve_report' : 'dismiss_report',
      target_type: 'report',
      target_id:   id,
      meta:        { event_id: report.event_id, reason: report.reason, resolution_note: input.resolution_note },
    } as never)

    return ok(data)
  } catch (err) {
    return handleApiError(err)
  }
}
