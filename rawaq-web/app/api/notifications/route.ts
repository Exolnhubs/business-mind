import { NextRequest } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/auth'
import { handleApiError, ok } from '@/lib/errors'
import { ListNotificationsSchema } from '@/lib/validations/notifications'


// GET /api/notifications
export async function GET(req: NextRequest) {
  try {
    const ctx = await requireAuth()
    const params = ListNotificationsSchema.parse(
      Object.fromEntries(req.nextUrl.searchParams)
    )

    // First try server client for faster RLS resolution
    const server = await createSupabaseServerClient()
    const from = (params.page - 1) * params.per_page

    let query = server
      .from('notifications')
      .select('*')
      .eq('user_id', ctx.userId)
      .order('created_at', { ascending: false })
      .range(from, from + params.per_page - 1)

    if (params.unread_only) {
      query = query.eq('is_read', false)
    }

    const { data, error } = await query
    if (error) throw error

    return ok({ data, total: data?.length ?? 0, page: params.page, per_page: params.per_page })
  } catch (err) {
    return handleApiError(err)
  }
}

// PATCH /api/notifications — mark all as read
export async function PATCH() {
  try {
    const ctx = await requireAuth()
    const admin = createSupabaseAdminClient()

    const { error } = await admin
      .from('notifications')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('user_id', ctx.userId)
      .eq('is_read', false)

    if (error) throw error

    return ok({ marked_read: true })
  } catch (err) {
    return handleApiError(err)
  }
}
