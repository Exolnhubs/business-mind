import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { Badge } from '@/components/ui/Badge'
import { BookingFlow } from '@/components/events/BookingFlow'
import { SaveButton } from '@/components/events/SaveButton'
import { TipPanel } from '@/components/events/TipPanel'
import { ReportEventButton } from '@/components/events/ReportEventButton'
import { CommentThread } from '@/components/comments/CommentThread'
import { MobileStickyBookingBar } from '@/components/events/MobileStickyBookingBar'
import { formatCurrency, formatDate, formatTime } from '@/lib/utils'
import type { Community, EventOccurrence, EventWithOrganizer, CommentWithAuthor, TicketType } from '@/types/database'
import { applyResolvedEventWindow } from '@/lib/events/recurrence'
import { getBookableOccurrences, listEventOccurrences } from '@/lib/events/occurrences'
import {
  EventAboutHeading,
  EventAttendingCount,
  EventBadgeCancelled,
  EventBadgeFamilyFriendly,
  EventBadgeMenOnly,
  EventBadgeWomenOnly,
  EventCapacityRow,
  EventCategoryName,
  EventCommentsHeading,
  EventCommunityChip,
  EventCoverBadgeFree,
  EventFreeLabel,
  EventOrganizerName,
  EventOrganizerRole,
  EventVenueName,
  EventViewOrganizerLink,
  SidebarPriceFrom,
  SidebarSpotsLeft,
} from '@/components/events/EventDetailStrings'

