import { NextRequest } from 'next/server'
import { Redis } from '@upstash/redis'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { requireOrganizer, requireEventOwnership } from '@/lib/auth'
import { handleApiError, ok, ForbiddenException, NotFoundException } from '@/lib/errors'
import { getOrganizerPlanAccess, getFeaturedPerMonth } from '@/lib/plans'

const redis = Redis.fromEnv()
const FEATURED_CACHE_KEY = 'events:featured'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const ctx = await requireOrganizer()
    await requireEventOwnership(id, ctx)

    const supabase = await createSupabaseServerClient()

    // Load event to verify it's publishable
    const { data: event, error: fetchErr } = await supabase
      .from('events')
      .select('id, is_published, is_cancelled, featured_until, organizer_id')
      .eq('id', id)
      .single()

    if (fetchErr || !event) throw new NotFoundException('Event')
    if (!event.is_published) throw new ForbiddenException('Only published events can be featured')
    if (event.is_cancelled) throw new ForbiddenException('Cancelled events cannot be featured')

    const now = new Date()
    const isCurrentlyFeatured = event.featured_until && new Date(event.featured_until) > now

    if (isCurrentlyFeatured) {
      // Unfeature: expire immediately
      const { error } = await supabase
        .from('events')
        .update({ featured_until: now.toISOString() })
        .eq('id', id)

      if (error) throw error

      // Invalidate featured cache
      await redis.del(FEATURED_CACHE_KEY)

      return ok({ featured_until: null, quota: await getQuota(supabase, ctx.userId) })
    }

    // Feature: check plan quota first
    const plan = await getOrganizerPlanAccess(ctx.userId)
    const limit = getFeaturedPerMonth(plan)

    if (limit === 0) {
      throw new ForbiddenException(
        'Your plan does not include featured events. Upgrade to feature events.'
      )
    }

    const quota = await getQuota(supabase, ctx.userId)

    // Only block if this event hasn't already used a slot this month
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
    const { data: alreadyFeaturedThisMonth } = await supabase
      .from('events')
      .select('id')
      .eq('id', id)
      .gte('featured_at', monthStart)
      .maybeSingle()

    if (!alreadyFeaturedThisMonth && quota.used >= limit) {
      throw new ForbiddenException(
        `Monthly featuring limit reached (${limit} events/month on your current plan). Unfeature another event or upgrade.`
      )
    }

    const featuredUntil = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString()

    const { error } = await supabase
      .from('events')
      .update({ featured_at: now.toISOString(), featured_until: featuredUntil })
      .eq('id', id)

    if (error) throw error

    // Invalidate featured cache
    await redis.del(FEATURED_CACHE_KEY)

    // Re-fetch quota after update
    const updatedQuota = await getQuota(supabase, ctx.userId)

    return ok({ featured_until: featuredUntil, quota: updatedQuota })
  } catch (err) {
    return handleApiError(err)
  }
}

async function getQuota(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  organizerId: string
): Promise<{ used: number; limit: number }> {
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()

  const { count } = await supabase
    .from('events')
    .select('id', { count: 'exact', head: true })
    .eq('organizer_id', organizerId)
    .gte('featured_at', monthStart)

  const plan = await getOrganizerPlanAccess(organizerId)
  const limit = getFeaturedPerMonth(plan)

  return { used: count ?? 0, limit }
}
