import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { EventForm } from '@/components/organizer/EventForm'

export const metadata: Metadata = { title: 'Edit Event' }

export default async function EditEventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [{ data: event }, { data: categories }, { data: eventCommunities }] = await Promise.all([
    supabase
      .from('events')
      .select('*')
      .eq('id', id)
      .eq('organizer_id', user!.id)
      .single(),
    supabase
      .from('event_categories')
      .select('id, name_en, name_ar, icon')
      .eq('is_active', true)
      .order('sort_order'),
    supabase
      .from('event_communities')
      .select('community_id')
      .eq('event_id', id),
  ])

  if (!event) notFound()

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Edit Event</h1>
      <EventForm
        categories={categories ?? []}
        event={event}
        initialCommunityIds={(eventCommunities ?? []).map((row) => row.community_id)}
      />
    </div>
  )
}
