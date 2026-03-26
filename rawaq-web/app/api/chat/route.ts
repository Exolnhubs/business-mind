import { NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/auth'
import { handleApiError, ok, created } from '@/lib/errors'
import { CreateChatMessageSchema, ListChatSchema } from '@/lib/validations/chat'

// GET /api/chat — cursor-based pagination (newest first)
export async function GET(req: NextRequest) {
  try {
    const params = ListChatSchema.parse(Object.fromEntries(req.nextUrl.searchParams))
    const supabase = await createSupabaseServerClient()

    let query = supabase
      .from('global_chat')
      .select(
        `id, content, created_at, mentions,
         author:profiles!user_id(id, display_name, avatar_url)`
      )
      .eq('is_deleted', false)
      .order('created_at', { ascending: false })
      .limit(params.limit)

    if (params.before) {
      query = query.lt('created_at', params.before)
    }

    const { data, error } = await query
    if (error) throw error

    return ok(data)
  } catch (err) {
    return handleApiError(err)
  }
}

// POST /api/chat
export async function POST(req: NextRequest) {
  try {
    const ctx = await requireAuth()
    const body = await req.json()
    const input = CreateChatMessageSchema.parse(body)

    const supabase = await createSupabaseServerClient()

    const { data, error } = await supabase
      .from('global_chat')
      .insert({
        user_id: ctx.userId,
        content: input.content,
        mentions: input.mentions,
      } as any)
      .select(`id, content, created_at, mentions,
               author:profiles!user_id(id, display_name, avatar_url)`)
      .single()

    if (error) throw error

    return created(data)
  } catch (err) {
    return handleApiError(err)
  }
}
