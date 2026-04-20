import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { optionalAuth } from '@/lib/auth'
import { handleApiError } from '@/lib/errors'

// GET /api/users/:id/events?limit=8&offset=0
// 403 if viewer is not authenticated or not in a mutual follow with target
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: targetId } = await params
    const ctx = await optionalAuth()

    if (!ctx) {
      return NextResponse.json({ error: 'mutual_follow_required' }, { status: 403 })
    }

    // Admins and self bypass the gate
    if (ctx.role !== 'admin' && ctx.role !== 'owner' && ctx.userId !== targetId) {
      const admin = createSupabaseAdminClient()
      // Check both directions are accepted
      const [{ data: viewerRow }, { data: targetRow }] = await Promise.all([
        (admin as any).from('user_follows').select('id').eq('follower_id', ctx.userId).eq('following_id', targetId).eq('status', 'accepted').maybeSingle(),
        (admin as any).from('user_follows').select('id').eq('follower_id', targetId).eq('following_id', ctx.userId).eq('status', 'accepted').maybeSingle(),
      ])
      if (!viewerRow || !targetRow) {
        return NextResponse.json({ error: 'mutual_follow_required' }, { status: 403 })
      }
    }

    const { searchParams } = new URL(req.url)
    const limit  = Math.min(Number(searchParams.get('limit') ?? '8'), 20)
    const offset = Number(searchParams.get('offset') ?? '0')

    const admin = createSupabaseAdminClient()
    const { data, error } = await admin
      .from('bookings')
      .select('id, events!event_id(id, title, title_ar, start_at, cover_image_url, city, venue_name, venue_name_ar, currency, price, is_free, capacity, bookings_count, category:event_categories(name_en), organizer:profiles!organizer_id(id, display_name, organizer_profile:organizer_profiles(business_name)), ticket_types(id, price, is_free, is_active, is_hot_offer, hot_offer_price, hot_offer_ends_at))')
      .eq('user_id', targetId)
      .eq('status', 'confirmed')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) throw error

    const events = (data ?? []).map((b) => (b as any).events).filter(Boolean)
    return NextResponse.json({ data: events })
  } catch (err) {
    return handleApiError(err)
  }
}
