import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import Link from 'next/link'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { Badge } from '@/components/ui/Badge'
import { BookingFlow } from '@/components/events/BookingFlow'
import { SaveButton } from '@/components/events/SaveButton'
import { TipPanel } from '@/components/events/TipPanel'
import { ReportEventButton } from '@/components/events/ReportEventButton'
import { CommentThread } from '@/components/comments/CommentThread'
import { formatDate, formatTime, formatCurrency } from '@/lib/utils'
import type { Community, EventWithOrganizer, CommentWithAuthor, TicketType } from '@/types/database'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const supabase = await createSupabaseServerClient()
  const { data } = await supabase.from('events').select('title').eq('id', id).single()
  return { title: data?.title ?? 'Event' }
}

export default async function EventDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createSupabaseServerClient()

  // Fetch event
  const { data: event, error } = await supabase
    .from('events')
    .select(`
      *,
      organizer:profiles!organizer_id(
        id, display_name, avatar_url,
        organizer_profile:organizer_profiles!user_id(business_name, business_name_ar, logo_url, verified)
      ),
      category:event_categories(id, name_en, name_ar, icon)
    `)
    .eq('id', id)
    .single()

  if (!event) notFound()

  const ev = event as unknown as EventWithOrganizer

  const { data: { user } } = await supabase.auth.getUser()
  let isBooked = false
  let isSaved = false
  let isOnWaitlist = false
  if (user) {
    const [{ data: booking }, { data: save }, { data: waitlist }] = await Promise.all([
      supabase
        .from('bookings').select('id')
        .eq('event_id', id).eq('user_id', user.id).eq('status', 'confirmed').single(),
      supabase
        .from('saved_events').select('event_id')
        .eq('user_id', user.id).eq('event_id', id).single(),
      supabase
        .from('waitlist').select('id')
        .eq('event_id', id).eq('user_id', user.id).eq('status', 'waiting').single(),
    ])
    isBooked = !!booking
    isSaved = !!save
    isOnWaitlist = !!waitlist
  }

  // Fetch ticket types for this event
  const { data: ticketTypes } = await supabase
    .from('ticket_types')
    .select('*')
    .eq('event_id', id)
    .eq('is_active', true)
    .order('sort_order')

  const { data: eventCommunityRows } = await supabase
    .from('event_communities')
    .select('community_id')
    .eq('event_id', id)

  const eventCommunityIds = (eventCommunityRows ?? []).map((row) => row.community_id)
  let eventCommunities: Array<Pick<Community, 'id' | 'name' | 'name_ar' | 'slug' | 'level'>> = []
  if (eventCommunityIds.length > 0) {
    const { data: communities } = await supabase
      .from('communities')
      .select('id, name, name_ar, slug, level')
      .in('id', eventCommunityIds)
    eventCommunities = (communities ?? []) as Array<Pick<Community, 'id' | 'name' | 'name_ar' | 'slug' | 'level'>>
  }

  // Fetch top-level comments with authors
  const { data: comments } = await supabase
    .from('comments')
    .select(`
      *,
      author:profiles!user_id(id, display_name, avatar_url),
      replies:comments!parent_id(
        *,
        author:profiles!user_id(id, display_name, avatar_url)
      )
    `)
    .eq('event_id', id)
    .is('parent_id', null)
    .eq('is_deleted', false)
    .order('created_at', { ascending: false })
    .limit(50)

  const spotsLeft = ev.capacity ? ev.capacity - ev.bookings_count : null
  const isFull = spotsLeft !== null && spotsLeft <= 0

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

        {/* ── Main content ── */}
        <div className="lg:col-span-2 space-y-6">

          {/* Cover */}
          <div className="relative h-56 sm:h-72 rounded-2xl overflow-hidden bg-gradient-to-br from-brand-100 to-brand-200 flex items-center justify-center">
            {ev.cover_image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={ev.cover_image_url} alt={ev.title} className="absolute inset-0 w-full h-full object-cover" />
            ) : (
              <span className="text-8xl">{ev.category?.icon ?? '📅'}</span>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
            <div className="absolute bottom-4 start-4 flex gap-2">
              {(ev.is_free || (ticketTypes && ticketTypes.length > 0 && (ticketTypes as TicketType[]).every(t => t.is_free))) && <Badge variant="green">Free</Badge>}
              {ev.is_family_friendly && <Badge variant="blue">👨‍👩‍👧 Family Friendly</Badge>}
              {ev.gender_restriction !== 'mixed' && (
                <Badge variant="yellow">
                  {ev.gender_restriction === 'male' ? '♂ Men Only' : '♀ Women Only'}
                </Badge>
              )}
              {ev.is_cancelled && <Badge variant="red">Cancelled</Badge>}
            </div>
          </div>

          {/* Title & meta */}
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{ev.title}</h1>
            {ev.category && (
              <span className="text-sm text-brand-600 font-medium mt-1 inline-block">
                {ev.category.icon} {ev.category.name_en}
              </span>
            )}
            {eventCommunities.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {eventCommunities.map((community) => (
                  <Link
                    key={community.id}
                    href={`/communities/${community.slug}`}
                    className="rounded-full border border-brand-100 bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700 hover:bg-brand-100"
                  >
                    {community.name}
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Info grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <InfoBlock icon="📅" label="Date & Time">
              <p className="text-sm font-medium">{formatDate(ev.start_at)}</p>
              <p className="text-xs text-gray-500">{formatTime(ev.start_at)}{ev.end_at ? ` – ${formatTime(ev.end_at)}` : ''}</p>
            </InfoBlock>

            <InfoBlock icon="📍" label="Location">
              <p className="text-sm font-medium">{ev.venue_name ?? 'TBA'}</p>
              <p className="text-xs text-gray-500">{ev.address ? `${ev.address}, ` : ''}{ev.city}, {ev.country}</p>
            </InfoBlock>

            <InfoBlock icon="👥" label="Attendees">
              <p className="text-sm font-medium">{ev.bookings_count} attending</p>
              {ev.capacity && (
                <p className="text-xs text-gray-500">
                  {isFull ? 'Fully booked' : `${spotsLeft} spots left`} of {ev.capacity}
                </p>
              )}
            </InfoBlock>

            <InfoBlock icon="💰" label="Price">
              {ticketTypes && ticketTypes.length > 0 ? (
                <div className="space-y-0.5">
                  {ticketTypes.map((tt) => (
                    <p key={tt.id} className="text-sm font-medium">
                      <span className="text-gray-600">{tt.name}: </span>
                      <span className={tt.is_free ? 'text-green-600' : 'text-brand-700'}>
                        {tt.is_free ? 'Free' : formatCurrency(tt.price, ev.currency)}
                      </span>
                    </p>
                  ))}
                </div>
              ) : (
                <p className="text-sm font-medium">
                  {ev.is_free ? 'Free' : formatCurrency(ev.price ?? 0, ev.currency)}
                </p>
              )}
            </InfoBlock>
          </div>

          {/* Description */}
          {ev.description && (
            <div>
              <h2 className="font-semibold text-gray-900 mb-2">About this event</h2>
              <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">{ev.description}</p>
            </div>
          )}

          {/* Organizer */}
          <div className="card p-4 flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-brand-100 flex items-center justify-center text-xl font-bold text-brand-700 shrink-0">
              {ev.organizer?.organizer_profile?.logo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={ev.organizer.organizer_profile.logo_url} alt="" className="w-full h-full object-cover rounded-full" />
              ) : (
                (ev.organizer?.organizer_profile?.business_name ?? ev.organizer?.display_name ?? '?')[0].toUpperCase()
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="text-sm font-semibold text-gray-900">
                  {ev.organizer?.organizer_profile?.business_name ?? ev.organizer?.display_name ?? 'Organizer'}
                </p>
                {ev.organizer?.organizer_profile?.verified && (
                  <span title="Verified">✅</span>
                )}
              </div>
              <p className="text-xs text-gray-500">Event Organizer</p>
            </div>
          </div>

        </div>

        {/* ── Sidebar ── */}
        <div className="space-y-4 lg:sticky lg:top-20 self-start">
          {/* Booking CTA */}
          {!ev.is_cancelled && (
            <div className="card p-5 space-y-3">
              {/* Price display */}
              <div className="flex items-baseline justify-between">
                {ticketTypes && ticketTypes.length > 0 ? (
                  <div>
                    {(() => {
                      const paid = (ticketTypes as TicketType[]).filter((t) => t.is_active && !t.is_free)
                      if (paid.length === 0) return <span className="text-2xl font-bold text-green-600">Free</span>
                      const prices = paid.map((t) => t.price)
                      const min = Math.min(...prices)
                      const max = Math.max(...prices)
                      return (
                        <div>
                          <span className="text-xs text-gray-400 font-medium uppercase tracking-wide block">from</span>
                          <span className="text-2xl font-bold text-gray-900">{formatCurrency(min, ev.currency)}</span>
                          {max !== min && <span className="text-sm text-gray-500 ml-1">– {formatCurrency(max, ev.currency)}</span>}
                        </div>
                      )
                    })()}
                  </div>
                ) : (
                  <span className="text-2xl font-bold text-gray-900">
                    {ev.is_free ? 'Free' : formatCurrency(ev.price ?? 0, ev.currency)}
                  </span>
                )}
                {ev.capacity && (
                  <span className="text-xs text-gray-500">{spotsLeft ?? ev.capacity} left</span>
                )}
              </div>
              <BookingFlow
                eventId={id}
                isFull={isFull}
                isBooked={isBooked}
                isFree={ev.is_free}
                eventPrice={ev.price}
                currency={ev.currency}
                ticketTypes={(ticketTypes ?? []) as TicketType[]}
                isOnWaitlist={isOnWaitlist}
              />
            </div>
          )}

          {/* Tip panel — only show if user has booked */}
          {isBooked && ev.organizer_id && (
            <TipPanel eventId={id} organizerId={ev.organizer_id} currency={ev.currency} />
          )}

          {/* Save button */}
          {user && (
            <SaveButton eventId={id} initialSaved={isSaved} size="lg" />
          )}

          {/* Organizer profile link */}
          {ev.organizer_id && (
            <Link
              href={`/organizer/${ev.organizer_id}`}
              className="block card p-3 text-xs text-brand-600 font-medium hover:bg-brand-50 text-center"
            >
              View organizer profile →
            </Link>
          )}

          {/* Report event */}
          {user && user.id !== ev.organizer_id && (
            <ReportEventButton eventId={id} />
          )}
        </div>

        {/* Comments */}
        <div className="lg:col-span-2">
          <h2 className="font-semibold text-gray-900 mb-4">
            Comments ({comments?.length ?? 0})
          </h2>
          <CommentThread
            eventId={id}
            initialComments={(comments ?? []) as unknown as CommentWithAuthor[]}
            currentUserId={user?.id ?? null}
          />
        </div>
      </div>
    </div>
  )
}

function InfoBlock({ icon, label, children }: { icon: string; label: string; children: React.ReactNode }) {
  return (
    <div className="card p-4 flex items-start gap-3">
      <span className="text-xl">{icon}</span>
      <div>
        <p className="text-xs text-gray-400 uppercase tracking-wide font-medium mb-0.5">{label}</p>
        {children}
      </div>
    </div>
  )
}
