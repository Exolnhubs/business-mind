'use client'

import { useState, useTransition } from 'react'
import type { PlatformSetting } from '@/types/plans'

interface SettingMeta {
  key: string
  label: string
  description: string
  type: 'boolean' | 'number' | 'text'
}

const SETTINGS_META: SettingMeta[] = [
  {
    key: 'organizer_applications_enabled',
    label: 'Organizer Applications',
    description: 'Allow new users to apply for organizer status.',
    type: 'boolean',
  },
  {
    key: 'maintenance_mode',
    label: 'Maintenance Mode',
    description: 'Show a maintenance banner to non-owner users.',
    type: 'boolean',
  },
  {
    key: 'maintenance_message',
    label: 'Maintenance Message',
    description: 'Message shown during maintenance (leave blank for default).',
    type: 'text',
  },
  {
    key: 'default_platform_fee_pct',
    label: 'Default Platform Fee (%)',
    description: 'Fallback fee applied when a plan has no explicit fee. Range: 0–100.',
    type: 'number',
  },
]

interface Props {
  initialSettings: PlatformSetting[]
}

function getValue(settings: PlatformSetting[], key: string): unknown {
  return settings.find((s) => s.key === key)?.value
}

export function SettingsEditor({ initialSettings }: Props) {
  const [settings, setSettings] = useState(initialSettings)
  const [isPending, startTransition] = useTransition()
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [draft, setDraft] = useState<Record<string, unknown>>(() => {
    const d: Record<string, unknown> = {}
    for (const meta of SETTINGS_META) {
      d[meta.key] = getValue(initialSettings, meta.key)
    }
    return d
  })

  function setDraftKey(key: string, value: unknown) {
    setSaved(false)
    setDraft((prev) => ({ ...prev, [key]: value }))
  }

  function handleSave() {
    setError(null)
    setSaved(false)
    startTransition(async () => {
      try {
        const updates = SETTINGS_META.map(({ key, type }) => {
          let value = draft[key]
          if (type === 'number') value = parseFloat(String(value)) / 100
          return { key, value }
        })
        // maintenance_message is text — not divided by 100
        const msgIdx = updates.findIndex((u) => u.key === 'maintenance_message')
        if (msgIdx >= 0) updates[msgIdx].value = draft['maintenance_message']

        const res = await fetch('/api/owner/settings', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ updates }),
        })
        if (!res.ok) {
          const j = await res.json().catch(() => ({}))
          setError((j as any).error ?? 'Save failed')
          return
        }
        const j = await res.json()
        setSettings((j.data?.settings ?? []) as PlatformSetting[])
        setSaved(true)
      } catch {
        setError('Network error')
      }
    })
  }

  return (
    <div className="space-y-4">
      {SETTINGS_META.map((meta) => {
        const rawDbValue = getValue(settings, meta.key)

        return (
          <div key={meta.key} className="rounded-xl border border-gray-200 p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-sm font-semibold text-gray-900">{meta.label}</div>
                <div className="text-xs text-gray-500 mt-0.5">{meta.description}</div>
                {rawDbValue !== undefined && (
                  <div className="text-xs text-gray-400 mt-1">
                    Current DB value:{' '}
                    <code className="bg-gray-100 px-1 rounded">{JSON.stringify(rawDbValue)}</code>
                  </div>
                )}
              </div>

              <div className="shrink-0">
                {meta.type === 'boolean' && (
                  <button
                    onClick={() => setDraftKey(meta.key, !draft[meta.key])}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      draft[meta.key] ? 'bg-amber-500' : 'bg-gray-300'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                        draft[meta.key] ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                )}

                {meta.type === 'number' && (
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.1"
                      value={
                        typeof draft[meta.key] === 'number'
                          ? Math.round((draft[meta.key] as number) * 100 * 10) / 10
                          : ''
                      }
                      onChange={(e) => setDraftKey(meta.key, parseFloat(e.target.value) / 100)}
                      className="w-20 border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-right"
                    />
                    <span className="text-sm text-gray-500">%</span>
                  </div>
                )}

                {meta.type === 'text' && (
                  <input
                    type="text"
                    value={typeof draft[meta.key] === 'string' ? (draft[meta.key] as string) : ''}
                    onChange={(e) => setDraftKey(meta.key, e.target.value)}
                    className="w-64 border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
                    placeholder="Leave blank for default"
                  />
                )}
              </div>
            </div>
          </div>
        )
      })}

      {error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
          {error}
        </div>
      )}

      <div className="flex items-center gap-3 pt-2">
        <button
          onClick={handleSave}
          disabled={isPending}
          className="px-5 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 disabled:opacity-50 transition-colors"
        >
          {isPending ? 'Saving…' : 'Save Settings'}
        </button>
        {saved && <span className="text-sm text-green-600 font-medium">✓ Saved</span>}
      </div>
    </div>
  )
}
