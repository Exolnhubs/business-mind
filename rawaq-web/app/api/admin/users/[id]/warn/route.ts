import { NextRequest } from 'next/server'
import { z } from 'zod'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth'
import { handleApiError, ok, created, NotFoundException } from '@/lib/errors'

const WarnSchema = z.object({
  severity:      z.enum(['low', 'medium', 'high']).default('medium'),
  reason:        z.string().min(5).max(500),
  internal_note: z.string().max(500).optional(),
})

// POST /api/admin/users/:id/warn — issue a formal warning
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: userId } = await params
    const ctx   = await requireAdmin()
    const body  = await req.json()
    const input = WarnSchema.parse(body)

    const supabase = await createSupabaseServerClient()

    const { data: target } = await supabase
      .from('profiles').select('id, display_name, role').eq('id', userId).single()
    if (!target) throw new NotFoundException('User')

    const { data, error } = await supabase
      .from('user_warnings')
      .insert({
        user_id:       userId,
        issued_by:     ctx.userId,
        severity:      input.severity,
        reason:        input.reason,
        internal_note: input.internal_note ?? null,
      } as never)
      .select()
      .single()

    if (error) throw error

    // Audit log
    await supabase.from('audit_logs').insert({
      admin_id:    ctx.userId,
      action:      'warn_user',
      target_type: 'user',
      target_id:   userId,
      meta:        { severity: input.severity, reason: input.reason, display_name: target.display_name },
    } as never)

    return created(data)
  } catch (err) {
    return handleApiError(err)
  }
}

// GET /api/admin/users/:id/warn — list warnings for a user
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: userId } = await params
    await requireAdmin()
    const supabase = await createSupabaseServerClient()

    const { data, error } = await supabase
      .from('user_warnings')
      .select(`id, severity, reason, internal_note, acknowledged, acknowledged_at, created_at,
               issuer:profiles!issued_by(id, display_name)`)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })

    if (error) throw error

    return ok(data)
  } catch (err) {
    return handleApiError(err)
  }
}
