import type { Metadata } from 'next'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { SettingsEditor } from '@/components/owner/SettingsEditor'
import type { PlatformSetting } from '@/types/plans'

export const metadata: Metadata = { title: 'Owner — Platform Settings' }

export default async function OwnerSettingsPage() {
  const admin = createSupabaseAdminClient()
  const { data: settings } = await admin
    .from('platform_settings')
    .select('*')
    .order('key')

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Platform Settings</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          Global platform configuration. Changes take effect immediately.
        </p>
      </div>

      <SettingsEditor initialSettings={(settings ?? []) as PlatformSetting[]} />
    </div>
  )
}
