import { NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/auth'
import { handleApiError, ok } from '@/lib/errors'
import { RegisterDeviceSchema } from '@/lib/validations/notifications'

// POST /api/notifications/register-device
export async function POST(req: NextRequest) {
  try {
    const ctx = await requireAuth()
    const body = await req.json()
    const input = RegisterDeviceSchema.parse(body)

    const supabase = await createSupabaseServerClient()

    // Upsert — re-activate if token already exists for this user
    const { data, error } = await supabase
      .from('device_tokens')
      .upsert(
        {
          user_id: ctx.userId,
          token: input.token,
          platform: input.platform,
          is_active: true,
        },
        { onConflict: 'user_id, token' }
      )
      .select()
      .single()

    if (error) throw error

    return ok(data)
  } catch (err) {
    return handleApiError(err)
  }
}

// DELETE /api/notifications/register-device — deactivate token on logout
export async function DELETE(req: NextRequest) {
  try {
    const ctx = await requireAuth()
    const body = await req.json()
    const { token } = body as { token: string }

    if (!token) {
      return ok({ deactivated: false })
    }

    const supabase = await createSupabaseServerClient()

    const { error } = await supabase
      .from('device_tokens')
      .update({ is_active: false })
      .eq('user_id', ctx.userId)
      .eq('token', token)

    if (error) throw error

    return ok({ deactivated: true })
  } catch (err) {
    return handleApiError(err)
  }
}
