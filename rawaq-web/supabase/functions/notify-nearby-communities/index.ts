import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

type CommunityInsertPayload = {
  record?: {
    id: string
    name: string
    slug: string
    city: string | null
    level: string
    owner_user_id: string | null
  }
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const authHeader = req.headers.get('Authorization')
  const webhookSecret = Deno.env.get('SUPABASE_WEBHOOK_SECRET')
  if (webhookSecret && authHeader !== `Bearer ${webhookSecret}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  const payload = await req.json().catch(() => null) as CommunityInsertPayload | null
  const community = payload?.record

  if (!community?.id || !community.city) {
    return new Response(JSON.stringify({ delivered: 0, skipped: true }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const { data: localProfiles, error: profilesError } = await supabase
    .from('profiles')
    .select('id')
    .ilike('city', community.city)
    .limit(200)

  if (profilesError) {
    console.error('[notify-nearby-communities] profile lookup failed', profilesError.message)
    return new Response(JSON.stringify({ error: profilesError.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const localUserIds = (localProfiles ?? [])
    .map((profile) => profile.id)
    .filter((id) => id !== community.owner_user_id)

  if (localUserIds.length === 0) {
    return new Response(JSON.stringify({ delivered: 0, skipped: true }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const { data: tokens, error: tokensError } = await supabase
    .from('device_tokens')
    .select('token')
    .in('user_id', localUserIds)
    .eq('is_active', true)

  if (tokensError) {
    console.error('[notify-nearby-communities] token lookup failed', tokensError.message)
    return new Response(JSON.stringify({ error: tokensError.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  if (!tokens?.length) {
    return new Response(JSON.stringify({ delivered: 0, skipped: true }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const messages = tokens.map((entry) => ({
    to: entry.token,
    title: 'New community nearby',
    body: `A new ${community.level} community was created in ${community.city}: ${community.name}`,
    sound: 'default',
    data: {
      type: 'community_nearby',
      community_id: community.id,
      community_slug: community.slug,
      city: community.city,
    },
    priority: 'high',
    channelId: 'default',
  }))

  for (let i = 0; i < messages.length; i += 100) {
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(messages.slice(i, i + 100)),
    })
  }

  return new Response(JSON.stringify({ delivered: messages.length }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
