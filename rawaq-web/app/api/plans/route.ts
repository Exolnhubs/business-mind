import { createSupabaseServerClient } from '@/lib/supabase/server'
import { handleApiError, ok } from '@/lib/errors'

// GET /api/plans — public catalogue of all active plan definitions
export async function GET() {
  try {
    const supabase = await createSupabaseServerClient()

    const { data, error } = await supabase
      .from('plan_definitions')
      .select('*')
      .eq('is_active', true)
      .order('type')
      .order('sort_order')

    if (error) throw error

    return ok(data)
  } catch (err) {
    return handleApiError(err)
  }
}
