import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { BlogPostEditor } from '@/components/blog/BlogPostEditor'

export const metadata: Metadata = { title: 'Event Updates' }

export const dynamic = 'force-dynamic'

export default async function OrganizerEventBlogPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Organizer-only gate (mirrors sibling pages, e.g. attendees/edit):
  // the event must belong to the signed-in organizer.
  const { data: event } = await supabase
    .from('events')
    .select('id')
    .eq('id', id)
    .eq('organizer_id', user!.id)
    .single()

  if (!event) notFound()

  return <BlogPostEditor eventId={id} />
}
