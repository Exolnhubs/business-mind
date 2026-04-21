import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { Badge } from '@/components/ui/Badge'
import { BookingFlow } from '@/components/events/BookingFlow'
import { SaveButton } from '@/components/events/SaveButton'
import { TipPanel } from '@/components/events/TipPanel'
import { ReportEventButton } from '@/components/events/ReportEventButton'
import { CommentThread } from '@/components/comments/CommentThread'
import { formatDate, formatTime, formatCurrency } from '@/lib/utils'
import type { Community, EventOccurrence, EventWithOrganizer, CommentWithAuthor, TicketType } from '@/types/database'
import { applyResolvedEventWindow } from '@/lib/events/recurrence'
import { listEventOccurrences, getBookableOccurrences } from '@/lib/events/occurrences'
import {
  EventCoverBadgeFree,
  EventBadgeFamilyFriendly,
  EventBadgeMenOnly,
  EventBadgeWomenOnly,
  EventBadgeCancelled,
  InfoBlockLabel,
  EventVenueName,
  EventAttendingCount,
  EventCapacityRow,
  EventFreeLabel,
  EventAboutHeading,
  EventOrganizerRole,
  EventOrganizerName,
  SidebarPriceFrom,
  SidebarSpotsLeft,
  EventViewOrganizerLink,
  EventCommentsHeading,
  EventCategoryName,
  EventCommunityChip,
} from '@/components/events/EventDetailStrings'

