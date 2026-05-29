import { NextRequest } from 'next/server'
import { z } from 'zod'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth'
import { delCachedProfile } from '@/lib/supabase/profile-cache'
import { logAdminAction } from '@/lib/audit'
import { handleApiError, ok, NotFoundException, ForbiddenException } from '@/lib/errors'

const BanSchema = z.object({
  is_banned: z.boolean(),
})

// PATCH /api/admin/users/:id — ban or unban a user
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const ctx = await requireAdmin()
    const body = await req.json()
    const input = BanSchema.parse(body)

    if (id === ctx.userId) {
      throw new ForbiddenException('Cannot ban yourself')
    }

    const supabase = await createSupabaseServerClient()

    const { data: profile } = await supabase
      .from('profiles')
      .select('id, role')
      .eq('id', id)
      .single()

    if (!profile) throw new NotFoundException('User')
    if (profile.role === 'admin') throw new ForbiddenException('Cannot ban another admin')

    const { data, error } = await supabase
      .from('profiles')
      .update({ is_banned: input.is_banned })
      .eq('id', id)
      .select('id, display_name, role, is_banned')
      .single()

    if (error) throw error

    await delCachedProfile(id)

    // Audit log — fails loud (throws on insert failure)
    await logAdminAction({
      adminId:    ctx.userId,
      action:     input.is_banned ? 'ban_user' : 'unban_user',
      targetType: 'user',
      targetId:   id,
      meta:       { display_name: data.display_name, role: data.role },
    })

    return ok(data)
  } catch (err) {
    return handleApiError(err)
  }
}

// DELETE /api/admin/users/:id — hard delete (admin only)
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const ctx = await requireAdmin()

    if (id === ctx.userId) {
      throw new ForbiddenException('Cannot delete yourself')
    }

    // Supabase auth deletion requires service role — handled via admin client
    const { createSupabaseAdminClient } = await import('@/lib/supabase/admin')
    const adminClient = createSupabaseAdminClient()

    // Capture identifying info BEFORE deletion so the audit log can reference it.
    const { data: targetProfile } = await adminClient
      .from('profiles')
      .select('id, display_name, role')
      .eq('id', id)
      .maybeSingle()

    // Deleting auth.users cascades to profiles via FK
    const { error } = await adminClient.auth.admin.deleteUser(id)
    if (error) throw error

    await delCachedProfile(id)

    // Audit log AFTER successful deletion — this is the highest-blast-radius
    // admin action so we record it loudly.
    await logAdminAction({
      adminId:    ctx.userId,
      action:     'delete_user',
      targetType: 'user',
      targetId:   id,
      meta:       {
        display_name: targetProfile?.display_name ?? null,
        role:         targetProfile?.role ?? null,
      },
    })

    return ok({ deleted: true })
  } catch (err) {
    return handleApiError(err)
  }
}
