// Supabase Edge Function: cleanup-happenings
// Deletes happenings that expired more than 1 hour ago.
// Deploy once, then schedule via Supabase Dashboard:
//   Cron: "*/15 * * * *" (every 15 minutes)
//   Or via pg_cron: SELECT cron.schedule('cleanup-happenings', '*/15 * * * *', $$SELECT fn_cleanup_expired_happenings()$$);
//
// To deploy: supabase functions deploy cleanup-happenings

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

Deno.serve(async (req: Request) => {
  // Validate cron secret to prevent unauthorized invocations
  const authHeader = req.headers.get('Authorization')
  const cronSecret = Deno.env.get('CRON_SECRET')
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  const { error, count } = await supabase
    .from('happenings')
    .delete({ count: 'exact' })
    .lt('expires_at', new Date(Date.now() - 60 * 60 * 1000).toISOString()) // expired > 1h ago

  if (error) {
    console.error('[cleanup-happenings] Error:', error.message)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  console.log(`[cleanup-happenings] Deleted ${count ?? 0} expired happenings`)
  return new Response(JSON.stringify({ deleted: count ?? 0 }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
