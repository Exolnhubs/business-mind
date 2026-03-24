import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { EventCard } from '@/components/events/EventCard'
import { EmptyState } from '@/components/ui/EmptyState'
import type { EventWithOrganizer } from '@/types/database'

export const metadata: Metadata = { title: 'Saved Events' }

export default async function SavedEventsPage() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: saves } = await supabase
    .from('saved_events')
    .select(`
      event_id,
      event:events!event_id(
        *,
        organizer:profiles!organizer_id(
          id, display_name, avatar_url,
          organizer_profile:organizer_profiles!user_id(business_name, business_name_ar, logo_url, verified)
        ),
        category:event_categories(id, name_en, name_ar, icon)
      )
    `)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  const events = (saves ?? [])
    .map((s) => s.event)
    .filter(Boolean) as EventWithOrganizer[]

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Saved Events</h1>
        <p className="text-gray-500 text-sm mt-1">{events.length} event{events.length !== 1 ? 's' : ''} saved</p>
      </div>

      {events.length === 0 ? (
        <EmptyState
          icon="🤍"
          title="No saved events yet"
          description="Tap the heart on any event to save it here"
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {events.map((event) => (
            <EventCard key={event.id} event={event} isSaved showSave />
          ))}
        </div>
      )}
    </div>
  )
}
