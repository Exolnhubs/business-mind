import type { createSupabaseAdminClient } from '@/lib/supabase/admin'
import type { SuggestedCommunity } from '@/types/database'

type Admin = ReturnType<typeof createSupabaseAdminClient>

// Membership statuses that SUPPRESS the join prompt.
// none / 'removed' => suggest (the join route reactivates 'removed' users).
const SUPPRESSING_STATUSES = new Set(['active', 'timed_out', 'banned'])

/**
 * Returns the organizer's host community to suggest to `userId`, or null.
 * The caller is responsible for confirming the booking is in 'confirmed' status.
 * Never throws — resolves to null on any error so it can never block a booking
 * or a confirmation view.
 */
export async function resolveHostCommunitySuggestion(
  admin: Admin,
  organizerId: string,
  userId: string,
): Promise<SuggestedCommunity | null> {
  try {
    const { data: org } = await admin
      .from('organizer_profiles')
      .select('host_community_id, host_community_enabled')
      .eq('user_id', organizerId)
      .maybeSingle()

    if (!org?.host_community_enabled || !org.host_community_id) return null

    const { data: community } = await admin
      .from('communities')
      .select('id, slug, name, name_ar, cover_url, member_count')
      .eq('id', org.host_community_id)
      .maybeSingle()

    if (!community) return null

    const { data: membership } = await admin
      .from('community_memberships')
      .select('status')
      .eq('community_id', community.id)
      .eq('user_id', userId)
      .maybeSingle()

    if (membership && SUPPRESSING_STATUSES.has(membership.status)) return null

    return community as SuggestedCommunity
  } catch {
    return null
  }
}
