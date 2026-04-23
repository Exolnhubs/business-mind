import Link from 'next/link'
import { EventCard } from '@/components/events/EventCard'
import { Badge } from '@/components/ui/Badge'
import type { EventWithOrganizer } from '@/types/database'

export function FeaturedEventsRail({ events }: { events: EventWithOrganizer[] }) {
  if (events.length === 0) return null

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-base font-semibold text-gray-900">Featured Events</span>
        <Badge variant="amber">Featured</Badge>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {events.map((event, i) => (
          <div key={event.id} className="relative">
            <div className="absolute top-2 start-2 z-10">
              <Badge variant="amber">Featured</Badge>
            </div>
            <EventCard event={event} isSaved={false} showSave={false} priority={i < 3} />
          </div>
        ))}
      </div>
    </div>
  )
}