import { requireAuth } from '@/lib/auth'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { handleApiError, ok, NotFoundException } from '@/lib/errors'

type Params = { params: Promise<{ transactionId: string }> }

export async function GET(_: Request, { params }: Params) {
  try {
    const ctx = await requireAuth()
    const { transactionId } = await params
    const admin = createSupabaseAdminClient()

    const [{ data: tx, error: txErr }, { data: activeSubscription }] = await Promise.all([
      (admin as any)
        .from('payment_transactions')
        .select('id, status, subscription_plan_id, failure_reason')
        .eq('id', transactionId)
        .eq('user_id', ctx.userId)
        .eq('type', 'subscription')
        .single(),
      admin
        .from('subscriptions')
        .select('id, plan_id, status, current_period_end')
        .eq('user_id', ctx.userId)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])

    if (txErr || !tx) throw new NotFoundException('Subscription payment')

    return ok({
      transaction: tx,
      active_subscription: activeSubscription ?? null,
      activated: tx.status === 'succeeded' && activeSubscription?.plan_id === tx.subscription_plan_id,
    })
  } catch (err) {
    return handleApiError(err)
  }
}
