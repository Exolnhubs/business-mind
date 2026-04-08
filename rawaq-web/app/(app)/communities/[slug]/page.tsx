'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/contexts/auth-context'
import { Spinner } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { HappeningCard } from '@/components/communities/HappeningCard'
import { PostHappeningForm } from '@/components/communities/PostHappeningForm'
import { useHappenings } from '@/hooks/useHappenings'
import { formatDate } from '@/lib/utils'
import type { Community, CommunityLevel, CommunityRole, Event } from '@/types/database'

type CommunityDetail = Community & {
  is_member: boolean
  member_role: CommunityRole | null
  member_status: 'active' | 'timed_out' | 'removed' | 'banned' | null
  event_count: number
  ancestors: Pick<Community, 'id' | 'name' | 'name_ar' | 'slug' | 'level'>[]
  recent_events: Pick<Event, 'id' | 'title' | 'title_ar' | 'cover_image_url' | 'start_at' | 'city' | 'is_free' | 'price' | 'currency' | 'bookings_count'>[]
  recent_members: Array<{ id: string; display_name: string; avatar_url: string | null; joined_at: string }>
  activity: Array<{ id: string; type: 'member_joined' | 'event_published'; title: string; subtitle: string; created_at: string; href: string | null }>
}
type MembershipMutationResponse = {
  is_member?: boolean
  member_count?: number
  member_role?: CommunityRole | null
  member_status?: 'active' | 'timed_out' | 'removed' | 'banned' | null
  message?: string
}
type CommunityAdminEntry = {
  user_id: string
  role: CommunityRole
  joined_at: string
  profile: { id: string; display_name: string; avatar_url: string | null } | null
}
type ChildCommunityItem = Community & {
  is_member: boolean
  member_role: CommunityRole | null
  member_status: 'active' | 'timed_out' | 'removed' | 'banned' | null
}
type HappeningReportEntry = {
  happening_id: string
  reporter_id: string
  reason: string
  details: string | null
  status: 'pending' | 'resolved' | 'dismissed'
  assigned_to: string | null
  resolved_by: string | null
  resolved_at: string | null
  resolution_note: string | null
  created_at: string
  happening: { id: string; body: string; author_id: string; created_at: string; author: { id: string; display_name: string; avatar_url: string | null } | null } | null
  reporter: { id: string; display_name: string; avatar_url: string | null } | null
  assignee: { id: string; display_name: string; avatar_url: string | null } | null
  resolver: { id: string; display_name: string; avatar_url: string | null } | null
}
type CommunityAuditLogEntry = {
  id: string
  action: string
  target_type: string
  target_id: string
  meta: Record<string, unknown>
  created_at: string
  actor_user_id: string
  actor: { id: string; display_name: string; avatar_url: string | null } | null
}
type CommunityWarningEntry = {
  id: string
  severity: 'low' | 'medium' | 'high'
  reason: string
  internal_note: string | null
  created_at: string
}
type CommunitySanctionEntry = {
  id: string
  sanction_type: 'timeout' | 'removed' | 'banned'
  reason: string
  starts_at: string
  ends_at: string | null
  revoked_at: string | null
  revoke_note: string | null
  created_at: string
}

const LEVEL_ICONS: Record<CommunityLevel, string> = {
  micro:    '🏘️',
  interest: '🎯',
  district: '🏙️',
  city:     '🌆',
  country:  '🌍',
}

