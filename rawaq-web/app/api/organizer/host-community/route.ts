import { requireAuth } from '@/lib/auth'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { handleApiError, ok, ForbiddenException, NotFoundException } from '@/lib/errors'
import { checkRateLimit, limiters } from '@/lib/rate-limit'

type Admin = ReturnType<typeof createSupabaseAdminClient>

async function loadOrganizer(admin: Admin, userId: string) {
  const { data } = await admin
    .from('organizer_profiles')
    .select('user_id, status, business_name, business_name_ar, host_community_id, host_community_enabled')
    .eq('user_id', userId)
    .maybeSingle()
  return data
}

async function summary(admin: Admin, communityId: string | null) {
  if (!communityId) return null
  const { data } = await admin
    .from('communities')
    .select('id, slug, name, name_ar, cover_url, member_count')
    .eq('id', communityId)
    .maybeSingle()
  return data ?? null
}

export async function GET() {
  try {
    const ctx = await requireAuth()
    const admin = createSupabaseAdminClient()
    const org = await loadOrganizer(admin, ctx.userId)
    if (!org) throw new NotFoundException('Organizer profile')
    return ok({
      enabled: org.host_community_enabled,
      community: await summary(admin, org.host_community_id),
    })
  } catch (err) {
    return handleApiError(err)
  }
}

export async function POST() {
  try {
    const ctx = await requireAuth()
    const admin = createSupabaseAdminClient()
    const org = await loadOrganizer(admin, ctx.userId)
    if (!org) throw new NotFoundException('Organizer profile')
    if (org.status !== 'approved') {
      throw new ForbiddenException('Only approved organizers can create a host community')
    }
    await checkRateLimit(limiters.communityCreate, ctx.userId)

    const name = `${org.business_name} Community`
    const nameAr = org.business_name_ar ? `مجتمع ${org.business_name_ar}` : null

    const { data: newId, error } = await admin.rpc('ensure_host_community', {
      p_owner: ctx.userId,
      p_name: name,
      p_name_ar: nameAr,
      p_country: 'SA',
    })
    if (error) throw error

    return ok({ enabled: true, community: await summary(admin, newId as string) })
  } catch (err) {
    return handleApiError(err)
  }
}

export async function PATCH() {
  try {
    const ctx = await requireAuth()
    const admin = createSupabaseAdminClient()
    const org = await loadOrganizer(admin, ctx.userId)
    if (!org) throw new NotFoundException('Organizer profile')

    const { error } = await admin
      .from('organizer_profiles')
      .update({ host_community_enabled: false })
      .eq('user_id', ctx.userId)
    if (error) throw error

    return ok({ enabled: false, community: await summary(admin, org.host_community_id) })
  } catch (err) {
    return handleApiError(err)
  }
}
