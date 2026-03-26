import type { Metadata } from 'next'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { OrganizerApprovalList, type OrganizerWithUser } from '@/components/admin/OrganizerApprovalList'

export const metadata: Metadata = { title: 'Organizer Approvals' }

export default async function AdminOrganizersPage() {
  const supabase = await createSupabaseServerClient()

  const { data: pending } = await supabase
    .from('organizer_profiles')
    .select(`
      *,
      user:profiles!user_id(id, display_name, avatar_url, city, created_at)
    `)
    .eq('status', 'pending')
    .order('created_at', { ascending: true })

  const { data: reviewed } = await supabase
    .from('organizer_profiles')
    .select(`
      *,
      user:profiles!user_id(id, display_name, avatar_url, city)
    `)
    .in('status', ['approved', 'rejected', 'suspended'])
    .order('reviewed_at', { ascending: false })
    .limit(50)

  return (
    <div className="space-y-8">
      <h2 className="text-lg font-semibold text-gray-900">Organizer Approvals</h2>

      <section>
        <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-3">
          Pending ({pending?.length ?? 0})
        </h3>
        <OrganizerApprovalList organizers={(pending ?? []) as unknown as OrganizerWithUser[]} />
      </section>

      <section>
        <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-3">
          Reviewed ({reviewed?.length ?? 0})
        </h3>
        <OrganizerApprovalList organizers={(reviewed ?? []) as unknown as OrganizerWithUser[]} />
      </section>
    </div>
  )
}
