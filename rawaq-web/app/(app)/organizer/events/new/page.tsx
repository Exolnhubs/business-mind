import type { Metadata } from 'next'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { EventForm } from '@/components/organizer/EventForm'

export const metadata: Metadata = { title: 'Create Event' }

export default async function NewEventPage() {
  const supabase = await createSupabaseServerClient()
  const { data: categories } = await supabase
    .from('event_categories')
    .select('id, name_en, name_ar, icon')
    .eq('is_active', true)
    .order('sort_order')

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Create Event</h1>
      <EventForm categories={categories ?? []} />
    </div>
  )
}
