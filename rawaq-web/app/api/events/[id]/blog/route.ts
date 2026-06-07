import { NextRequest } from 'next/server'
import { requireAuth, optionalAuth } from '@/lib/auth'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { handleApiError, ok, created, ForbiddenException } from '@/lib/errors'
import { checkRateLimit, limiters } from '@/lib/rate-limit'
import { CreateBlogPostSchema } from '@/lib/validations/blog'

const POST_SELECT =
  'id, event_id, author_id, title, body, status, published_at, created_at, updated_at, media:event_blog_media(id, post_id, kind, url, title, thumbnail_url, caption, position)'

type BlogMediaShape = {
  id: string
  post_id: string
  kind: string
  url: string
  title: string | null
  thumbnail_url: string | null
  caption: string | null
  position: number
}

// GET /api/events/:id/blog — list posts (published for the public, drafts for the owner)
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const ctx = await optionalAuth()
    const admin = createSupabaseAdminClient()

    let isOwner = false
    if (ctx?.userId) {
      const { data: ev } = await admin
        .from('events')
        .select('organizer_id')
        .eq('id', id)
        .maybeSingle()
      isOwner = ev?.organizer_id === ctx.userId || ctx.role === 'admin'
    }

    // Use the RLS-enforcing server client for the actual read so event
    // visibility (is_event_visible_to_caller) is applied for anonymous /
    // non-member callers. The admin client above is used only to detect
    // ownership (owners may see drafts).
    const supabase = await createSupabaseServerClient()
    let query = supabase
      .from('event_blog_posts')
      .select(POST_SELECT)
      .eq('event_id', id)
      .order('published_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
    if (!isOwner) query = query.eq('status', 'published')

    const { data, error } = await query
    if (error) throw error

    const posts = (data ?? []).map((p) => {
      const media = (((p as unknown as { media?: BlogMediaShape[] }).media) ?? [])
        .slice()
        .sort((a, b) => a.position - b.position)
      return { ...p, media }
    })
    return ok({ data: posts })
  } catch (err) {
    return handleApiError(err)
  }
}

// POST /api/events/:id/blog — create a post (organizer/admin only)
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const ctx = await requireAuth()
    await checkRateLimit(limiters.communityCreate, ctx.userId)
    const admin = createSupabaseAdminClient()

    const { data: ev } = await admin
      .from('events')
      .select('organizer_id')
      .eq('id', id)
      .maybeSingle()
    const isOwner = ev?.organizer_id === ctx.userId || ctx.role === 'admin'
    if (!isOwner) throw new ForbiddenException('Only the event organizer can post')

    const input = CreateBlogPostSchema.parse(await req.json())

    const { data: post, error } = await admin
      .from('event_blog_posts')
      .insert({
        event_id: id,
        author_id: ctx.userId,
        title: input.title,
        body: input.body ?? null,
        status: input.status,
      } as never)
      .select('id')
      .single()
    if (error) throw error

    if (input.media.length > 0) {
      const rows = input.media.map((m, i) => ({
        post_id: post.id,
        kind: m.kind,
        url: m.url,
        title: m.title ?? null,
        thumbnail_url: m.thumbnail_url ?? null,
        caption: m.caption ?? null,
        position: m.position ?? i,
      }))
      const { error: mErr } = await admin.from('event_blog_media').insert(rows as never)
      if (mErr) throw mErr
    }

    return created({ id: post.id })
  } catch (err) {
    return handleApiError(err)
  }
}
