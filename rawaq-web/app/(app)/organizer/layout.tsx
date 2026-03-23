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

  if (!profile || profile.is_banned || profile.role !== 'organizer') {
    redirect('/events')
  }

  // Check organizer approval status
  const { data: orgProfile } = await supabase
    .from('organizer_profiles')
    .select('status')
    .eq('user_id', user.id)
    .single()

  if (orgProfile?.status !== 'approved') {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <div className="text-5xl mb-4">⏳</div>
        <h1 className="text-xl font-bold text-gray-900 mb-2">Pending Approval</h1>
        <p className="text-gray-500 text-sm">
          Your organizer account is {orgProfile?.status ?? 'under review'}. You'll get access once an admin approves it.
        </p>
      </div>
    )
  }

  return <>{children}</>
}
