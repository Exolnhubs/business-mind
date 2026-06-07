import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { handleApiError, ok, ForbiddenException, NotFoundException } from '@/lib/errors'
import { UpdateBlogPostSchema } from '@/lib/validations/blog'

async function assertOwner(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  postId: string,
  userId: string,
  isAdmin: boolean,
) {
  const { data: post } = await admin
    .from('event_blog_posts')
    .select('id, event:events(organizer_id)')
    .eq('id', postId)
    .maybeSingle()
  if (!post) throw new NotFoundException('Blog post')
  const organizerId = (post.event as unknown as { organizer_id: string } | null)?.organizer_id
  if (organizerId !== userId && !isAdmin) throw new ForbiddenException('Not your post')
}

// PATCH /api/events/:id/blog/:postId — edit or publish a blog post (organizer/admin only)
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; postId: string }> }) {
  try {
    const { postId } = await params
    const ctx = await requireAuth()
    const admin = createSupabaseAdminClient()
    await assertOwner(admin, postId, ctx.userId, ctx.role === 'admin')

    const input = UpdateBlogPostSchema.parse(await req.json())

    const patch: Record<string, unknown> = {}
    if (input.title !== undefined) patch.title = input.title
    if (input.body !== undefined) patch.body = input.body ?? null
    if (input.status !== undefined) patch.status = input.status
    // published_at is stamped by the DB trigger fn_blog_post_published_at
    // when status transitions to 'published' — do NOT set it here.

    if (Object.keys(patch).length > 0) {
      const { error } = await admin.from('event_blog_posts').update(patch as never).eq('id', postId)
      if (error) throw error
    }

    if (input.media !== undefined) {
      // Replace-all: delete existing media rows for this post, then insert the new set.
      // undefined means "leave media untouched"; [] means "clear all media".
      await admin.from('event_blog_media').delete().eq('post_id', postId)
      if (input.media.length > 0) {
        const rows = input.media.map((m, i) => ({
          post_id: postId,
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
    }

    return ok({ id: postId })
  } catch (err) {
    return handleApiError(err)
  }
}

// DELETE /api/events/:id/blog/:postId — delete a blog post (organizer/admin only)
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; postId: string }> }) {
  try {
    const { postId } = await params
    const ctx = await requireAuth()
    const admin = createSupabaseAdminClient()
    await assertOwner(admin, postId, ctx.userId, ctx.role === 'admin')
    const { error } = await admin.from('event_blog_posts').delete().eq('id', postId)
    if (error) throw error
    return ok({ deleted: true })
  } catch (err) {
    return handleApiError(err)
  }
}
