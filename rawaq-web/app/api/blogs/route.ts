import { NextRequest } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { handleApiError, ok } from '@/lib/errors'
import { z } from 'zod'

// GET /api/blogs — top-rated event blogs (public discovery).
// A "blog" = a publicly-visible event that has >=1 published blog post.
// Ranked by the organizer's avg_rating (nulls last), then event views, then post count.
const QuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  per_page: z.coerce.number().int().min(1).max(50).default(12),
})

type BlogCardRow = {
  event_id: string
  title: string
  title_ar: string | null
  cover_image_url: string | null
  city: string | null
  blog_posts_count: number
  views_count: number
  organizer_name: string | null
  organizer_name_ar: string | null
  organizer_logo_url: string | null
  organizer_rating: number | null
}

export async function GET(req: NextRequest) {
  try {
    const { page, per_page } = QuerySchema.parse(Object.fromEntries(req.nextUrl.searchParams))
    const admin = createSupabaseAdminClient()

    // Public events with at least one published blog post.
    // Explicit public-visibility filters keep this discovery list to fully public events
    // (the per-event blog page still enforces visibility via RLS).
    const { data: events, error } = await admin
      .from('events')
      .select('id, title, title_ar, cover_image_url, city, views_count, blog_posts_count, organizer_id')
      .eq('is_published', true)
      .eq('is_cancelled', false)
      .eq('is_private', false)
      .in('visibility_type', ['city', 'national'])
      .gt('blog_posts_count', 0)
      .limit(200)
    if (error) throw error

    const rows = events ?? []
    const organizerIds = [...new Set(rows.map((r) => r.organizer_id))]

    const ratingByOrganizer = new Map<string, number | null>()
    const orgByUser = new Map<string, { name: string; name_ar: string | null; logo_url: string | null }>()

    if (organizerIds.length > 0) {
      const { data: orgs, error: orgErr } = await admin
        .from('organizer_profiles')
        .select('user_id, business_name, business_name_ar, logo_url, avg_rating')
        .in('user_id', organizerIds)
      if (orgErr) throw orgErr
      for (const o of orgs ?? []) {
        // avg_rating is NUMERIC — coerce to a number for sorting/display.
        ratingByOrganizer.set(o.user_id, o.avg_rating == null ? null : Number(o.avg_rating))
        orgByUser.set(o.user_id, {
          name: o.business_name,
          name_ar: o.business_name_ar ?? null,
          logo_url: o.logo_url ?? null,
        })
      }
    }

    const enriched: BlogCardRow[] = rows.map((r) => {
      const org = orgByUser.get(r.organizer_id)
      return {
        event_id: r.id,
        title: r.title,
        title_ar: r.title_ar,
        cover_image_url: r.cover_image_url,
        city: r.city,
        blog_posts_count: r.blog_posts_count,
        views_count: r.views_count,
        organizer_name: org?.name ?? null,
        organizer_name_ar: org?.name_ar ?? null,
        organizer_logo_url: org?.logo_url ?? null,
        organizer_rating: ratingByOrganizer.get(r.organizer_id) ?? null,
      }
    })

    enriched.sort((a, b) => {
      if (a.organizer_rating !== b.organizer_rating) {
        if (a.organizer_rating === null) return 1
        if (b.organizer_rating === null) return -1
        return b.organizer_rating - a.organizer_rating
      }
      if (a.views_count !== b.views_count) return b.views_count - a.views_count
      return b.blog_posts_count - a.blog_posts_count
    })

    const total = enriched.length
    const from = (page - 1) * per_page
    const data = enriched.slice(from, from + per_page)

    return ok({ data, total, page, per_page, has_more: total > from + per_page })
  } catch (err) {
    return handleApiError(err)
  }
}
