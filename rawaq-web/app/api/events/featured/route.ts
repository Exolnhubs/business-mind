import { NextRequest } from 'next/server'
import { Redis } from '@upstash/redis'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { handleApiError, ok } from '@/lib/errors'
import { applyResolvedEventWindow } from '@/lib/events/recurrence'

const redis = Redis.fromEnv()
const CACHE_TTL_SECONDS = 300 // 5 minutes
const FEATURED_CACHE_KEY = 'events:featured'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const force = searchParams.get('force') === 'true'

    if (!force) {
      const cached = await redis.get(FEATURED_CACHE_KEY)
      if (cached) {
        return ok(cached)
      }
    }

    const supabase = await createSupabaseServerClient()
    const now = new Date().toISOString()

    const EVENT_SELECT = `
      *,
      organizer:profiles!organizer_id(
        id, display_name, avatar_url,
        organizer_profile:organizer_profiles!user_id(business_name, business_name_ar, logo_url, verified)
      ),
      category:event_categories(id, name_en, name_ar, icon),
      ticket_types(id, price, is_free, is_active, is_hot_offer, hot_offer_price, hot_offer_ends_at)
    `

    const { data } = await supabase
      .from('events')
      .select(EVENT_SELECT)
      .eq('is_published', true)
      .eq('is_cancelled', false)
      .gt('featured_until', now)
      .order('featured_until', { ascending: false })
      .limit(6)

    const events = ((data ?? []) as Array<{ start_at: string; end_at?: string | null }>)
      .map((row) => applyResolvedEventWindow(row))
      .filter((event) => new Date(event.start_at).getTime() >= Date.now())

    const payload = { featured: events, total: events.length }

    await redis.setex(FEATURED_CACHE_KEY, CACHE_TTL_SECONDS, payload)

    return ok(payload)
  } catch (err) {
    return handleApiError(err)
  }
}
