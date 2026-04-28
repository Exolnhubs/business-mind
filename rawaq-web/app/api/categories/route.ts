import { createSupabaseServerClient } from '@/lib/supabase/server'
import { handleApiError, ok } from '@/lib/errors'

// GET /api/categories — public, cacheable
export async function GET() {
  try {
    const supabase = await createSupabaseServerClient()

    const { data, error } = await supabase
      .from('event_categories')
      .select('id, name_en, name_ar, icon, sort_order')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })

    if (error) throw error

    const res = ok(data)
    res.headers.set('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600')
    return res
  } catch (err) {
    return handleApiError(err)
  }
}
