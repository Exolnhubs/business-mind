import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/auth'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { handleApiError, ok, BadRequestException, NotFoundException } from '@/lib/errors'
import { requireCommunityManager, writeCommunityAuditLog } from '@/lib/community-governance'

const UpdateHappeningReportSchema = z.object({
  happening_id: z.string().uuid(),
  reporter_id: z.string().uuid(),
  status: z.enum(['pending', 'resolved', 'dismissed']).optional(),
  assigned_to: z.string().uuid().nullable().optional(),
  resolution_note: z.string().trim().max(500).nullable().optional(),
})

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params
    const ctx = await requireAuth()
    const gov = await requireCommunityManager(slug, ctx.userId, ctx.role)
    const admin = createSupabaseAdminClient()
    const status = req.nextUrl.searchParams.get('status')

    let query = (admin as any)
      .from('happening_reports')
      .select('happening_id, reporter_id, community_id, reason, details, status, assigned_to, resolved_by, resolved_at, resolution_note, created_at')
      .eq('community_id', gov.community.id)
      .order('created_at', { ascending: false })

    if (status && ['pending', 'resolved', 'dismissed'].includes(status)) {
      query = query.eq('status', status)
    }

    const { data: reports, error } = await query
    if (error) throw error

    const happeningIds = [...new Set((reports ?? []).map((r: { happening_id: string }) => r.happening_id))]
    const reporterIds = [...new Set((reports ?? []).map((r: { reporter_id: string; assigned_to: string | null; resolved_by: string | null }) => [r.reporter_id, r.assigned_to, r.resolved_by]).flat().filter(Boolean))] as string[]

    const { data: happenings } = happeningIds.length === 0
      ? { data: [] as Array<{ id: string; body: string; author_id: string; created_at: string }> }
      : await (admin as any)
          .from('happenings')
          .select('id, body, author_id, created_at')
          .in('id', happeningIds)

    const allProfileIds = [...new Set([
      ...reporterIds,
      ...((happenings ?? []).map((h: { author_id: string }) => h.author_id)),
    ])]

    const { data: profiles } = allProfileIds.length === 0
      ? { data: [] as Array<{ id: string; display_name: string; avatar_url: string | null }> }
      : await admin
          .from('profiles')
          .select('id, display_name, avatar_url')
          .in('id', allProfileIds)

    const happeningById = new Map((happenings ?? []).map((h: { id: string }) => [h.id, h]))
    const profileById = new Map((profiles ?? []).map((p) => [p.id, p]))

    const data = (reports ?? []).map((report: {
      happening_id: string
      reporter_id: string
      community_id: string | null
      reason: string
      details: string | null
      status: string
      assigned_to: string | null
      resolved_by: string | null
      resolved_at: string | null
      resolution_note: string | null
      created_at: string
    }) => {
      const happening = happeningById.get(report.happening_id)
      return {
        ...report,
        happening: happening
          ? {
              ...happening,
              author: profileById.get(happening.author_id) ?? null,
            }
          : null,
        reporter: profileById.get(report.reporter_id) ?? null,
        assignee: report.assigned_to ? profileById.get(report.assigned_to) ?? null : null,
        resolver: report.resolved_by ? profileById.get(report.resolved_by) ?? null : null,
      }
    })

    return ok({ reports: data })
  } catch (err) {
    return handleApiError(err)
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params
    const input = UpdateHappeningReportSchema.parse(await req.json())
    const ctx = await requireAuth()
    const gov = await requireCommunityManager(slug, ctx.userId, ctx.role)
    const admin = createSupabaseAdminClient()

    const { data: report, error } = await (admin as any)
      .from('happening_reports')
      .select('happening_id, reporter_id, community_id, status')
      .eq('community_id', gov.community.id)
      .eq('happening_id', input.happening_id)
      .eq('reporter_id', input.reporter_id)
      .maybeSingle()

    if (error) throw error
    if (!report) throw new NotFoundException('Happening report')

    if (input.status === 'pending' && !input.assigned_to && !('resolution_note' in input)) {
      throw new BadRequestException('Pending updates must assign the report or include another change')
    }

    const nextStatus = input.status ?? report.status
    const updatePayload: Record<string, unknown> = {}

    if ('assigned_to' in input) updatePayload.assigned_to = input.assigned_to
    if ('resolution_note' in input) updatePayload.resolution_note = input.resolution_note
    if (input.status) updatePayload.status = input.status

    if (nextStatus === 'resolved' || nextStatus === 'dismissed') {
      updatePayload.resolved_by = ctx.userId
      updatePayload.resolved_at = new Date().toISOString()
    } else if (nextStatus === 'pending') {
      updatePayload.resolved_by = null
      updatePayload.resolved_at = null
    }

    const { error: updateErr } = await (admin as any)
      .from('happening_reports')
      .update(updatePayload)
      .eq('community_id', gov.community.id)
      .eq('happening_id', input.happening_id)
      .eq('reporter_id', input.reporter_id)

    if (updateErr) throw updateErr

    if (input.status === 'resolved' || input.status === 'dismissed') {
      await writeCommunityAuditLog({
        community_id: gov.community.id,
        actor_user_id: ctx.userId,
        action: input.status === 'resolved' ? 'resolve_happening_report' : 'dismiss_happening_report',
        target_type: 'happening_report',
        target_id: input.happening_id,
        meta: {
          reporter_id: input.reporter_id,
          resolution_note: input.resolution_note ?? null,
        },
      })
    }

    return ok({ updated: true })
  } catch (err) {
    return handleApiError(err)
  }
}
