import { requireAuth } from '@/lib/auth'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { handleApiError, ok } from '@/lib/errors'

// GET /api/support/tickets — current user's own tickets
export async function GET() {
  try {
    const ctx   = await requireAuth()
    const admin = createSupabaseAdminClient()

    const { data } = await (admin as any)
      .from('support_tickets')
      .select('id, ticket_number, category, subject, status, created_at, updated_at')
      .eq('user_id', ctx.userId)
      .order('created_at', { ascending: false })
      .limit(50)

    return ok(data ?? [])
  } catch (err) {
    return handleApiError(err)
  }
}
