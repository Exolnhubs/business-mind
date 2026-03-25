import { NextRequest } from 'next/server'
import { z } from 'zod'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth'
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

    // Audit log
    await supabase.from('audit_logs').insert({
      admin_id:    ctx.userId,
      action:      input.is_banned ? 'ban_user' : 'unban_user',
      target_type: 'user',
      target_id:   id,
      meta:        { display_name: data.display_name, role: data.role },
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

    // Deleting auth.users cascades to profiles via FK
    const { error } = await adminClient.auth.admin.deleteUser(id)
    if (error) throw error

    return ok({ deleted: true })
  } catch (err) {
    return handleApiError(err)
  }
}
