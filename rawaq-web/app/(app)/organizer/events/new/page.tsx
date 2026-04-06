import type { Metadata } from 'next'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { EventForm } from '@/components/organizer/EventForm'

export const metadata: Metadata = { title: 'Create Event' }

export default async function NewEventPage({
  searchParams,
}: {
  searchParams: Promise<{ community?: string }>
}) {
  const { community: communitySlug } = await searchParams
  const supabase = await createSupabaseServerClient()

  const [{ data: categories }, communityResult] = await Promise.all([
    supabase
      .from('event_categories')
      .select('id, name_en, name_ar, icon')
      .eq('is_active', true)
      .order('sort_order'),
    communitySlug
      ? supabase
          .from('communities')
          .select('id')
          .eq('slug', communitySlug)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  const preTaggedCommunityId = communityResult.data?.id ?? null

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Create Event</h1>
      <EventForm
        categories={categories ?? []}
        initialCommunityIds={preTaggedCommunityId ? [preTaggedCommunityId] : []}
      />
    </div>
  )
}