export default function CommunityDetailPage() {
  const { slug }   = useParams<{ slug: string }>()
  const { user }   = useAuth()
  const router     = useRouter()

  const [community, setCommunity] = useState<CommunityDetail | null>(null)
  const [loading, setLoading]     = useState(true)
  const [joining, setJoining]     = useState(false)
  const [events, setEvents]       = useState<Event[]>([])
  const [eventsLoading, setEventsLoading] = useState(false)
  const [nextCursor, setNextCursor]       = useState<string | null>(null)
  const [children, setChildren] = useState<ChildCommunityItem[]>([])
  const [childrenLoading, setChildrenLoading] = useState(false)
  const [childJoiningSlug, setChildJoiningSlug] = useState<string | null>(null)
  const [showPostForm, setShowPostForm]   = useState(false)
  const [admins, setAdmins] = useState<CommunityAdminEntry[]>([])
  const [adminsLoading, setAdminsLoading] = useState(false)
  const [reports, setReports] = useState<HappeningReportEntry[]>([])
  const [reportsLoading, setReportsLoading] = useState(false)
  const [auditLogs, setAuditLogs] = useState<CommunityAuditLogEntry[]>([])
  const [auditLogsLoading, setAuditLogsLoading] = useState(false)
  const [settingsForm, setSettingsForm] = useState({
    name: '',
    name_ar: '',
    description: '',
    description_ar: '',
    city: '',
    cover_url: '',
    is_private: false,
  })
  const [savingSettings, setSavingSettings] = useState(false)
  const [selectedMemberHistory, setSelectedMemberHistory] = useState<{
    member: CommunityDetail['recent_members'][number]
    warnings: CommunityWarningEntry[]
    sanctions: CommunitySanctionEntry[]
  } | null>(null)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [memberActionLoading, setMemberActionLoading] = useState<string | null>(null)
  const [reportActionLoading, setReportActionLoading] = useState<string | null>(null)

  const isMember = community?.is_member ?? false
  const memberRole = community?.member_role ?? null
  const memberStatus = community?.member_status ?? null
  const derivedRole = user?.id
    ? community?.owner_user_id === user.id
      ? 'owner'
      : admins.find((entry) => entry.user_id === user.id)?.role ?? null
    : null
  const effectiveRole = memberRole ?? derivedRole
  const isCommunityOwner = effectiveRole === 'owner'
  const canModerate = effectiveRole === 'owner' || effectiveRole === 'community_admin'
  const canParticipateInHappenings = memberStatus ? memberStatus === 'active' : isMember
  const { happenings, loading: happeningsLoading, posting, post, toggleRsvp, toggleReact, remove, report } =
    useHappenings(slug, isMember)

  useEffect(() => {
    fetch(`/api/communities/${slug}`)
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then((json) => setCommunity(json.data))
      .catch(() => router.replace('/communities'))
      .finally(() => setLoading(false))
  }, [slug, router])

  async function loadEvents(cursor?: string) {
    setEventsLoading(true)
    const sp = new URLSearchParams({ per_page: '12' })
    if (cursor) sp.set('cursor', cursor)
    const res = await fetch(`/api/communities/${slug}/events?${sp}`)
    if (res.ok) {
      const json = await res.json() as { data: { events: Event[]; next_cursor: string | null } }
      setEvents((prev) => cursor ? [...prev, ...json.data.events] : json.data.events)
      setNextCursor(json.data.next_cursor)
    }
    setEventsLoading(false)
  }

  useEffect(() => {
    if (community) loadEvents()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [community?.id])

  async function loadChildren() {
    setChildrenLoading(true)
    try {
      const res = await fetch(`/api/communities/${slug}/children`)
      if (res.ok) {
        const json = await res.json() as { data: { children: ChildCommunityItem[] } }
        setChildren(json.data.children ?? [])
      }
    } finally {
      setChildrenLoading(false)
    }
  }

  useEffect(() => {
    if (community) void loadChildren()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [community?.id])

  useEffect(() => {
    if (!community) return
    setSettingsForm({
      name: community.name ?? '',
      name_ar: community.name_ar ?? '',
      description: community.description ?? '',
      description_ar: community.description_ar ?? '',
      city: community.city ?? '',
      cover_url: community.cover_url ?? '',
      is_private: community.is_private ?? false,
    })
  }, [community])

  async function loadAdmins() {
    if (!user || !isMember) return
    setAdminsLoading(true)
    try {
      const res = await fetch(`/api/communities/${slug}/admins`)
      if (res.ok) {
        const json = await res.json() as { data: CommunityAdminEntry[] }
        setAdmins(json.data ?? [])
      }
    } finally {
      setAdminsLoading(false)
    }
  }

  async function loadReports() {
    if (!canModerate) return
    setReportsLoading(true)
    try {
      const res = await fetch(`/api/communities/${slug}/reports/happenings?status=pending`)
      if (res.ok) {
        const json = await res.json() as { data: { reports: HappeningReportEntry[] } }
        setReports(json.data.reports ?? [])
      }
    } finally {
      setReportsLoading(false)
    }
  }

  async function loadAuditLogs() {
    if (!canModerate) return
    setAuditLogsLoading(true)
    try {
      const res = await fetch(`/api/communities/${slug}/audit-logs?limit=20`)
      if (res.ok) {
        const json = await res.json() as { data: { logs: CommunityAuditLogEntry[] } }
        setAuditLogs(json.data.logs ?? [])
      }
    } finally {
      setAuditLogsLoading(false)
    }
  }

  useEffect(() => {
    if (user && isMember) loadAdmins()
    else setAdmins([])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, isMember, user?.id, canModerate])

  useEffect(() => {
    if (canModerate) loadReports()
    else setReports([])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, canModerate])

  useEffect(() => {
    if (canModerate) loadAuditLogs()
    else setAuditLogs([])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, canModerate])

  async function toggleMembership() {
    if (!user) { router.push('/login'); return }
    if (!community) return
    setJoining(true)
    const method   = community.is_member ? 'DELETE' : 'POST'
    const endpoint = community.is_member
      ? `/api/communities/${slug}/leave`
      : `/api/communities/${slug}/join`
    const res = await fetch(endpoint, { method })
    if (res.ok) {
      const json = await res.json() as { data?: MembershipMutationResponse }
      setCommunity((prev) =>
        prev
          ? {
              ...prev,
              is_member: json.data?.is_member ?? !prev.is_member,
              member_role: json.data?.member_role ?? (json.data?.is_member ? prev.member_role : null),
              member_status: json.data?.is_member ? (json.data?.member_status ?? prev.member_status ?? 'active') : null,
              member_count: json.data?.member_count ?? (!prev.is_member ? prev.member_count + 1 : Math.max(prev.member_count - 1, 0)),
            }
          : prev
      )
      if (json.data?.message) {
        window.alert(json.data.message)
      }
    }
    setJoining(false)
  }

  async function toggleChildMembership(child: ChildCommunityItem) {
    if (!user) { router.push('/login'); return }
    setChildJoiningSlug(child.slug)
    try {
      const endpoint = child.is_member
        ? `/api/communities/${child.slug}/leave`
        : `/api/communities/${child.slug}/join`
      const res = await fetch(endpoint, { method: child.is_member ? 'DELETE' : 'POST' })
      if (res.ok) {
        const json = await res.json() as { data?: MembershipMutationResponse }
        setChildren((prev) => prev.map((entry) =>
          entry.id === child.id
            ? {
                ...entry,
                is_member: json.data?.is_member ?? !entry.is_member,
                member_role: json.data?.member_role ?? (json.data?.is_member ? entry.member_role : null),
                member_status: json.data?.is_member ? (json.data?.member_status ?? entry.member_status ?? 'active') : null,
                member_count: json.data?.member_count ?? (!entry.is_member ? entry.member_count + 1 : Math.max(entry.member_count - 1, 0)),
              }
            : entry
        ))
      }
    } finally {
      setChildJoiningSlug(null)
    }
  }

  async function assignCommunityAdmin(userId: string) {
    setMemberActionLoading(`assign-${userId}`)
    try {
      const res = await fetch(`/api/communities/${slug}/admins`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId }),
      })
      if (res.ok) {
        await loadAdmins()
      }
    } finally {
      setMemberActionLoading(null)
    }
  }

  async function revokeCommunityAdmin(userId: string) {
    setMemberActionLoading(`revoke-${userId}`)
    try {
      const res = await fetch(`/api/communities/${slug}/admins/${userId}`, { method: 'DELETE' })
      if (res.ok) {
        await loadAdmins()
      }
    } finally {
      setMemberActionLoading(null)
    }
  }

  async function saveCommunitySettings() {
    setSavingSettings(true)
    try {
      const res = await fetch(`/api/communities/${slug}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: settingsForm.name.trim(),
          name_ar: settingsForm.name_ar.trim() || null,
          description: settingsForm.description.trim() || null,
          description_ar: settingsForm.description_ar.trim() || null,
          city: settingsForm.city.trim() || null,
          cover_url: settingsForm.cover_url.trim() || null,
          is_private: settingsForm.is_private,
        }),
      })

      if (res.ok) {
        const json = await res.json() as { data: Community }
        setCommunity((prev) => (prev ? { ...prev, ...json.data } : prev))
      } else {
        window.alert('Failed to update community settings')
      }
    } finally {
      setSavingSettings(false)
    }
  }

  async function handleHappeningRsvp(target: Parameters<typeof toggleRsvp>[0]) {
    if (!canParticipateInHappenings) {
      window.alert('Your membership is temporarily restricted from interacting with happenings.')
      return
    }
    await toggleRsvp(target)
  }

  async function handleHappeningReact(target: Parameters<typeof toggleReact>[0]) {
    if (!canParticipateInHappenings) {
      window.alert('Your membership is temporarily restricted from interacting with happenings.')
      return
    }
    await toggleReact(target)
  }

  async function issueWarning(userId: string) {
    const reason = window.prompt('Warning reason')
    if (!reason?.trim()) return
    setMemberActionLoading(`warn-${userId}`)
    try {
      await fetch(`/api/communities/${slug}/members/${userId}/warnings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ severity: 'medium', reason: reason.trim() }),
      })
      await loadAuditLogs()
      if (selectedMemberHistory?.member.id === userId) {
        await loadMemberHistory(selectedMemberHistory.member)
      }
    } finally {
      setMemberActionLoading(null)
    }
  }

  async function issueSanction(userId: string, sanctionType: 'timeout' | 'removed' | 'banned') {
    const reason = window.prompt(`Reason for ${sanctionType}`)
    if (!reason?.trim()) return
    let endsAt: string | null = null
    if (sanctionType === 'timeout') {
      const hoursRaw = window.prompt('Timeout duration in hours', '24')
      if (!hoursRaw) return
      const hours = Number(hoursRaw)
      if (!Number.isFinite(hours) || hours <= 0) return
      endsAt = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString()
    }
    setMemberActionLoading(`${sanctionType}-${userId}`)
    try {
      await fetch(`/api/communities/${slug}/members/${userId}/sanctions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sanction_type: sanctionType,
          reason: reason.trim(),
          ends_at: endsAt,
        }),
      })
      await loadAuditLogs()
      if (selectedMemberHistory?.member.id === userId) {
        await loadMemberHistory(selectedMemberHistory.member)
      }
    } finally {
      setMemberActionLoading(null)
    }
  }

  async function updateReport(reportItem: HappeningReportEntry, status: 'resolved' | 'dismissed') {
    setReportActionLoading(`${reportItem.happening_id}:${reportItem.reporter_id}:${status}`)
    try {
      const res = await fetch(`/api/communities/${slug}/reports/happenings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          happening_id: reportItem.happening_id,
          reporter_id: reportItem.reporter_id,
          status,
        }),
      })
      if (res.ok) {
        setReports((prev) => prev.filter((entry) => !(entry.happening_id === reportItem.happening_id && entry.reporter_id === reportItem.reporter_id)))
        await loadAuditLogs()
      }
    } finally {
      setReportActionLoading(null)
    }
  }

  async function loadMemberHistory(member: CommunityDetail['recent_members'][number]) {
    setHistoryLoading(true)
    try {
      const [warningsRes, sanctionsRes] = await Promise.all([
        fetch(`/api/communities/${slug}/members/${member.id}/warnings`),
        fetch(`/api/communities/${slug}/members/${member.id}/sanctions`),
      ])

      const warningsJson = warningsRes.ok
        ? await warningsRes.json() as { data: { warnings: CommunityWarningEntry[] } }
        : { data: { warnings: [] } }
      const sanctionsJson = sanctionsRes.ok
        ? await sanctionsRes.json() as { data: { sanctions: CommunitySanctionEntry[] } }
        : { data: { sanctions: [] } }

      setSelectedMemberHistory({
        member,
        warnings: warningsJson.data.warnings ?? [],
        sanctions: sanctionsJson.data.sanctions ?? [],
      })
    } finally {
      setHistoryLoading(false)
    }
  }

  function auditActionLabel(action: string) {
    switch (action) {
      case 'assign_community_admin': return 'Assigned community admin'
      case 'revoke_community_admin': return 'Revoked community admin'
      case 'resolve_happening_report': return 'Resolved happening report'
      case 'dismiss_happening_report': return 'Dismissed happening report'
      case 'warn_member': return 'Warned member'
      case 'timeout_member': return 'Timed out member'
      case 'remove_member': return 'Removed member'
      case 'ban_member': return 'Banned member'
      case 'revoke_sanction': return 'Revoked sanction'
      default: return action
    }
  }

  if (loading) {
    return <div className="flex justify-center py-24"><Spinner size="lg" /></div>
  }

  if (!community) return null

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      {/* Hero */}
      <div className="rounded-2xl overflow-hidden border border-gray-100 shadow-sm mb-8">
        {community.cover_url ? (
          <img src={community.cover_url} alt="" className="w-full h-48 object-cover" />
        ) : (
          <div className="w-full h-48 bg-gradient-to-br from-brand-50 to-brand-100 flex items-center justify-center text-6xl">
            {LEVEL_ICONS[community.level]}
          </div>
        )}
        <div className="p-6">
          {/* Breadcrumb ancestors */}
          {community.ancestors.length > 0 && (
            <div className="flex items-center gap-1 text-xs text-gray-400 mb-2 flex-wrap">
              {community.ancestors.map((a, i) => (
                <span key={a.id} className="flex items-center gap-1">
                  {i > 0 && <span></span>}
                  <Link href={`/communities/${a.slug}`} className="hover:text-brand-600 transition-colors">
                    {LEVEL_ICONS[a.level]} {a.name}
                  </Link>
                </span>
              ))}
              <span></span>
              <span className="text-gray-600">{community.name}</span>
            </div>
          )}

          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h1 className="text-2xl font-bold text-gray-900">{community.name}</h1>
                {community.is_verified && (
                  <span className="text-brand-500 text-lg" title="Verified">✓</span>
                )}
              </div>
              {community.name_ar && (
                <p className="text-gray-500 text-sm" dir="rtl">{community.name_ar}</p>
              )}
              <div className="flex items-center gap-3 mt-2 text-sm text-gray-500">
                <span>{LEVEL_ICONS[community.level]} {community.level}</span>
                {community.city && <span>📍 {community.city}</span>}
                <span>👥 {community.member_count.toLocaleString()} members</span>
                <span>📅 {community.event_count} events</span>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span
                  className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                    community.is_member
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                      : 'border-gray-200 bg-gray-50 text-gray-600'
                  }`}
                >
                  {community.is_member ? 'You joined this community' : 'Not joined yet'}
                </span>
                {community.member_role && (
                  <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
                    Role: {community.member_role}
                  </span>
                )}
              </div>
            </div>

            <button
              onClick={toggleMembership}
              disabled={joining}
              className={`shrink-0 px-5 py-2.5 rounded-xl font-semibold transition-colors ${
                community.is_member
                  ? 'border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                  : 'bg-brand-600 text-white hover:bg-brand-700'
              }`}
            >
              {joining ? <Spinner size="sm" /> : community.is_member ? 'Joined · Leave community' : 'Join community'}
            </button>
          </div>

          {community.description && (
            <p className="mt-4 text-gray-600 text-sm leading-relaxed">{community.description}</p>
          )}
        </div>
      </div>

      {isCommunityOwner && (
        <div className="mb-8 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-gray-900">Community Settings</h2>
              <p className="mt-1 text-xs text-gray-500">Edit the public details and access mode for this community.</p>
            </div>
            <button
              onClick={saveCommunitySettings}
              disabled={savingSettings || !settingsForm.name.trim()}
              className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-50"
            >
              {savingSettings ? 'Saving...' : 'Save changes'}
            </button>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">Name</span>
              <input value={settingsForm.name} onChange={(e) => setSettingsForm((prev) => ({ ...prev, name: e.target.value }))} className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900" />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">Arabic name</span>
              <input value={settingsForm.name_ar} dir="rtl" onChange={(e) => setSettingsForm((prev) => ({ ...prev, name_ar: e.target.value }))} className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900" />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">City</span>
              <input value={settingsForm.city} onChange={(e) => setSettingsForm((prev) => ({ ...prev, city: e.target.value }))} className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900" />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">Cover image URL</span>
              <input value={settingsForm.cover_url} onChange={(e) => setSettingsForm((prev) => ({ ...prev, cover_url: e.target.value }))} className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900" />
            </label>
            <label className="block md:col-span-2">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">Description</span>
              <textarea value={settingsForm.description} rows={4} onChange={(e) => setSettingsForm((prev) => ({ ...prev, description: e.target.value }))} className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900" />
            </label>
            <label className="block md:col-span-2">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">Arabic description</span>
              <textarea value={settingsForm.description_ar} rows={4} dir="rtl" onChange={(e) => setSettingsForm((prev) => ({ ...prev, description_ar: e.target.value }))} className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900" />
            </label>
            <label className="md:col-span-2 flex items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
              <input type="checkbox" checked={settingsForm.is_private} onChange={(e) => setSettingsForm((prev) => ({ ...prev, is_private: e.target.checked }))} />
              <span className="text-sm text-gray-700">Make this community private</span>
            </label>
          </div>
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-2 mb-8">
        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-900">Members</h2>
            <span className="text-sm text-gray-500">{community.member_count.toLocaleString()} total</span>
          </div>
          {community.recent_members.length === 0 ? (
            <p className="text-sm text-gray-500">No members yet.</p>
          ) : (
            <div className="space-y-3">
              {community.recent_members.map((member) => (
                <div key={member.id} className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-brand-100 text-sm font-semibold text-brand-700">
                    {member.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={member.avatar_url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      member.display_name.slice(0, 1).toUpperCase()
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">{member.display_name}</p>
                    <p className="text-xs text-gray-500">Joined {formatDate(member.joined_at)}</p>
                    {admins.some((entry) => entry.user_id === member.id && entry.role === 'community_admin') && (
                      <p className="text-[11px] font-semibold text-brand-600 mt-1">Community admin</p>
                    )}
                    {community.owner_user_id === member.id && (
                      <p className="text-[11px] font-semibold text-amber-600 mt-1">Owner</p>
                    )}
                  </div>
                  {canModerate && (
                    <div className="ml-auto flex flex-wrap gap-2">
                      {isCommunityOwner &&
                        community.owner_user_id !== member.id &&
                        !admins.some((entry) => entry.user_id === member.id && entry.role === 'owner') && (
                        admins.some((entry) => entry.user_id === member.id && entry.role === 'community_admin') ? (
                          <button
                            onClick={() => revokeCommunityAdmin(member.id)}
                            disabled={memberActionLoading === `revoke-${member.id}`}
                            className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700"
                          >
                            Revoke admin
                          </button>
                        ) : (
                          <button
                            onClick={() => assignCommunityAdmin(member.id)}
                            disabled={memberActionLoading === `assign-${member.id}`}
                            className="rounded-lg border border-brand-200 bg-brand-50 px-2.5 py-1 text-[11px] font-semibold text-brand-700"
                          >
                            Make admin
                          </button>
                        )
                      )}
                      {community.owner_user_id !== member.id &&
                        !admins.some((entry) => entry.user_id === member.id && entry.role === 'owner') &&
                        member.id !== user?.id &&
                        (isCommunityOwner || !admins.some((entry) => entry.user_id === member.id && entry.role === 'community_admin')) && (
                        <>
                          <button
                            onClick={() => issueWarning(member.id)}
                            disabled={memberActionLoading === `warn-${member.id}`}
                            className="rounded-lg border border-yellow-200 bg-yellow-50 px-2.5 py-1 text-[11px] font-semibold text-yellow-700"
                          >
                            Warn
                          </button>
                          <button
                            onClick={() => loadMemberHistory(member)}
                            disabled={historyLoading && selectedMemberHistory?.member.id === member.id}
                            className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-700"
                          >
                            History
                          </button>
                          <button
                            onClick={() => issueSanction(member.id, 'timeout')}
                            disabled={memberActionLoading === `timeout-${member.id}`}
                            className="rounded-lg border border-orange-200 bg-orange-50 px-2.5 py-1 text-[11px] font-semibold text-orange-700"
                          >
                            Timeout
                          </button>
                          <button
                            onClick={() => issueSanction(member.id, 'removed')}
                            disabled={memberActionLoading === `removed-${member.id}`}
                            className="rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1 text-[11px] font-semibold text-gray-700"
                          >
                            Remove
                          </button>
                          <button
                            onClick={() => issueSanction(member.id, 'banned')}
                            disabled={memberActionLoading === `banned-${member.id}`}
                            className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-[11px] font-semibold text-red-700"
                          >
                            Ban
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {canModerate && (
          <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold text-gray-900">Moderation History</h2>
                <p className="text-xs text-gray-500 mt-1">Warnings and sanctions for the selected member.</p>
              </div>
              {selectedMemberHistory && (
                <button
                  onClick={() => setSelectedMemberHistory(null)}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"
                >
                  Clear
                </button>
              )}
            </div>
            {historyLoading ? (
              <div className="flex justify-center py-8"><Spinner size="lg" /></div>
            ) : !selectedMemberHistory ? (
              <p className="text-sm text-gray-500">Choose a member and tap History to inspect moderation records.</p>
            ) : (
              <div className="space-y-4">
                <div>
                  <p className="text-sm font-semibold text-gray-900">{selectedMemberHistory.member.display_name}</p>
                  <p className="text-xs text-gray-500">Warnings: {selectedMemberHistory.warnings.length} · Sanctions: {selectedMemberHistory.sanctions.length}</p>
                </div>
                <div className="space-y-2">
                  {selectedMemberHistory.warnings.map((warning) => (
                    <div key={warning.id} className="rounded-xl border border-yellow-100 bg-yellow-50 px-4 py-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-yellow-700">{warning.severity} warning</p>
                      <p className="text-sm text-gray-800 mt-1">{warning.reason}</p>
                      <p className="text-xs text-gray-500 mt-1">{formatDate(warning.created_at)}</p>
                    </div>
                  ))}
                  {selectedMemberHistory.sanctions.map((sanction) => (
                    <div key={sanction.id} className="rounded-xl border border-red-100 bg-red-50 px-4 py-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-red-700">{sanction.sanction_type}</p>
                      <p className="text-sm text-gray-800 mt-1">{sanction.reason}</p>
                      <p className="text-xs text-gray-500 mt-1">
                        Started {formatDate(sanction.starts_at)}
                        {sanction.ends_at ? ` · Ends ${formatDate(sanction.ends_at)}` : ''}
                        {sanction.revoked_at ? ` · Revoked ${formatDate(sanction.revoked_at)}` : ''}
                      </p>
                    </div>
                  ))}
                  {selectedMemberHistory.warnings.length === 0 && selectedMemberHistory.sanctions.length === 0 && (
                    <p className="text-sm text-gray-500">No moderation history for this member yet.</p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="rounded-2xl border border-violet-100 bg-violet-50/50 p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-gray-900">Sub-communities</h2>
              <p className="text-xs text-gray-500 mt-1">Smaller circles nested under this community.</p>
            </div>
            <Link
              href={`/communities/new?parent=${slug}`}
              className="rounded-full bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-700"
            >
              + Create sub-community here
            </Link>
          </div>
          {childrenLoading ? (
            <div className="flex justify-center py-8"><Spinner size="lg" /></div>
          ) : children.length === 0 ? (
            <p className="text-sm text-gray-500">No sub-communities yet.</p>
          ) : (
            <div className="space-y-3">
              {children.map((child) => (
                <div key={child.id} className="rounded-xl border border-white/70 bg-white px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link href={`/communities/${child.slug}`} className="text-sm font-semibold text-gray-900 hover:text-brand-600">
                        {child.name}
                      </Link>
                      <p className="mt-1 text-xs text-gray-500">
                        {child.level} · {child.member_count.toLocaleString()} members
                        {child.city ? ` · ${child.city}` : ''}
                      </p>
                    </div>
                    <button
                      onClick={() => toggleChildMembership(child)}
                      disabled={childJoiningSlug === child.slug}
                      className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                        child.is_member
                          ? 'border border-emerald-200 bg-emerald-50 text-emerald-700'
                          : 'bg-brand-600 text-white'
                      }`}
                    >
                      {childJoiningSlug === child.slug ? '...' : child.is_member ? 'Joined' : 'Join'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold text-gray-900 mb-4">Recent Activity</h2>
          {community.activity.length === 0 ? (
            <p className="text-sm text-gray-500">No activity yet.</p>
          ) : (
            <div className="space-y-3">
              {community.activity.map((item) => {
                const row = (
                  <div className="flex items-start gap-3 rounded-xl bg-gray-50 px-3 py-3">
                    <div className="mt-0.5 text-lg">{item.type === 'member_joined' ? '👋' : '🗓️'}</div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900">{item.title}</p>
                      <p className="text-xs text-gray-500">{item.subtitle}</p>
                      <p className="text-xs text-gray-400 mt-1">{formatDate(item.created_at)}</p>
                    </div>
                  </div>
                )
                return item.href ? <Link key={item.id} href={item.href}>{row}</Link> : <div key={item.id}>{row}</div>
              })}
            </div>
          )}
        </div>
      </div>

      {(isCommunityOwner || canModerate) && (
        <div className="grid gap-6 md:grid-cols-2 mb-8">
          {isCommunityOwner && (
            <div className="rounded-2xl border border-brand-100 bg-brand-50/60 p-5 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-gray-900">Community Admins</h2>
                <span className="text-xs font-semibold text-brand-700">{admins.length} roles</span>
              </div>
              {adminsLoading ? (
                <div className="flex justify-center py-8"><Spinner size="lg" /></div>
              ) : admins.length === 0 ? (
                <p className="text-sm text-gray-500">No community admins assigned yet.</p>
              ) : (
                <div className="space-y-3">
                  {admins.map((entry) => (
                    <div key={entry.user_id} className="rounded-xl border border-white/70 bg-white px-4 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-gray-900">{entry.profile?.display_name ?? entry.user_id}</p>
                          <p className="text-xs text-gray-500">{entry.role} · joined {formatDate(entry.joined_at)}</p>
                        </div>
                        {entry.role === 'community_admin' && (
                          <button
                            onClick={() => revokeCommunityAdmin(entry.user_id)}
                            disabled={memberActionLoading === `revoke-${entry.user_id}`}
                            className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700"
                          >
                            Revoke
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {canModerate && (
            <div className="rounded-2xl border border-red-100 bg-red-50/50 p-5 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">Happening Reports</h2>
                  <p className="text-xs text-gray-500 mt-1">Community admins review these directly.</p>
                </div>
                <button
                  onClick={loadReports}
                  disabled={reportsLoading}
                  className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-700"
                >
                  Refresh
                </button>
              </div>
              {reportsLoading ? (
                <div className="flex justify-center py-8"><Spinner size="lg" /></div>
              ) : reports.length === 0 ? (
                <p className="text-sm text-gray-500">No pending happening reports.</p>
              ) : (
                <div className="space-y-3">
                  {reports.map((reportItem) => (
                    <div key={`${reportItem.happening_id}:${reportItem.reporter_id}`} className="rounded-xl border border-white/70 bg-white px-4 py-3">
                      <p className="text-sm font-semibold text-gray-900">{reportItem.reason}</p>
                      <p className="text-xs text-gray-500 mt-1">
                        Reporter: {reportItem.reporter?.display_name ?? reportItem.reporter_id}
                      </p>
                      {reportItem.happening && (
                        <p className="text-xs text-gray-600 mt-2 line-clamp-2">
                          {reportItem.happening.body}
                        </p>
                      )}
                      {reportItem.details && (
                        <p className="text-xs text-gray-500 mt-2">{reportItem.details}</p>
                      )}
                      <div className="mt-3 flex gap-2">
                        <button
                          onClick={() => updateReport(reportItem, 'resolved')}
                          disabled={reportActionLoading === `${reportItem.happening_id}:${reportItem.reporter_id}:resolved`}
                          className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700"
                        >
                          Resolve
                        </button>
                        <button
                          onClick={() => updateReport(reportItem, 'dismissed')}
                          disabled={reportActionLoading === `${reportItem.happening_id}:${reportItem.reporter_id}:dismissed`}
                          className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-semibold text-gray-700"
                        >
                          Dismiss
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {canModerate && (
        <div className="mb-8 rounded-2xl border border-indigo-100 bg-indigo-50/50 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-bold text-gray-900">Community Audit Trail</h2>
              <p className="text-xs text-gray-500 mt-1">Recent governance actions by owners and community admins.</p>
            </div>
            <button
              onClick={loadAuditLogs}
              disabled={auditLogsLoading}
              className="rounded-lg border border-indigo-200 bg-white px-3 py-1.5 text-xs font-semibold text-indigo-700"
            >
              Refresh
            </button>
          </div>
          {auditLogsLoading ? (
            <div className="flex justify-center py-8"><Spinner size="lg" /></div>
          ) : auditLogs.length === 0 ? (
            <p className="text-sm text-gray-500">No governance actions recorded yet.</p>
          ) : (
            <div className="space-y-3">
              {auditLogs.map((log) => (
                <div key={log.id} className="rounded-xl border border-white/70 bg-white px-4 py-3">
                  <p className="text-sm font-semibold text-gray-900">{auditActionLabel(log.action)}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {log.actor?.display_name ?? log.actor_user_id} · {formatDate(log.created_at)}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">Target: {log.target_type}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Happenings section */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-gray-900">What&apos;s Happening Now</h2>
            <p className="text-xs text-gray-400 mt-0.5">Spontaneous, time-limited posts from members</p>
          </div>
          {canParticipateInHappenings && !showPostForm && (
            <button
              onClick={() => setShowPostForm(true)}
              className="text-sm font-semibold bg-brand-600 text-white px-4 py-2 rounded-xl hover:bg-brand-700 transition-colors"
            >
              + Post happening
            </button>
          )}
        </div>

        {showPostForm && (
          <PostHappeningForm
            posting={posting}
            onPost={async (data) => {
              const ok = await post(data)
              if (ok) setShowPostForm(false)
              return ok
            }}
            onCancel={() => setShowPostForm(false)}
          />
        )}

        {happeningsLoading ? (
          <div className="flex justify-center py-8"><Spinner size="lg" /></div>
        ) : happenings.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 py-10 text-center">
            <p className="text-2xl mb-2">📍</p>
            <p className="text-sm font-medium text-gray-600">Nothing happening right now</p>
            {canParticipateInHappenings && (
              <p className="text-xs text-gray-400 mt-1">Be the first — post a happening!</p>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {happenings.map((h) => (
              <HappeningCard
                key={h.id}
                happening={h}
                onRsvp={handleHappeningRsvp}
                onReact={handleHappeningReact}
                onDelete={remove}
                onReport={report}
              />
            ))}
          </div>
        )}
      </div>

      {/* Events section */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">Upcoming Events</h2>
          <div className="flex items-center gap-3">
            {user?.role === 'organizer' && (
              <Link
                href={`/organizer/events/new?community=${slug}`}
                className="text-xs font-semibold bg-brand-600 text-white px-3 py-1.5 rounded-full hover:bg-brand-700 transition-colors"
              >
                + Create event here
              </Link>
            )}
            <Link
              href={`/events?community=${slug}`}
              className="text-sm text-brand-600 hover:underline"
            >
              View all
            </Link>
          </div>
        </div>

        {eventsLoading && events.length === 0 ? (
          <div className="flex justify-center py-12"><Spinner size="lg" /></div>
        ) : events.length === 0 ? (
          <EmptyState icon="📅" title="No upcoming events" description="Be the first to create an event in this community" />
        ) : (
          <div className="space-y-3">
            {events.map((ev) => (
              <Link
                key={ev.id}
                href={`/events/${ev.id}`}
                className="flex gap-4 p-4 bg-white rounded-xl border border-gray-100 hover:border-brand-200 hover:shadow-sm transition-all"
              >
                {ev.cover_image_url ? (
                  <img src={ev.cover_image_url} alt="" className="w-20 h-16 rounded-lg object-cover shrink-0" />
                ) : (
                  <div className="w-20 h-16 rounded-lg bg-brand-50 flex items-center justify-center text-2xl shrink-0">📅</div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-gray-900 line-clamp-1">{ev.title}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{formatDate(ev.start_at)}</p>
                  <p className="text-xs text-gray-400 mt-0.5">📍 {ev.city}</p>
                </div>
                <div className="shrink-0 text-right">
                  <span className={`text-xs font-semibold px-2 py-1 rounded-full ${
                    ev.is_free ? 'bg-green-50 text-green-700' : 'bg-brand-50 text-brand-700'
                  }`}>
                    {ev.is_free ? 'Free' : `${ev.price} ${ev.currency}`}
                  </span>
                </div>
              </Link>
            ))}

            {nextCursor && (
              <div className="text-center pt-4">
                <button
                  onClick={() => loadEvents(nextCursor)}
                  disabled={eventsLoading}
                  className="btn-secondary text-sm"
                >
                  {eventsLoading ? <Spinner size="sm" /> : 'Load more events'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
