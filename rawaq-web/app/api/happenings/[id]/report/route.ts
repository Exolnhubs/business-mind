import { NextRequest } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireAuth } from '@/lib/auth'
import { handleApiError, ok, NotFoundException } from '@/lib/errors'
import { z } from 'zod'

const ReportSchema = z.object({
  reason: z.enum(['spam', 'inappropriate', 'harassment', 'misinformation', 'other']),
  details: z.string().max(500).optional(),
})

// POST /api/happenings/:id/report
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id }   = await params
    const ctx      = await requireAuth()
    const admin    = createSupabaseAdminClient()
    const body     = await req.json()
    const { reason, details } = ReportSchema.parse(body)

    const { data: happening } = await (admin as any)
      .from('happenings')
      .select('id, community_id')
      .eq('id', id)
      .maybeSingle()

    if (!happening) throw new NotFoundException('Happening not found')

    // Upsert — one report per user per happening
    await (admin as any)
      .from('happening_reports')
      .upsert(
        { happening_id: id, reporter_id: ctx.userId, reason, details: details ?? null },
        { onConflict: 'happening_id,reporter_id' }
      )

    return ok({ reported: true })
  } catch (err) {
    return handleApiError(err)
  }
}