function getEffectivePrice(tt: TicketType): number {
  if (
    tt.is_hot_offer &&
    tt.hot_offer_price != null &&
    tt.hot_offer_ends_at &&
    new Date(tt.hot_offer_ends_at) > new Date()
  ) {
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

  const { data: event } = await supabase
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
        .from('bookings')
        .select('id, occurrence_id, status')
        .eq('event_id', id)
        .eq('user_id', user.id)
        .in('status', ['confirmed', 'pending']),
      supabase
        .from('saved_events')
        .select('event_id')
        .eq('user_id', user.id)
        .eq('event_id', id)
        .single(),
      supabase
        .from('waitlist')
        .select('occurrence_id')
        .eq('event_id', id)
        .eq('user_id', user.id)
        .eq('status', 'waiting'),
    ])

    const confirmedBookings = (bookingRows ?? []).filter((booking) => booking.status === 'confirmed')
    confirmedOccurrenceIds = confirmedBookings.map((booking) => booking.occurrence_id).filter(Boolean)
    pendingOccurrenceIds = (bookingRows ?? [])
      .filter((booking) => booking.status === 'pending')
      .map((booking) => booking.occurrence_id)
      .filter(Boolean)
    waitlistedOccurrenceIds = (waitlistRows ?? []).map((row) => row.occurrence_id).filter(Boolean)
    hasConfirmedBooking = confirmedBookings.length > 0
    isBooked = isRecurring ? false : confirmedBookings.length > 0
    isSaved = !!save
    isOnWaitlist = isRecurring ? false : waitlistedOccurrenceIds.length > 0
  }

  const { data: ticketTypes } = await supabase
    .from('ticket_types')
    .select('*')
    .eq('event_id', id)
    .eq('is_active', true)
    .order('sort_order')

  const tts = (ticketTypes ?? []) as TicketType[]
  const paidTts = tts.filter((tt) => tt.is_active && !tt.is_free)

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

  const stickyPriceLabel = (() => {
    if (ev.is_free || (tts.length > 0 && paidTts.length === 0)) return 'Free'
    if (paidTts.length > 0) {
      return formatCurrency(Math.min(...paidTts.map(getEffectivePrice)), ev.currency)
    }
    return formatCurrency(ev.price ?? 0, ev.currency)
  })()

  const organizerName = ev.organizer?.organizer_profile?.business_name
    ?? ev.organizer?.organizer_profile?.business_name_ar
    ?? ev.organizer?.display_name
    ?? null

  return (
    <>
      <MobileStickyBookingBar
        priceLabel={stickyPriceLabel}
        disabled={isFull && !isOnWaitlist}
        isBooked={isBooked || hasConfirmedBooking}
        isCancelled={ev.is_cancelled}
        sentinelId="booking-panel-sentinel"
      />

      <section
        className="relative w-full overflow-hidden"
        style={{ minHeight: 'min(52vh, 480px)', background: 'var(--c-ink)' }}
      >
        {ev.cover_image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={ev.cover_image_url}
            alt={ev.title}
            className="absolute inset-0 h-full w-full object-cover"
            style={{ opacity: 0.55 }}
          />
        ) : (
          <div
            className="absolute inset-0"
            style={{
              background: 'linear-gradient(135deg, oklch(0.20 0.045 68) 0%, oklch(0.14 0.030 58) 100%)',
            }}
          />
        )}

        <div
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage: [
              'linear-gradient(45deg, oklch(1 0 0 / 0.03) 1px, transparent 1px)',
              'linear-gradient(-45deg, oklch(1 0 0 / 0.03) 1px, transparent 1px)',
            ].join(', '),
            backgroundSize: '32px 32px',
          }}
        />
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-48"
          style={{ background: 'linear-gradient(to bottom, transparent, oklch(0.97 0.012 78 / 0.95))' }}
        />

        <div
          className="relative z-10 mx-auto flex h-full w-full max-w-7xl flex-col justify-end px-6 pb-10"
          style={{ minHeight: 'min(52vh, 480px)' }}
        >
          {ev.category && (
            <div className="mb-3">
              <EventCategoryName
                nameEn={ev.category.name_en}
                nameAr={ev.category.name_ar}
                icon={ev.category.icon}
              />
            </div>
          )}

          <h1
            className="mb-4 max-w-[36ch] text-3xl font-black leading-tight text-[oklch(0.97_0.012_78)] sm:text-4xl lg:text-5xl"
            style={{
              fontFamily: 'var(--font-display)',
              textShadow: '0 2px 16px oklch(0 0 0 / 0.5)',
            }}
          >
            {ev.title}
          </h1>

          <div className="flex flex-wrap gap-2">
            {(ev.is_free || (tts.length > 0 && paidTts.length === 0)) && (
              <Badge variant="green"><EventCoverBadgeFree /></Badge>
            )}
            {ev.is_family_friendly && (
              <Badge variant="blue"><EventBadgeFamilyFriendly /></Badge>
            )}
            {ev.gender_restriction !== 'mixed' && (
              <Badge variant="yellow">
                {ev.gender_restriction === 'male' ? <EventBadgeMenOnly /> : <EventBadgeWomenOnly />}
              </Badge>
            )}
            {ev.is_cancelled && <Badge variant="red"><EventBadgeCancelled /></Badge>}
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
        </div>
      </section>

      <main style={{ background: 'var(--c-muted)', paddingBottom: '5rem' }}>
        <div className="mx-auto grid max-w-7xl grid-cols-1 gap-8 px-6 pt-10 lg:grid-cols-3">
          <div className="space-y-8 lg:col-span-2">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <InfoStrip
                label="Date & Time"
                primary={formatDate(ev.start_at)}
                secondary={`${formatTime(ev.start_at)}${ev.end_at ? ` - ${formatTime(ev.end_at)}` : ''}`}
                icon={
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
                    <rect x="2.5" y="3.5" width="15" height="14" rx="2" stroke="currentColor" strokeWidth="1.5" />
                    <path d="M2.5 8h15" stroke="currentColor" strokeWidth="1.5" />
                    <path d="M6.5 2v3M13.5 2v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                }
              />
              <InfoStrip
                label="Location"
                primary={<EventVenueName name={ev.venue_name} />}
                secondary={`${ev.address ? `${ev.address}, ` : ''}${ev.city}${ev.country ? `, ${ev.country}` : ''}`}
                icon={
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
                    <path d="M10 2C7.24 2 5 4.24 5 7c0 4.25 5 11 5 11s5-6.75 5-11c0-2.76-2.24-5-5-5Z" stroke="currentColor" strokeWidth="1.5" />
                    <circle cx="10" cy="7" r="1.75" stroke="currentColor" strokeWidth="1.5" />
                  </svg>
                }
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <InfoStrip
                label="Attendees"
                primary={<EventAttendingCount count={ev.bookings_count} />}
                secondary={
                  ev.capacity
                    ? <EventCapacityRow spotsLeft={spotsLeft ?? 0} capacity={ev.capacity} isFull={isFull} />
                    : null
                }
                icon={
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
                    <circle cx="8" cy="7" r="3" stroke="currentColor" strokeWidth="1.5" />
                    <path d="M2 17c0-3.314 2.686-5 6-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    <circle cx="14" cy="9" r="2.25" stroke="currentColor" strokeWidth="1.5" />
                    <path d="M11.5 17c0-2.485 1.343-3.75 3-3.75s3 1.265 3 3.75" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                }
              />
              <InfoStrip
                label="Price"
                primary={
                  tts.length > 0 ? (
                    <div className="space-y-0.5">
                      {tts.map((tt) => {
                        const effective = getEffectivePrice(tt)
                        const hotActive = tt.is_hot_offer && tt.hot_offer_price != null
                          && !!tt.hot_offer_ends_at && new Date(tt.hot_offer_ends_at) > new Date()
                        return (
                          <p key={tt.id} className="flex items-center gap-1.5 text-sm font-medium">
                            <span className="text-gray-500">{tt.name}:</span>
                            {tt.is_free ? <EventFreeLabel /> : hotActive ? (
                              <>
                                <span className="text-xs text-gray-400 line-through">{formatCurrency(tt.price, ev.currency)}</span>
                                <span className="font-semibold text-orange-600">{formatCurrency(effective, ev.currency)}</span>
                              </>
                            ) : (
                              <span className="font-semibold" style={{ color: 'var(--c-gold-dim)' }}>
                                {formatCurrency(effective, ev.currency)}
                              </span>
                            )}
                          </p>
                        )
                      })}
                    </div>
                  ) : (
                    <p className="text-sm font-medium">
                      {ev.is_free ? <EventFreeLabel /> : (
                        <span style={{ color: 'var(--c-gold-dim)' }}>{formatCurrency(ev.price ?? 0, ev.currency)}</span>
                      )}
                    </p>
                  )
                }
                secondary={null}
                icon={
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
                    <circle cx="10" cy="10" r="7.5" stroke="currentColor" strokeWidth="1.5" />
                    <path d="M10 6.5v1M10 12.5v1M7.5 10c0-1.105.895-2 2-2h1a1.5 1.5 0 0 1 0 3h-1a1.5 1.5 0 0 0 0 3h1c1.105 0 2-.895 2-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                }
              />
            </div>

            {spotsLeft !== null && spotsLeft > 0 && spotsLeft <= 20 && !isFull && (
              <div
                className="flex items-center gap-3 rounded-2xl px-4 py-3"
                style={{
                  background: 'oklch(0.78 0.18 72 / 0.08)',
                  border: '1px solid oklch(0.78 0.18 72 / 0.22)',
                }}
              >
                <p className="text-sm font-semibold" style={{ color: 'var(--c-gold-dim)' }}>
                  Only {spotsLeft} {spotsLeft === 1 ? 'spot' : 'spots'} left. Book before it fills up.
                </p>
              </div>
            )}

            {ev.description && (
              <section>
                <EventAboutHeading />
                <p className="max-w-[68ch] whitespace-pre-line text-sm leading-relaxed text-gray-600">
                  {ev.description}
                </p>
              </section>
            )}

            <section
              className="flex items-center gap-4 rounded-2xl p-5"
              style={{ background: 'white', border: '1px solid oklch(0.92 0.010 78)' }}
            >
              <div
                className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl text-xl font-bold"
                style={{ background: 'oklch(0.78 0.18 72 / 0.10)', color: 'var(--c-gold-dim)' }}
              >
                {ev.organizer?.organizer_profile?.logo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={ev.organizer.organizer_profile.logo_url}
                    alt=""
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 800 }}>
                    {(organizerName ?? '?')[0].toUpperCase()}
                  </span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p
                  className="mb-0.5 text-[10px] font-bold uppercase tracking-[0.16em]"
                  style={{ color: 'var(--c-gold)', fontFamily: 'var(--font-display)' }}
                >
                  Organized by
                </p>
                <div className="flex flex-wrap items-center gap-1.5">
                  <EventOrganizerName
                    businessName={ev.organizer?.organizer_profile?.business_name ?? null}
                    businessNameAr={ev.organizer?.organizer_profile?.business_name_ar ?? null}
                    displayName={ev.organizer?.display_name ?? null}
                  />
                  {ev.organizer?.organizer_profile?.verified && (
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-label="Verified" role="img">
                      <circle cx="8" cy="8" r="7" fill="oklch(0.55 0.15 250)" />
                      <path d="M5 8l2 2 4-4" stroke="white" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </div>
                <EventOrganizerRole />
              </div>
            </section>
          </div>

          <aside className="space-y-4 self-start lg:sticky lg:top-24">
            <div id="booking-panel-sentinel" aria-hidden />

            {!ev.is_cancelled && (
              <div
                id="booking-panel"
                className="space-y-4 rounded-2xl p-5"
                style={{ background: 'white', border: '1px solid oklch(0.92 0.010 78)' }}
              >
                <div className="flex items-end justify-between gap-3">
                  <div>
                    {tts.length > 0 ? (
                      paidTts.length === 0 ? (
                        <span
                          className="text-2xl font-black"
                          style={{ fontFamily: 'var(--font-display)', color: '#16a34a' }}
                        >
                          <EventCoverBadgeFree />
                        </span>
                      ) : (
                        <div>
                          <SidebarPriceFrom
                            hasHot={paidTts.some((tt) =>
                              tt.is_hot_offer &&
                              !!tt.hot_offer_ends_at &&
                              new Date(tt.hot_offer_ends_at) > new Date()
                            )}
                          />
                          <span
                            className="text-2xl font-black"
                            style={{ fontFamily: 'var(--font-display)', color: 'var(--c-gold-dim)' }}
                          >
                            {formatCurrency(Math.min(...paidTts.map(getEffectivePrice)), ev.currency)}
                          </span>
                          {Math.max(...paidTts.map(getEffectivePrice)) !== Math.min(...paidTts.map(getEffectivePrice)) && (
                            <span className="ms-1.5 text-sm text-gray-400">
                              - {formatCurrency(Math.max(...paidTts.map(getEffectivePrice)), ev.currency)}
                            </span>
                          )}
                        </div>
                      )
                    ) : (
                      <span
                        className="text-2xl font-black"
                        style={{ fontFamily: 'var(--font-display)', color: 'var(--c-gold-dim)' }}
                      >
                        {ev.is_free ? <EventCoverBadgeFree /> : formatCurrency(ev.price ?? 0, ev.currency)}
                      </span>
                    )}
                  </div>
                  {ev.capacity && spotsLeft !== null && <SidebarSpotsLeft n={spotsLeft} />}
                </div>

                <div style={{ height: 1, background: 'oklch(0.92 0.010 78)' }} />

                <BookingFlow
                  eventId={id}
                  isFull={isFull}
                  isBooked={isBooked}
                  isFree={ev.is_free}
                  eventPrice={ev.price}
                  currency={ev.currency}
                  ticketTypes={tts}
                  isOnWaitlist={isOnWaitlist}
                  occurrences={occurrences as EventOccurrence[]}
                  initialOccurrenceId={(occurrences[0] as EventOccurrence | undefined)?.id ?? null}
                  confirmedOccurrenceIds={confirmedOccurrenceIds}
                  pendingOccurrenceIds={pendingOccurrenceIds}
                  waitlistedOccurrenceIds={waitlistedOccurrenceIds}
                />
              </div>
            )}

            {hasConfirmedBooking && ev.organizer_id && (
              <TipPanel eventId={id} organizerId={ev.organizer_id} currency={ev.currency} />
            )}
            {user && <SaveButton eventId={id} initialSaved={isSaved} size="lg" />}
            {ev.organizer_id && <EventViewOrganizerLink organizerId={ev.organizer_id} />}
            {user && user.id !== ev.organizer_id && <ReportEventButton eventId={id} />}
          </aside>

          <section className="lg:col-span-2">
            <EventCommentsHeading count={comments?.length ?? 0} />
            <CommentThread
              eventId={id}
              initialComments={(comments ?? []) as unknown as CommentWithAuthor[]}
              currentUserId={user?.id ?? null}
            />
          </section>
        </div>
      </main>
    </>
  )
}

function InfoStrip({
  label,
  primary,
  secondary,
  icon,
}: {
  label: string
  primary: ReactNode
  secondary: ReactNode
  icon: ReactNode
}) {
  return (
    <div
      className="flex items-start gap-3 rounded-2xl px-4 py-3.5"
      style={{ background: 'white', border: '1px solid oklch(0.92 0.010 78)' }}
    >
      <div
        className="mt-0.5 shrink-0 rounded-lg p-1.5"
        style={{ background: 'oklch(0.78 0.18 72 / 0.08)', color: 'var(--c-gold-dim)' }}
      >
        {icon}
      </div>
      <div className="min-w-0">
        <p
          className="mb-0.5 text-[10px] font-bold uppercase tracking-[0.16em]"
          style={{ fontFamily: 'var(--font-display)', color: 'var(--c-gold)' }}
        >
          {label}
        </p>
        <div className="text-sm font-semibold text-gray-900">{primary}</div>
        {secondary && <div className="mt-0.5 text-xs text-gray-500">{secondary}</div>}
      </div>
    </div>
  )
}
