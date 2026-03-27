import { NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { requireAuth, requireEventOwnership, optionalAuth } from '@/lib/auth'
import { handleApiError, ok, NotFoundException, ForbiddenException } from '@/lib/errors'
import { UpdateEventSchema } from '@/lib/validations/events'
import { sendNotifications } from '@/lib/notifications'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'

// GET /api/events/:id
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createSupabaseServerClient()
    const ctx = await optionalAuth()

    const { data, error } = await supabase
      .from('events')
      .select(
        `*,
         organizer:profiles!organizer_id(
           id, display_name, avatar_url,
           organizer_profile:organizer_profiles!user_id(business_name, business_name_ar, logo_url, verified, description, description_ar)
         ),
         category:event_categories(id, name_en, name_ar, icon)`
      )
      .eq('id', id)
      .single()

    if (error || !data) throw new NotFoundException('Event')

    // Private events: only organizer or admin can view
    if (data.is_private && (!ctx || (ctx.userId !== data.organizer_id && ctx.role !== 'admin'))) {
      throw new NotFoundException('Event')
    }

    // Track view (fire and forget)
    const adminClient = createSupabaseAdminClient()
    const ipHash = req.headers.get('x-forwarded-for') ?? ''
    void adminClient.from('event_views').insert({
      event_id: id,
      user_id: ctx?.userId ?? null,
      ip_hash: ipHash ? btoa(ipHash).slice(0, 32) : null,
    } as any).then(() => {}, () => {})

    return ok(data)
  } catch (err) {
    return handleApiError(err)
  }
}

// PATCH /api/events/:id
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const ctx = await requireAuth()
    await requireEventOwnership(id, ctx)

    const body = await req.json()
    const input = UpdateEventSchema.parse(body)

    const supabase = await createSupabaseServerClient()
    const adminClient = createSupabaseAdminClient()

    // Fetch current event state before updating (for change detection)
    const { data: before } = await supabase
      .from('events')
      .select('title, start_at, end_at, venue_name, address, city, is_published, is_cancelled, organizer_id')
      .eq('id', id)
      .single()

    const { data, error } = await supabase
      .from('events')
      .update(input)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    const eventTitle = data?.title ?? before?.title ?? ''

    // ── Notify attendees: event cancelled ──────────────────────────────────
    if (input.is_cancelled === true && !before?.is_cancelled) {
      const { data: bookings } = await adminClient
        .from('bookings')
        .select('user_id')
        .eq('event_id', id)
        .eq('status', 'confirmed')

      if (bookings?.length) {
        await sendNotifications(
          bookings.map((b) => ({
            userId: b.user_id,
            type: 'event_cancelled' as const,
            payload: { event_id: id, event_title: eventTitle },
          }))
        )
      }
    }

    // ── Notify attendees: significant event details changed ────────────────
    const significantFields = ['start_at', 'end_at', 'venue_name', 'address', 'city'] as const
    const wasUpdated = significantFields.some(
      (f) => input[f] !== undefined && input[f] !== (before as Record<string, unknown>)?.[f]
    )
    if (wasUpdated && !input.is_cancelled && before?.is_published) {
      const { data: bookings } = await adminClient
        .from('bookings')
        .select('user_id')
        .eq('event_id', id)
        .eq('status', 'confirmed')

      if (bookings?.length) {
        sendNotifications(
          bookings.map((b) => ({
            userId: b.user_id,
            type: 'event_updated' as const,
            payload: { event_id: id, event_title: eventTitle },
          }))
        ).catch(() => {})
      }
    }

    // ── Notify followers: new event published ──────────────────────────────
    if (input.is_published === true && !before?.is_published) {
      const organizerId = before?.organizer_id ?? ctx.userId
      const { data: follows } = await adminClient
        .from('organizer_follows')
        .select('follower_id')
        .eq('organizer_id', organizerId)

      if (follows?.length) {
        const { data: orgProfile } = await adminClient
          .from('profiles')
          .select('display_name')
          .eq('id', organizerId)
          .single()

        sendNotifications(
          follows.map((f) => ({
            userId: f.follower_id,
            type: 'new_event_published' as const,
            payload: {
              event_id: id,
              event_title: eventTitle,
              organizer_id: organizerId,
              organizer_name: orgProfile?.display_name ?? 'An organizer you follow',
            },
          }))
        ).catch(() => {})
      }
    }

    return ok(data)
  } catch (err) {
    return handleApiError(err)
  }
}

// DELETE /api/events/:id
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const ctx = await requireAuth()
    await requireEventOwnership(id, ctx)

    const supabase = await createSupabaseServerClient()

    // Check for confirmed bookings — soft-cancel instead of hard delete
    const { count } = await supabase
      .from('bookings')
      .select('id', { count: 'exact', head: true })
      .eq('event_id', id)
      .eq('status', 'confirmed')

    if (count && count > 0) {
      throw new ForbiddenException(
        'Cannot delete an event with active bookings. Cancel it instead.'
      )
    }

    const { error } = await supabase.from('events').delete().eq('id', id)
    if (error) throw error

    return ok({ deleted: true })
  } catch (err) {
    return handleApiError(err)
  }
}