function getEffectivePrice(tt: TicketType): number {
  if (tt.is_hot_offer && tt.hot_offer_price != null && tt.hot_offer_ends_at && new Date(tt.hot_offer_ends_at) > new Date()) {
    return tt.hot_offer_price
  }
  return tt.price
}

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

  const ev = applyResolvedEventWindow(event as unknown as EventWithOrganizer)
  const isRecurring = ev.event_frequency !== 'one_time'
  const now = new Date()

  const occurrences = isRecurring
    ? getBookableOccurrences(await listEventOccurrences(createSupabaseAdminClient(), ev.id), now)
    : []

  const { data: { user } } = await supabase.auth.getUser()
  let isBooked = false
  let hasConfirmedBooking = false
  let isSaved = false
  let isOnWaitlist = false
  let confirmedOccurrenceIds: string[] = []
  let pendingOccurrenceIds: string[] = []
  let waitlistedOccurrenceIds: string[] = []
  if (user) {
    const [{ data: bookingRows }, { data: save }, { data: waitlistRows }] = await Promise.all([
      supabase
        .from('bookings').select('id, occurrence_id, status')
        .eq('event_id', id).eq('user_id', user.id).in('status', ['confirmed', 'pending']),
      supabase
        .from('saved_events').select('event_id')
        .eq('user_id', user.id).eq('event_id', id).single(),
      supabase
        .from('waitlist').select('occurrence_id')
        .eq('event_id', id).eq('user_id', user.id).eq('status', 'waiting'),
    ])
    const confirmedBookings = (bookingRows ?? []).filter((booking) => booking.status === 'confirmed')
    confirmedOccurrenceIds = confirmedBookings.map((booking) => booking.occurrence_id).filter(Boolean)
    pendingOccurrenceIds = (bookingRows ?? []).filter((booking) => booking.status === 'pending').map((booking) => booking.occurrence_id).filter(Boolean)
    waitlistedOccurrenceIds = (waitlistRows ?? []).map((row) => row.occurrence_id).filter(Boolean)
    hasConfirmedBooking = confirmedBookings.length > 0
    isBooked = isRecurring ? false : confirmedBookings.length > 0
    isSaved = !!save
    isOnWaitlist = isRecurring ? false : waitlistedOccurrenceIds.length > 0
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
      author:profiles!user_id(id, display_name, avatar_url, plan_id),
      replies:comments!parent_id(
        *,
        author:profiles!user_id(id, display_name, avatar_url, plan_id)
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
              {(ev.is_free || (ticketTypes && ticketTypes.length > 0 && (ticketTypes as TicketType[]).every(t => t.is_free))) && <Badge variant="green"><EventCoverBadgeFree /></Badge>}
              {ev.is_family_friendly && <Badge variant="blue"><EventBadgeFamilyFriendly /></Badge>}
              {ev.gender_restriction !== 'mixed' && (
                <Badge variant="yellow">
                  {ev.gender_restriction === 'male' ? <EventBadgeMenOnly /> : <EventBadgeWomenOnly />}
                </Badge>
              )}
              {ev.is_cancelled && <Badge variant="red"><EventBadgeCancelled /></Badge>}
            </div>
          </div>

          {/* Title & meta */}
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{ev.title}</h1>
            {ev.category && (
              <EventCategoryName nameEn={ev.category.name_en} nameAr={ev.category.name_ar} icon={ev.category.icon} />
            )}
            {eventCommunities.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {eventCommunities.map((community) => (
                  <EventCommunityChip
                    key={community.id}
                    id={community.id}
                    name={community.name}
                    nameAr={community.name_ar ?? null}
                    slug={community.slug}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Info grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <InfoBlock icon="📅" labelKey="event.date_time">
              <p className="text-sm font-medium">{formatDate(ev.start_at)}</p>
              <p className="text-xs text-gray-500">{formatTime(ev.start_at)}{ev.end_at ? ` - ${formatTime(ev.end_at)}` : ''}</p>
            </InfoBlock>

            <InfoBlock icon="📍" labelKey="event.location">
              <EventVenueName name={ev.venue_name} />
              <p className="text-xs text-gray-500">{ev.address ? `${ev.address}, ` : ''}{ev.city}, {ev.country}</p>
            </InfoBlock>

            <InfoBlock icon="👥" labelKey="event.attendees">
              <EventAttendingCount count={ev.bookings_count} />
              {ev.capacity && (
                <EventCapacityRow spotsLeft={spotsLeft ?? 0} capacity={ev.capacity} isFull={isFull} />
              )}
            </InfoBlock>

            <InfoBlock icon="💰" labelKey="event.price">
              {ticketTypes && ticketTypes.length > 0 ? (
                <div className="space-y-0.5">
                  {(ticketTypes as TicketType[]).map((tt) => {
                    const effective = getEffectivePrice(tt)
                    const hotActive = tt.is_hot_offer && tt.hot_offer_price != null && !!tt.hot_offer_ends_at && new Date(tt.hot_offer_ends_at) > new Date()
                    return (
                      <p key={tt.id} className="text-sm font-medium flex items-center gap-1.5">
                        <span className="text-gray-600">{tt.name}: </span>
                        {tt.is_free ? (
                          <EventFreeLabel />
                        ) : hotActive ? (
                          <>
                            <span className="text-gray-400 line-through text-xs">{formatCurrency(tt.price, ev.currency)}</span>
                            <span className="text-orange-600 font-semibold">🔥 {formatCurrency(effective, ev.currency)}</span>
                          </>
                        ) : (
                          <span className="text-brand-700">{formatCurrency(effective, ev.currency)}</span>
                        )}
                      </p>
                    )
                  })}
                </div>
              ) : (
                <p className="text-sm font-medium">
                  {ev.is_free ? <EventFreeLabel /> : formatCurrency(ev.price ?? 0, ev.currency)}
                </p>
              )}
            </InfoBlock>
          </div>

          {/* Description */}
          {ev.description && (
            <div>
              <EventAboutHeading />
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
                <EventOrganizerName
                  businessName={ev.organizer?.organizer_profile?.business_name ?? null}
                  businessNameAr={ev.organizer?.organizer_profile?.business_name_ar ?? null}
                  displayName={ev.organizer?.display_name ?? null}
                />
                {ev.organizer?.organizer_profile?.verified && (
                  <span title="Verified">✅</span>
                )}
              </div>
              <EventOrganizerRole />
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
                      if (paid.length === 0) return <span className="text-2xl font-bold text-green-600"><EventCoverBadgeFree /></span>
                      const prices = paid.map((t) => getEffectivePrice(t))
                      const min = Math.min(...prices)
                      const max = Math.max(...prices)
                      const hasHot = paid.some((t) => t.is_hot_offer && !!t.hot_offer_ends_at && new Date(t.hot_offer_ends_at) > new Date())
                      return (
                        <div>
                          <SidebarPriceFrom hasHot={hasHot} />
                          <span className={`text-2xl font-bold ${hasHot ? 'text-orange-600' : 'text-gray-900'}`}>{formatCurrency(min, ev.currency)}</span>
                          {max !== min && <span className="text-sm text-gray-500 ml-1">- {formatCurrency(max, ev.currency)}</span>}
                        </div>
                      )
                    })()}
                  </div>
                ) : (
                  <span className="text-2xl font-bold text-gray-900">
                    {ev.is_free ? <EventCoverBadgeFree /> : formatCurrency(ev.price ?? 0, ev.currency)}
                  </span>
                )}
                {ev.capacity && (
                  <SidebarSpotsLeft n={spotsLeft ?? ev.capacity} />
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
                occurrences={occurrences as EventOccurrence[]}
                initialOccurrenceId={(occurrences[0] as EventOccurrence | undefined)?.id ?? null}
                confirmedOccurrenceIds={confirmedOccurrenceIds}
                pendingOccurrenceIds={pendingOccurrenceIds}
                waitlistedOccurrenceIds={waitlistedOccurrenceIds}
              />
            </div>
          )}

          {/* Tip panel — only show if user has booked */}
          {hasConfirmedBooking && ev.organizer_id && (
            <TipPanel eventId={id} organizerId={ev.organizer_id} currency={ev.currency} />
          )}

          {/* Save button */}
          {user && (
            <SaveButton eventId={id} initialSaved={isSaved} size="lg" />
          )}

          {/* Organizer profile link */}
          {ev.organizer_id && (
            <EventViewOrganizerLink organizerId={ev.organizer_id} />
          )}

          {/* Report event */}
          {user && user.id !== ev.organizer_id && (
            <ReportEventButton eventId={id} />
          )}
        </div>

        {/* Comments */}
        <div className="lg:col-span-2">
          <EventCommentsHeading count={comments?.length ?? 0} />
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

function InfoBlock({ icon, labelKey, children }: { icon: string; labelKey: string; children: React.ReactNode }) {
  return (
    <div className="card p-4 flex items-start gap-3">
      <span className="text-xl">{icon}</span>
      <div>
        <InfoBlockLabel labelKey={labelKey} />
        {children}
      </div>
    </div>
  )
}
