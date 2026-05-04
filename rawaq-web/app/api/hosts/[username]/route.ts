import { NextRequest } from 'next/server'
import { z } from 'zod'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { handleApiError, ok, NotFoundException } from '@/lib/errors'

type HostOrganizerProfile = {
  bio: string | null
  skills_tags: string[]
  sessions_hosted_count: number
  cancellation_count: number
  avg_rating: number | null
  paid_sessions_enabled: boolean
  organizer_type: 'company' | 'individual'
  status: string
  verified: boolean
  plan_id: string
}

type HostProfileRow = {
  id: string
  display_name: string
  avatar_url: string | null
  organizer_profile: HostOrganizerProfile | HostOrganizerProfile[] | null
}

const UuidSchema = z.string().uuid()

function normalizeHostSegment(value: string): string {
  return decodeURIComponent(value)
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, '-')
}

function getHostOrganizerProfile(profile: HostProfileRow): HostOrganizerProfile | null {
  const organizerProfile = Array.isArray(profile.organizer_profile)
    ? profile.organizer_profile[0]
    : profile.organizer_profile

  if (
    !organizerProfile ||
    organizerProfile.organizer_type !== 'individual' ||
    organizerProfile.status !== 'approved'
  ) {
    return null
  }

  return organizerProfile
}

async function findHostProfile(username: string): Promise<HostProfileRow | null> {
  const supabase = await createSupabaseServerClient()
  const select = `
    id, display_name, avatar_url,
    organizer_profile:organizer_profiles!user_id(
      bio, skills_tags, sessions_hosted_count,
      cancellation_count, avg_rating, paid_sessions_enabled,
      organizer_type, status, verified, plan_id
    )
  `

  if (UuidSchema.safeParse(username).success) {
    const { data, error } = await supabase
      .from('profiles')
      .select(select)
      .eq('id', username)
      .maybeSingle<HostProfileRow>()

    if (error) throw error
    return data ?? null
  }

  const displayName = decodeURIComponent(username).replace(/-/g, ' ').trim()
  const { data, error } = await supabase
    .from('profiles')
    .select(select)
    .ilike('display_name', displayName)
    .limit(25)
    .returns<HostProfileRow[]>()

  if (error) throw error

  const normalizedUsername = normalizeHostSegment(username)
  return (data ?? []).find((profile) =>
    normalizeHostSegment(profile.display_name) === normalizedUsername &&
    getHostOrganizerProfile(profile) !== null
  ) ?? null
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ username: string }> },
) {
  try {
    const { username } = await params
    const profile = await findHostProfile(username)

    if (!profile) throw new NotFoundException('Host')

    const organizerProfile = getHostOrganizerProfile(profile)
    if (!organizerProfile) throw new NotFoundException('Host')

    const supabase = await createSupabaseServerClient()
    const now = new Date().toISOString()
    const { data: sessions, error: sessionsError } = await supabase
      .from('events')
      .select(`
        id, title, title_ar, cover_image_url, start_at, end_at, capacity,
        bookings_count, is_free, price, currency, city,
        category:event_categories(id, name_en, name_ar, icon),
        communities:event_communities(community:communities(id, name, slug))
      `)
      .eq('organizer_id', profile.id)
      .eq('is_published', true)
      .eq('is_cancelled', false)
      .gte('start_at', now)
      .order('start_at', { ascending: true })
      .limit(10)

    if (sessionsError) throw sessionsError

    return ok({
      profile: {
        id: profile.id,
        display_name: profile.display_name,
        avatar_url: profile.avatar_url,
        organizer_profile: organizerProfile,
      },
      sessions: sessions ?? [],
    })
  } catch (err) {
    return handleApiError(err)
  }
}
