import { NextRequest } from 'next/server'
import { z } from 'zod'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/auth'
import { handleApiError, ok, created, ForbiddenException, BadRequestException } from '@/lib/errors'

const ReviewSchema = z.object({
  rating:  z.number().int().min(1).max(5),
  content: z.string().max(1000).optional().nullable(),
})

// GET /api/users/:id/reviews — list reviews for a user
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createSupabaseServerClient()

    const page    = Math.max(1, Number(req.nextUrl.searchParams.get('page') ?? 1))
    const perPage = 20
    const from    = (page - 1) * perPage

    const { data, count, error } = await supabase
      .from('user_reviews')
      .select('*, reviewer:profiles!reviewer_id(id, display_name, avatar_url)', { count: 'exact' })
      .eq('reviewed_id', id)
      .order('created_at', { ascending: false })
      .range(from, from + perPage - 1)

    if (error) throw error

    // Aggregate stats
    const { data: stats } = await supabase
      .from('user_reviews')
      .select('rating')
      .eq('reviewed_id', id)

    const total  = stats?.length ?? 0
    const avgRaw = total > 0
      ? (stats!.reduce((s, r) => s + r.rating, 0) / total)
      : null
    const avg = avgRaw !== null ? Math.round(avgRaw * 10) / 10 : null

    return ok({ data: data ?? [], total: count ?? 0, page, per_page: perPage, avg_rating: avg, total_reviews: total })
  } catch (err) {
    return handleApiError(err)
  }
}

// POST /api/users/:id/reviews — submit or update a review
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: reviewedId } = await params
    const ctx = await requireAuth()

    if (ctx.userId === reviewedId) {
      throw new ForbiddenException('You cannot review yourself')
    }

    const body  = await req.json()
    const input = ReviewSchema.parse(body)

    const supabase = await createSupabaseServerClient()

    const { data, error } = await supabase
      .from('user_reviews')
      .upsert(
        {
          reviewer_id: ctx.userId,
          reviewed_id: reviewedId,
          rating:      input.rating,
          content:     input.content ?? null,
        },
        { onConflict: 'reviewer_id,reviewed_id' }
      )
      .select()
      .single()

    if (error) throw error
    return created(data)
  } catch (err) {
    return handleApiError(err)
  }
}

// DELETE /api/users/:id/reviews — remove own review
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: reviewedId } = await params
    const ctx = await requireAuth()
    const supabase = await createSupabaseServerClient()

    const { error } = await supabase
      .from('user_reviews')
      .delete()
      .eq('reviewer_id', ctx.userId)
      .eq('reviewed_id', reviewedId)

    if (error) throw error
    return ok({ deleted: true })
  } catch (err) {
    return handleApiError(err)
  }
}
