import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export default async function OrganizerLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, is_banned')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'organizer') {
    redirect('/events')
  }

  // Banned account — hard block
  if (profile.is_banned) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <div className="text-5xl mb-4">🚫</div>
        <h1 className="text-xl font-bold text-gray-900 mb-2">Account Banned</h1>
        <p className="text-gray-500 text-sm">
          Your account has been suspended. Please contact support if you believe this is a mistake.
        </p>
      </div>
    )
  }

  // Check organizer approval status
  const { data: orgProfile } = await supabase
    .from('organizer_profiles')
    .select('status, suspend_reason')
    .eq('user_id', user.id)
    .single()

  if (!orgProfile || orgProfile.status === 'pending') {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <div className="text-5xl mb-4">⏳</div>
        <h1 className="text-xl font-bold text-gray-900 mb-2">Pending Approval</h1>
        <p className="text-gray-500 text-sm">
          Your organizer account is under review. You&apos;ll get access once an admin approves it.
        </p>
      </div>
    )
  }

  if (orgProfile.status === 'rejected') {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <div className="text-5xl mb-4">❌</div>
        <h1 className="text-xl font-bold text-gray-900 mb-2">Application Rejected</h1>
        <p className="text-gray-500 text-sm">
          Your organizer application was not approved. Contact support for more information.
        </p>
      </div>
    )
  }

  if (orgProfile.status === 'suspended') {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <div className="text-5xl mb-4">⛔</div>
        <h1 className="text-xl font-bold text-gray-900 mb-2">Account Suspended</h1>
        <p className="text-gray-500 text-sm">
          Your organizer account has been suspended and you cannot access the dashboard.
          {orgProfile.suspend_reason && (
            <span className="block mt-2 font-medium text-gray-700">Reason: {orgProfile.suspend_reason}</span>
          )}
        </p>
        <p className="text-xs text-gray-400 mt-3">Contact support if you think this is an error.</p>
      </div>
    )
  }

  // status === 'approved'
  return <>{children}</>
}
