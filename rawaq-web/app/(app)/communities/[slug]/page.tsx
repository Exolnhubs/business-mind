'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { SafeImage } from '@/components/ui/SafeImage'
import Link from 'next/link'
import { useAuth } from '@/contexts/auth-context'
import { Spinner } from '@/components/ui/Spinner'
import { TicketFlipLoader } from '@/components/ui/TicketFlipLoader'
import { EmptyState } from '@/components/ui/EmptyState'
import { HappeningCard } from '@/components/communities/HappeningCard'
import { HappeningParticipantsModal } from '@/components/communities/HappeningParticipantsModal'
import { PostHappeningForm } from '@/components/communities/PostHappeningForm'
import { useHappenings } from '@/hooks/useHappenings'
import {
  clientDeleteJson,
  clientFetchInvalidate,
  clientGetJson,
  clientPatchJson,
  clientPostJson,
  isToastHandledError,
} from '@/lib/client-fetch'
import { formatDate } from '@/lib/utils'
import type { Community, CommunityLevel, CommunityRole, Event } from '@/types/database'
import type {
  CommunityAdminEntry,
  CommunityHostEntry,
  CommunityHostRequestEntry,
  HappeningReportEntry,
  CommunityAuditLogEntry,
  CommunityWarningEntry,
  CommunitySanctionEntry,
  MemberHistoryState,
} from '@/types/community-moderation'

const CommunityModerationPanel = dynamic(
  () => import('@/components/communities/CommunityModerationPanel').then((m) => ({ default: m.CommunityModerationPanel })),
  { ssr: false, loading: () => null },
)

type CommunityDetail = Community & {
  is_member: boolean
  is_following: boolean
  is_host: boolean
  viewer_host_request_status: 'pending' | 'approved' | 'rejected' | null
  viewer_is_individual_organizer: boolean
  member_role: CommunityRole | null
  member_status: 'active' | 'timed_out' | 'removed' | 'banned' | null
  event_count: number
  viewer_city: string | null
  city_members_preview: Array<{ id: string; display_name: string; avatar_url: string | null }>
  ancestors: Pick<Community, 'id' | 'name' | 'name_ar' | 'slug' | 'level'>[]
  recent_events: Pick<Event, 'id' | 'title' | 'title_ar' | 'cover_image_url' | 'start_at' | 'city' | 'is_free' | 'price' | 'currency' | 'bookings_count'>[]
  recent_members: Array<{ id: string; display_name: string; avatar_url: string | null; joined_at: string }>
  timed_out_members: Array<{ id: string; display_name: string; avatar_url: string | null; joined_at: string; timeout_until: string | null }>
  activity: Array<{ id: string; type: 'member_joined' | 'event_published'; title: string; subtitle: string; created_at: string; href: string | null }>
}
type MembershipMutationResponse = {
  is_member?: boolean
  member_count?: number
  member_role?: CommunityRole | null
  member_status?: 'active' | 'timed_out' | 'removed' | 'banned' | null
  message?: string
}
type FollowMutationResponse = {
  is_following?: boolean
}
type ChildCommunityItem = Community & {
  is_member: boolean
  member_role: CommunityRole | null
  member_status: 'active' | 'timed_out' | 'removed' | 'banned' | null
}
const LEVEL_ICONS: Record<CommunityLevel, string> = {
  micro: '🏘️',
  interest: '🎯',
  district: '🏙️',
  city: '🌆',
  country: '🌍',
}

export default function CommunityDetailPage() {
  const { slug } = useParams<{ slug: string }>()
  const { user, profile } = useAuth()
  const router = useRouter()
  const cacheScopeKey = user?.id ?? null

  const [community, setCommunity] = useState<CommunityDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [joining, setJoining] = useState(false)
  const [following, setFollowing] = useState(false)
  const [events, setEvents] = useState<Event[]>([])
  const [eventsLoading, setEventsLoading] = useState(false)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [children, setChildren] = useState<ChildCommunityItem[]>([])
  const [childrenLoading, setChildrenLoading] = useState(false)
  const [childJoiningSlug, setChildJoiningSlug] = useState<string | null>(null)
  const [showPostForm, setShowPostForm] = useState(false)
  const [admins, setAdmins] = useState<CommunityAdminEntry[]>([])
  const [adminsLoading, setAdminsLoading] = useState(false)
  const [hosts, setHosts] = useState<CommunityHostEntry[]>([])
  const [hostsLoading, setHostsLoading] = useState(false)
  const [hostRequests, setHostRequests] = useState<CommunityHostRequestEntry[]>([])
  const [hostRequestsLoading, setHostRequestsLoading] = useState(false)
  const [requestingHost, setRequestingHost] = useState(false)
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
  const [verifying, setVerifying] = useState(false)
  const [selectedMemberHistory, setSelectedMemberHistory] = useState<MemberHistoryState | null>(null)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [memberActionLoading, setMemberActionLoading] = useState<string | null>(null)
  const [reportActionLoading, setReportActionLoading] = useState<string | null>(null)
  const [participantsHappeningId, setParticipantsHappeningId] = useState<string | null>(null)

  const isMember = community?.is_member ?? false
  const memberRole = community?.member_role ?? null
  const memberStatus = community?.member_status ?? null
  const derivedRole = user?.id
    ? community?.owner_user_id === user.id
      ? 'owner'
      : admins.find((entry) => entry.user_id === user.id)?.role ?? null
    : null
  const effectiveRole = memberRole ?? derivedRole
  const isPlatformAdmin = profile?.role === 'admin'
  const isCommunityOwner = effectiveRole === 'owner' || isPlatformAdmin
  const canModerate = isCommunityOwner || effectiveRole === 'community_admin'
  const isIndividualOrganizer = community?.viewer_is_individual_organizer ?? false
  const isCurrentUserHost = community?.is_host ?? false
  const viewerHostRequestStatus = community?.viewer_host_request_status ?? null
  const canRequestHostRole = !isCurrentUserHost
    && isMember
    && memberStatus === 'active'
    && isIndividualOrganizer
    && !isCommunityOwner
  const canParticipateInHappenings = memberStatus ? memberStatus === 'active' : isMember
  const directParent = community && community.ancestors.length > 0
    ? community.ancestors[community.ancestors.length - 1]
    : null
  const communityLevel = community?.level ?? null
  const canCreateSibling = Boolean(directParent) && (isPlatformAdmin || communityLevel !== 'city')
  const canCreateChildHere = communityLevel !== null && (isPlatformAdmin || communityLevel !== 'country')
  const { happenings, loading: happeningsLoading, posting, post, toggleRsvp, toggleReact, remove, report } =
    useHappenings(slug)

  const loadCommunity = useCallback(async (force = false) => {
    setLoading(true)
    try {
      const json = await clientGetJson<{ data: CommunityDetail }>(
        `/api/communities/${slug}`,
        { ttlMs: 45_000, force, scopeKey: cacheScopeKey },
      )
      setCommunity(json.data)
    } catch {
      router.replace('/communities')
    } finally {
      setLoading(false)
    }
  }, [cacheScopeKey, router, slug])

  useEffect(() => {
    void loadCommunity()
  }, [loadCommunity])

  const loadEvents = useCallback(async (cursor?: string, force = false) => {
    setEventsLoading(true)
    const sp = new URLSearchParams({ per_page: '12' })
    if (cursor) sp.set('cursor', cursor)
    try {
      const json = await clientGetJson<{ data: { events: Event[]; next_cursor: string | null } }>(
        `/api/communities/${slug}/events?${sp}`,
        { ttlMs: 45_000, force, scopeKey: cacheScopeKey },
      )
      setEvents((prev) => cursor ? [...prev, ...json.data.events] : json.data.events)
      setNextCursor(json.data.next_cursor)
    } catch {
      if (!cursor) {
        setEvents([])
        setNextCursor(null)
      }
    } finally {
      setEventsLoading(false)
    }
  }, [cacheScopeKey, slug])

  useEffect(() => {
    void loadEvents()
  }, [loadEvents])

  const loadChildren = useCallback(async (force = false) => {
    setChildrenLoading(true)
    try {
      const json = await clientGetJson<{ data: { children: ChildCommunityItem[] } }>(
        `/api/communities/${slug}/children`,
        { ttlMs: 60_000, force, scopeKey: cacheScopeKey },
      )
      setChildren(json.data.children ?? [])
    } catch {
      setChildren([])
    } finally {
      setChildrenLoading(false)
    }
  }, [cacheScopeKey, slug])

  useEffect(() => {
    void loadChildren()
  }, [loadChildren])

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

  const loadAdmins = useCallback(async (force = false) => {
    if (!user || !isMember) return
    setAdminsLoading(true)
    try {
      const json = await clientGetJson<{ data: CommunityAdminEntry[] }>(
        `/api/communities/${slug}/admins`,
        { ttlMs: 60_000, force, scopeKey: cacheScopeKey },
      )
      setAdmins(json.data ?? [])
    } catch {
      setAdmins([])
    } finally {
      setAdminsLoading(false)
    }
  }, [cacheScopeKey, isMember, slug, user])

  const loadHosts = useCallback(async (force = false) => {
    if (!isCommunityOwner) return
    setHostsLoading(true)
    try {
      const json = await clientGetJson<{ data: CommunityHostEntry[] }>(
        `/api/communities/${slug}/hosts`,
        { ttlMs: 60_000, force, scopeKey: cacheScopeKey },
      )
      setHosts(json.data ?? [])
    } catch {
      setHosts([])
    } finally {
      setHostsLoading(false)
    }
  }, [cacheScopeKey, isCommunityOwner, slug])

  const loadHostRequests = useCallback(async (force = false) => {
    if (!isCommunityOwner) return
    setHostRequestsLoading(true)
    try {
      const json = await clientGetJson<{ data: CommunityHostRequestEntry[] }>(
        `/api/communities/${slug}/hosts/requests`,
        { ttlMs: 30_000, force, scopeKey: cacheScopeKey },
      )
      setHostRequests(json.data ?? [])
    } catch {
      setHostRequests([])
    } finally {
      setHostRequestsLoading(false)
    }
  }, [cacheScopeKey, isCommunityOwner, slug])

  const loadReports = useCallback(async (force = false) => {
    if (!canModerate) return
    setReportsLoading(true)
    try {
      const json = await clientGetJson<{ data: { reports: HappeningReportEntry[] } }>(
        `/api/communities/${slug}/reports/happenings?status=pending`,
        { ttlMs: 30_000, force, scopeKey: cacheScopeKey },
      )
      setReports(json.data.reports ?? [])
    } catch {
      setReports([])
    } finally {
      setReportsLoading(false)
    }
  }, [cacheScopeKey, canModerate, slug])

  const loadAuditLogs = useCallback(async (force = false) => {
    if (!canModerate) return
    setAuditLogsLoading(true)
    try {
      const json = await clientGetJson<{ data: { logs: CommunityAuditLogEntry[] } }>(
        `/api/communities/${slug}/audit-logs?limit=20`,
        { ttlMs: 30_000, force, scopeKey: cacheScopeKey },
      )
      setAuditLogs(json.data.logs ?? [])
    } catch {
      setAuditLogs([])
    } finally {
      setAuditLogsLoading(false)
    }
  }, [cacheScopeKey, canModerate, slug])

  useEffect(() => {
    if (user && isMember) loadAdmins()
    else setAdmins([])
  }, [isMember, loadAdmins, user])

  useEffect(() => {
    if (isCommunityOwner) void loadHosts()
    else setHosts([])
  }, [isCommunityOwner, loadHosts])

  useEffect(() => {
    if (isCommunityOwner) void loadHostRequests()
    else setHostRequests([])
  }, [isCommunityOwner, loadHostRequests])

  useEffect(() => {
    if (canModerate) loadReports()
    else setReports([])
  }, [canModerate, loadReports])

  useEffect(() => {
    if (canModerate) loadAuditLogs()
    else setAuditLogs([])
  }, [canModerate, loadAuditLogs])

  async function toggleMembership() {
    if (!user) { router.push('/login'); return }
    if (!community) return
    setJoining(true)
    const endpoint = community.is_member
      ? `/api/communities/${slug}/leave`
      : `/api/communities/${slug}/join`
    try {
      const json = community.is_member
        ? await clientDeleteJson<{ data?: MembershipMutationResponse }>(endpoint)
        : await clientPostJson<{ data?: MembershipMutationResponse }>(endpoint, {})
      clientFetchInvalidate(`/api/communities/${slug}`, cacheScopeKey)
      clientFetchInvalidate('/api/communities')
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
    } catch (error) {
      if (!isToastHandledError(error)) {
        window.alert(error instanceof Error ? error.message : 'Membership update failed')
      }
    }
    setJoining(false)
  }

  async function toggleFollow() {
    if (!user) { router.push('/login'); return }
    if (!community) return
    setFollowing(true)
    const endpoint = community.is_following
      ? `/api/communities/${slug}/unfollow`
      : `/api/communities/${slug}/follow`
    try {
      const json = community.is_following
        ? await clientDeleteJson<{ data?: FollowMutationResponse }>(endpoint)
        : await clientPostJson<{ data?: FollowMutationResponse }>(endpoint, {})
      clientFetchInvalidate(`/api/communities/${slug}`, cacheScopeKey)
      setCommunity((prev) =>
        prev
          ? { ...prev, is_following: json.data?.is_following ?? !prev.is_following }
          : prev
      )
    } catch (error) {
      if (!isToastHandledError(error)) {
        window.alert(error instanceof Error ? error.message : 'Follow update failed')
      }
    }
    setFollowing(false)
  }

  async function toggleChildMembership(child: ChildCommunityItem) {
    if (!user) { router.push('/login'); return }
    setChildJoiningSlug(child.slug)
    try {
      const endpoint = child.is_member
        ? `/api/communities/${child.slug}/leave`
        : `/api/communities/${child.slug}/join`
      const json = child.is_member
        ? await clientDeleteJson<{ data?: MembershipMutationResponse }>(endpoint)
        : await clientPostJson<{ data?: MembershipMutationResponse }>(endpoint, {})
      clientFetchInvalidate('/api/communities')
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
    } catch (error) {
      if (!isToastHandledError(error)) {
        window.alert(error instanceof Error ? error.message : 'Membership update failed')
      }
    } finally {
      setChildJoiningSlug(null)
    }
  }

  async function assignCommunityAdmin(userId: string) {
    setMemberActionLoading(`assign-${userId}`)
    try {
      await clientPostJson(`/api/communities/${slug}/admins`, { user_id: userId })
      clientFetchInvalidate(`/api/communities/${slug}/admins`, cacheScopeKey)
      clientFetchInvalidate(`/api/communities/${slug}/audit-logs`, cacheScopeKey)
      await loadAdmins(true)
      await loadAuditLogs(true)
    } catch (error) {
      if (!isToastHandledError(error)) {
        window.alert(error instanceof Error ? error.message : 'Failed to assign community admin')
      }
    } finally {
      setMemberActionLoading(null)
    }
  }

  async function revokeCommunityAdmin(userId: string) {
    setMemberActionLoading(`revoke-${userId}`)
    try {
      await clientDeleteJson(`/api/communities/${slug}/admins/${userId}`)
      clientFetchInvalidate(`/api/communities/${slug}/admins`, cacheScopeKey)
      clientFetchInvalidate(`/api/communities/${slug}/audit-logs`, cacheScopeKey)
      await loadAdmins(true)
      await loadAuditLogs(true)
    } catch (error) {
      if (!isToastHandledError(error)) {
        window.alert(error instanceof Error ? error.message : 'Failed to revoke community admin')
      }
    } finally {
      setMemberActionLoading(null)
    }
  }

  async function assignCommunityHost(userId: string) {
    setMemberActionLoading(`assign-host-${userId}`)
    try {
      await clientPostJson(`/api/communities/${slug}/hosts`, { user_id: userId })
      clientFetchInvalidate(`/api/communities/${slug}/hosts`, cacheScopeKey)
      clientFetchInvalidate(`/api/communities/${slug}/audit-logs`, cacheScopeKey)
      await loadHosts(true)
      await loadAuditLogs(true)
    } catch (error) {
      if (!isToastHandledError(error)) {
        window.alert(error instanceof Error ? error.message : 'Failed to assign host role')
      }
    } finally {
      setMemberActionLoading(null)
    }
  }

  async function revokeCommunityHost(userId: string) {
    setMemberActionLoading(`revoke-host-${userId}`)
    try {
      await clientDeleteJson(`/api/communities/${slug}/hosts/${userId}`)
      clientFetchInvalidate(`/api/communities/${slug}/hosts`, cacheScopeKey)
      clientFetchInvalidate(`/api/communities/${slug}/audit-logs`, cacheScopeKey)
      await loadHosts(true)
      await loadAuditLogs(true)
    } catch (error) {
      if (!isToastHandledError(error)) {
        window.alert(error instanceof Error ? error.message : 'Failed to revoke host role')
      }
    } finally {
      setMemberActionLoading(null)
    }
  }

  async function requestHostRole(message?: string) {
    if (!user) { router.push('/login'); return }
    setRequestingHost(true)
    try {
      await clientPostJson(`/api/communities/${slug}/hosts/request`, { message })
      clientFetchInvalidate(`/api/communities/${slug}`, cacheScopeKey)
      await loadCommunity(true)
    } catch (error) {
      if (!isToastHandledError(error)) {
        window.alert(error instanceof Error ? error.message : 'Failed to submit host request')
      }
    } finally {
      setRequestingHost(false)
    }
  }

  async function withdrawHostRequest() {
    if (!user) return
    setRequestingHost(true)
    try {
      await clientDeleteJson(`/api/communities/${slug}/hosts/request`)
      clientFetchInvalidate(`/api/communities/${slug}`, cacheScopeKey)
      await loadCommunity(true)
    } catch (error) {
      if (!isToastHandledError(error)) {
        window.alert(error instanceof Error ? error.message : 'Failed to withdraw request')
      }
    } finally {
      setRequestingHost(false)
    }
  }

  async function respondToHostRequest(requestId: string, action: 'approve' | 'reject') {
    setMemberActionLoading(`host-req-${requestId}`)
    try {
      await clientPatchJson(`/api/communities/${slug}/hosts/requests/${requestId}`, { action })
      clientFetchInvalidate(`/api/communities/${slug}/hosts`, cacheScopeKey)
      clientFetchInvalidate(`/api/communities/${slug}/hosts/requests`, cacheScopeKey)
      clientFetchInvalidate(`/api/communities/${slug}/audit-logs`, cacheScopeKey)
      await Promise.all([loadHosts(true), loadHostRequests(true), loadAuditLogs(true)])
    } catch (error) {
      if (!isToastHandledError(error)) {
        window.alert(error instanceof Error ? error.message : 'Failed to respond to host request')
      }
    } finally {
      setMemberActionLoading(null)
    }
  }

  async function saveCommunitySettings() {
    setSavingSettings(true)
    try {
      const json = await clientPatchJson<{ data: Community }>(`/api/communities/${slug}`, {
        name: settingsForm.name.trim(),
        name_ar: settingsForm.name_ar.trim() || null,
        description: settingsForm.description.trim() || null,
        description_ar: settingsForm.description_ar.trim() || null,
        city: settingsForm.city.trim() || null,
        cover_url: settingsForm.cover_url.trim() || null,
        is_private: settingsForm.is_private,
      })
      clientFetchInvalidate(`/api/communities/${slug}`, cacheScopeKey)
      setCommunity((prev) => (prev ? { ...prev, ...json.data } : prev))
    } catch (error) {
      if (!isToastHandledError(error)) {
        window.alert(error instanceof Error ? error.message : 'Failed to update community settings')
      }
    } finally {
      setSavingSettings(false)
    }
  }

  async function toggleVerification() {
    if (!community) return
    setVerifying(true)
    try {
      const json = await clientPatchJson<{ data: Community }>(`/api/communities/${slug}`, {
        is_verified: !community.is_verified,
      })
      clientFetchInvalidate(`/api/communities/${slug}`, cacheScopeKey)
      setCommunity((prev) => (prev ? { ...prev, ...json.data } : prev))
    } catch (error) {
      if (!isToastHandledError(error)) {
        window.alert(error instanceof Error ? error.message : 'Failed to update verification status')
      }
    } finally {
      setVerifying(false)
    }
  }

  function exportMembersCsv() {
    if (!community) return
    const rows = [
      ['name', 'status', 'joined_at', 'timeout_until'],
      ...community.recent_members.map((member) => [member.display_name, 'active', member.joined_at, '']),
      ...community.timed_out_members.map((member) => [member.display_name, 'timed_out', member.joined_at, member.timeout_until ?? '']),
    ]
    const csv = rows
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${community.slug}-members.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  async function removeAllTimedOutMembers() {
    if (!community?.timed_out_members.length) return
    if (!window.confirm(`Remove ${community.timed_out_members.length} timed-out members from this community?`)) return
    setMemberActionLoading('bulk-remove-timed-out')
    try {
      for (const member of community.timed_out_members) {
        await clientPostJson(`/api/communities/${slug}/members/${member.id}/sanctions`, {
          sanction_type: 'removed',
          reason: 'Removed after timeout period by bulk moderation action',
        })
      }
      clientFetchInvalidate(`/api/communities/${slug}`, cacheScopeKey)
      clientFetchInvalidate(`/api/communities/${slug}/audit-logs`, cacheScopeKey)
      await loadCommunity(true)
      await loadAuditLogs(true)
    } catch (error) {
      if (!isToastHandledError(error)) {
        window.alert(error instanceof Error ? error.message : 'Failed to remove timed-out members')
      }
    } finally {
      setMemberActionLoading(null)
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
      await clientPostJson(`/api/communities/${slug}/members/${userId}/warnings`, {
        severity: 'medium',
        reason: reason.trim(),
      })
      clientFetchInvalidate(`/api/communities/${slug}/audit-logs`, cacheScopeKey)
      await loadAuditLogs(true)
      if (selectedMemberHistory?.member.id === userId) {
        await loadMemberHistory(selectedMemberHistory.member, true)
      }
    } catch (error) {
      if (!isToastHandledError(error)) {
        window.alert(error instanceof Error ? error.message : 'Failed to issue warning')
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
      await clientPostJson(`/api/communities/${slug}/members/${userId}/sanctions`, {
        sanction_type: sanctionType,
        reason: reason.trim(),
        ends_at: endsAt,
      })
      clientFetchInvalidate(`/api/communities/${slug}`, cacheScopeKey)
      clientFetchInvalidate(`/api/communities/${slug}/audit-logs`, cacheScopeKey)
      await loadAuditLogs(true)
      if (selectedMemberHistory?.member.id === userId) {
        await loadMemberHistory(selectedMemberHistory.member, true)
      }
    } catch (error) {
      if (!isToastHandledError(error)) {
        window.alert(error instanceof Error ? error.message : 'Failed to issue sanction')
      }
    } finally {
      setMemberActionLoading(null)
    }
  }

  async function updateReport(reportItem: HappeningReportEntry, status: 'resolved' | 'dismissed') {
    setReportActionLoading(`${reportItem.happening_id}:${reportItem.reporter_id}:${status}`)
    try {
      await clientPatchJson(`/api/communities/${slug}/reports/happenings`, {
        happening_id: reportItem.happening_id,
        reporter_id: reportItem.reporter_id,
        status,
      })
      clientFetchInvalidate(`/api/communities/${slug}/reports/happenings`, cacheScopeKey)
      clientFetchInvalidate(`/api/communities/${slug}/audit-logs`, cacheScopeKey)
      setReports((prev) => prev.filter((entry) => !(entry.happening_id === reportItem.happening_id && entry.reporter_id === reportItem.reporter_id)))
      await loadAuditLogs(true)
    } catch (error) {
      if (!isToastHandledError(error)) {
        window.alert(error instanceof Error ? error.message : 'Failed to update report')
      }
    } finally {
      setReportActionLoading(null)
    }
  }

  async function loadMemberHistory(member: CommunityDetail['recent_members'][number], force = false) {
    setHistoryLoading(true)
    try {
      const [warningsJson, sanctionsJson] = await Promise.all([
        clientGetJson<{ data: { warnings: CommunityWarningEntry[] } }>(
          `/api/communities/${slug}/members/${member.id}/warnings`,
          { ttlMs: 30_000, force, scopeKey: cacheScopeKey },
        ).catch(() => ({ data: { warnings: [] } })),
        clientGetJson<{ data: { sanctions: CommunitySanctionEntry[] } }>(
          `/api/communities/${slug}/members/${member.id}/sanctions`,
          { ttlMs: 30_000, force, scopeKey: cacheScopeKey },
        ).catch(() => ({ data: { sanctions: [] } })),
      ])

      setSelectedMemberHistory({
        member,
        warnings: warningsJson.data.warnings ?? [],
        sanctions: sanctionsJson.data.sanctions ?? [],
      })
    } finally {
      setHistoryLoading(false)
    }
  }

  if (loading) {
    return <div className="flex justify-center py-24"><TicketFlipLoader size="md" /></div>
  }

  if (!community) return null

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">

      {/* ──────── HERO ──────── */}
      <section className="mb-8">
        {/* Cover image */}
        <div className="relative h-52 sm:h-64 overflow-hidden rounded-t-2xl">
          {community.cover_url ? (
            <SafeImage src={community.cover_url} alt="" fill sizes="(max-width: 768px) 100vw, 1280px" className="object-cover" />
          ) : (
            <div
              className="w-full h-full flex items-center justify-center text-7xl"
              style={{ background: 'oklch(0.16 0.03 68)' }}
            >
              {LEVEL_ICONS[community.level]}
            </div>
          )}
        </div>

        {/* Dark ink info panel */}
        <div className="rounded-b-2xl px-6 pt-5 pb-6" style={{ background: 'var(--c-ink)' }}>
          {/* Breadcrumbs */}
          {community.ancestors.length > 0 && (
            <div className="flex items-center gap-1 text-xs mb-3 flex-wrap" style={{ color: 'oklch(1 0 0 / 0.4)' }}>
              {community.ancestors.map((a, i) => (
                <span key={a.id} className="flex items-center gap-1">
                  {i > 0 && <span className="opacity-40">›</span>}
                  <Link href={`/communities/${a.slug}`} className="hover:text-white transition-colors">
                    {LEVEL_ICONS[a.level]} {a.name}
                  </Link>
                </span>
              ))}
              <span className="opacity-40">›</span>
              <span style={{ color: 'oklch(1 0 0 / 0.65)' }}>{community.name}</span>
            </div>
          )}

          <div className="flex flex-col sm:flex-row sm:items-start gap-5">
            <div className="min-w-0 flex-1">
              {/* Nested under */}
              {directParent && (
                <div className="mb-3 flex items-center justify-between gap-3 rounded-xl px-4 py-2.5"
                  style={{ background: 'oklch(1 0 0 / 0.06)' }}>
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-widest mb-1"
                      style={{ color: 'oklch(1 0 0 / 0.35)' }}>Nested under</p>
                    <Link href={`/communities/${directParent.slug}`}
                      className="text-sm font-semibold hover:opacity-80 transition-opacity"
                      style={{ color: 'var(--c-gold)' }}>
                      {LEVEL_ICONS[directParent.level]} {directParent.name}
                    </Link>
                  </div>
                  {canCreateSibling && (
                    <Link href={`/communities/new?parent=${directParent.slug}`}
                      className="shrink-0 rounded-full px-3 py-1 text-xs font-semibold"
                      style={{ background: 'oklch(1 0 0 / 0.1)', color: 'oklch(1 0 0 / 0.65)' }}>
                      Create sibling
                    </Link>
                  )}
                </div>
              )}

              {/* Name */}
              <div className="flex items-center gap-2.5 mb-1">
                <h1 className="text-3xl sm:text-4xl font-bold tracking-tight leading-none text-white"
                  style={{ fontFamily: 'var(--font-display)' }}>
                  {community.name}
                </h1>
                {community.is_verified && (
                  <span className="text-xl" style={{ color: 'var(--c-gold)' }} title="Verified">✓</span>
                )}
              </div>
              {community.name_ar && (
                <p className="text-sm mt-1" dir="rtl" style={{ color: 'oklch(1 0 0 / 0.5)' }}>
                  {community.name_ar}
                </p>
              )}

              {/* Stats */}
              <div className="flex flex-wrap items-center gap-3 mt-3 text-sm">
                <span style={{ color: 'oklch(1 0 0 / 0.5)' }}>{LEVEL_ICONS[community.level]} {community.level}</span>
                {community.city && (
                  <span style={{ color: 'oklch(1 0 0 / 0.5)' }}>📍 {community.city}</span>
                )}
                <span className="font-semibold tabular-nums" style={{ color: 'var(--c-gold)' }}>
                  {community.member_count.toLocaleString()} members
                </span>
                <span style={{ color: 'oklch(1 0 0 / 0.5)' }}>{community.event_count} events</span>
              </div>

              {/* Role badges */}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {community.is_member && (
                  <span className="rounded-full px-2.5 py-0.5 text-[11px] font-bold"
                    style={{ background: 'oklch(0.78 0.18 72 / 0.18)', color: 'var(--c-gold)' }}>
                    Member
                  </span>
                )}
                {community.member_role && (
                  <span className="rounded-full px-2.5 py-0.5 text-[11px] font-bold"
                    style={{ background: 'oklch(0.78 0.18 72 / 0.15)', color: 'var(--c-gold)' }}>
                    {community.member_role}
                  </span>
                )}
                {community.approval_status !== 'approved' && (
                  <span className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
                    style={{ background: 'oklch(0.7 0.15 220 / 0.15)', color: 'oklch(0.75 0.1 220)' }}>
                    {community.approval_status === 'pending' ? 'Pending approval' : 'Dismissed'}
                  </span>
                )}
                {isPlatformAdmin && (
                  <button onClick={toggleVerification} disabled={verifying}
                    className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold transition-opacity hover:opacity-80 cursor-pointer"
                    style={{
                      background: community.is_verified ? 'oklch(0.78 0.18 72 / 0.2)' : 'oklch(1 0 0 / 0.08)',
                      color: community.is_verified ? 'var(--c-gold)' : 'oklch(1 0 0 / 0.6)',
                    }}>
                    {verifying ? '...' : community.is_verified ? 'Verified · Unverify' : 'Verify community'}
                  </button>
                )}
              </div>

              {/* Description */}
              {community.description && (
                <p className="mt-4 text-sm leading-relaxed max-w-prose"
                  style={{ color: 'oklch(1 0 0 / 0.6)' }}>
                  {community.description}
                </p>
              )}

              {/* City members preview */}
              {!community.is_member && community.viewer_city && community.city_members_preview.length > 0 && (
                <div className="mt-4 rounded-xl px-4 py-3" style={{ background: 'oklch(1 0 0 / 0.06)' }}>
                  <p className="text-sm font-semibold text-white mb-2">
                    People from {community.viewer_city} are already here
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {community.city_members_preview.map((m) => (
                      <span key={m.id} className="rounded-full px-2.5 py-1 text-xs font-medium"
                        style={{ background: 'oklch(1 0 0 / 0.1)', color: 'oklch(1 0 0 / 0.75)' }}>
                        {m.display_name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* CTA buttons */}
            <div className="flex sm:flex-col gap-2 sm:min-w-[170px]">
              <button
                onClick={toggleMembership}
                disabled={joining}
                className="flex-1 sm:flex-none rounded-xl px-5 py-2.5 text-sm font-semibold transition-all cursor-pointer"
                style={community.is_member ? {
                  background: 'oklch(1 0 0 / 0.08)',
                  color: 'oklch(1 0 0 / 0.7)',
                } : {
                  background: 'var(--c-gold)',
                  color: 'var(--c-ink)',
                }}
              >
                {joining ? <Spinner size="sm" /> : community.is_member ? 'Joined · Leave' : 'Join community'}
              </button>
              <button
                onClick={toggleFollow}
                disabled={following}
                className="flex-1 sm:flex-none rounded-xl border px-5 py-2.5 text-sm font-semibold transition-all cursor-pointer"
                style={community.is_following ? {
                  borderColor: 'oklch(0.65 0.15 220 / 0.4)',
                  background: 'oklch(0.65 0.15 220 / 0.1)',
                  color: 'oklch(0.78 0.1 220)',
                } : {
                  borderColor: 'oklch(1 0 0 / 0.18)',
                  background: 'transparent',
                  color: 'oklch(1 0 0 / 0.65)',
                }}
              >
                {following ? <Spinner size="sm" /> : community.is_following ? 'Following' : 'Follow updates'}
              </button>

              {canRequestHostRole && (
                <button
                  onClick={viewerHostRequestStatus === 'pending' ? withdrawHostRequest : () => requestHostRole()}
                  disabled={requestingHost || viewerHostRequestStatus === 'rejected'}
                  className="flex-1 sm:flex-none rounded-xl border px-5 py-2.5 text-sm font-semibold transition-all cursor-pointer"
                  style={viewerHostRequestStatus === 'pending' ? {
                    borderColor: 'oklch(0.75 0.12 45 / 0.5)',
                    background: 'oklch(0.75 0.12 45 / 0.08)',
                    color: 'oklch(0.85 0.1 45)',
                  } : viewerHostRequestStatus === 'rejected' ? {
                    borderColor: 'oklch(0.6 0.15 25 / 0.3)',
                    background: 'oklch(0.6 0.15 25 / 0.06)',
                    color: 'oklch(0.7 0.1 25 / 0.7)',
                  } : {
                    borderColor: 'oklch(0.65 0.2 295 / 0.4)',
                    background: 'oklch(0.65 0.2 295 / 0.08)',
                    color: 'oklch(0.78 0.15 295)',
                  }}
                >
                  {requestingHost
                    ? <Spinner size="sm" />
                    : viewerHostRequestStatus === 'pending'
                    ? 'Request pending · Withdraw'
                    : viewerHostRequestStatus === 'rejected'
                    ? 'Request rejected'
                    : 'Request to host'}
                </button>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ──────── MAIN: content + sidebar ──────── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_288px] gap-6 items-start">

        {/* ── LEFT: PRIMARY CONTENT ── */}
        <div className="space-y-6 min-w-0">

          {/* Settings (owner, collapsible) */}
          {isCommunityOwner && (
            <details className="group rounded-2xl border border-slate-100 bg-white shadow-sm">
              <summary className="flex cursor-pointer select-none list-none items-center justify-between p-5">
                <div>
                  <p className="text-base font-semibold text-gray-900">Community Settings</p>
                  <p className="mt-0.5 text-xs text-gray-400">Name, description, visibility</p>
                </div>
                <svg className="h-5 w-5 text-gray-400 transition-transform duration-200 group-open:rotate-180"
                  fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </summary>
              <div className="border-t border-gray-100 px-5 pb-5 pt-4">
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
                <div className="mt-4 flex justify-end">
                  <button onClick={saveCommunitySettings} disabled={savingSettings || !settingsForm.name.trim()}
                    className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-50">
                    {savingSettings ? 'Saving...' : 'Save changes'}
                  </button>
                </div>
              </div>
            </details>
          )}

          {/* ── HAPPENINGS (primary content) ── */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-xl font-bold text-gray-900" style={{ fontFamily: 'var(--font-display)' }}>
                  What&apos;s Happening
                </h2>
                <p className="text-xs text-gray-400 mt-0.5">Spontaneous, time-limited posts from members</p>
              </div>
              {canParticipateInHappenings && !showPostForm && (
                <button onClick={() => setShowPostForm(true)}
                  className="rounded-xl px-4 py-2 text-sm font-semibold transition-colors cursor-pointer"
                  style={{ background: 'var(--c-gold)', color: 'var(--c-ink)' }}>
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
                    onShowParticipants={(target) => setParticipantsHappeningId(target.id)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* ── EVENTS ── */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-900" style={{ fontFamily: 'var(--font-display)' }}>
                Upcoming Events
              </h2>
              <div className="flex items-center gap-3">
                {isCurrentUserHost && (
                  <Link href={`/organizer/events/new?community=${slug}`}
                    className="text-xs font-semibold bg-violet-600 text-white px-3 py-1.5 rounded-full hover:bg-violet-700 transition-colors">
                    + Create session
                  </Link>
                )}
                {!isCurrentUserHost && !isIndividualOrganizer && profile?.role === 'organizer' && (
                  <Link href={`/organizer/events/new?community=${slug}`}
                    className="text-xs font-semibold bg-brand-600 text-white px-3 py-1.5 rounded-full hover:bg-brand-700 transition-colors">
                    + Create event
                  </Link>
                )}
                <Link href={`/events?community=${slug}`} className="text-sm text-brand-600 hover:underline">
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
                  <Link key={ev.id} href={`/events/${ev.id}`}
                    className="flex gap-4 p-4 bg-white rounded-xl border border-gray-100 hover:border-brand-200 hover:shadow-sm transition-all">
                    {ev.cover_image_url ? (
                      <span className="relative w-20 h-16 rounded-lg overflow-hidden shrink-0">
                        <SafeImage src={ev.cover_image_url} alt="" fill sizes="80px" className="object-cover" />
                      </span>
                    ) : (
                      <div className="w-20 h-16 rounded-lg bg-brand-50 flex items-center justify-center text-2xl shrink-0">📅</div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-gray-900 line-clamp-1">{ev.title}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{formatDate(ev.start_at)}</p>
                      <p className="text-xs text-gray-400 mt-0.5">📍 {ev.city}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <span className={`text-xs font-semibold px-2 py-1 rounded-full ${ev.is_free ? 'bg-green-50 text-green-700' : 'bg-brand-50 text-brand-700'}`}>
                        {ev.is_free ? 'Free' : `${ev.price} ${ev.currency}`}
                      </span>
                    </div>
                  </Link>
                ))}
                {nextCursor && (
                  <div className="text-center pt-4">
                    <button onClick={() => loadEvents(nextCursor)} disabled={eventsLoading} className="btn-secondary text-sm">
                      {eventsLoading ? <Spinner size="sm" /> : 'Load more events'}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Moderation (owners & mods only, loaded in its own client chunk) */}
          {(isCommunityOwner || canModerate) && (
            <CommunityModerationPanel
              community={community}
              user={user}
              admins={admins}
              adminsLoading={adminsLoading}
              hosts={hosts}
              hostsLoading={hostsLoading}
              hostRequests={hostRequests}
              hostRequestsLoading={hostRequestsLoading}
              reports={reports}
              reportsLoading={reportsLoading}
              auditLogs={auditLogs}
              auditLogsLoading={auditLogsLoading}
              memberActionLoading={memberActionLoading}
              reportActionLoading={reportActionLoading}
              selectedMemberHistory={selectedMemberHistory}
              historyLoading={historyLoading}
              isCommunityOwner={isCommunityOwner}
              canModerate={canModerate}
              onAssignAdmin={assignCommunityAdmin}
              onRevokeAdmin={revokeCommunityAdmin}
              onAssignHost={assignCommunityHost}
              onRevokeHost={revokeCommunityHost}
              onRespondToHostRequest={respondToHostRequest}
              onIssueWarning={issueWarning}
              onIssueSanction={issueSanction}
              onUpdateReport={updateReport}
              onLoadMemberHistory={loadMemberHistory}
              onExportCsv={exportMembersCsv}
              onRemoveTimedOut={removeAllTimedOutMembers}
              onRefreshReports={() => void loadReports(true)}
              onRefreshAuditLogs={() => void loadAuditLogs(true)}
              onClearMemberHistory={() => setSelectedMemberHistory(null)}
            />
          )}
        </div>

        {/* ── RIGHT: SIDEBAR ── */}
        <aside className="space-y-4 lg:sticky lg:top-20">

          {/* Members */}
          <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-gray-900">
                Members
                <span className="ml-2 text-xs font-normal text-gray-400">{community.member_count.toLocaleString()}</span>
              </h3>
              {isCommunityOwner && (
                <button onClick={exportMembersCsv}
                  className="text-xs font-medium text-gray-400 hover:text-gray-600 transition-colors cursor-pointer">
                  Export CSV
                </button>
              )}
            </div>
            {community.recent_members.length === 0 ? (
              <p className="text-xs text-gray-400">No members yet.</p>
            ) : (
              <div className="space-y-2.5">
                {community.recent_members.slice(0, 8).map((member) => (
                  <div key={member.id} className="flex items-center gap-2.5">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-100 text-xs font-semibold text-brand-700">
                      {member.avatar_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={member.avatar_url} alt="" loading="lazy" className="h-full w-full object-cover" />
                      ) : (
                        member.display_name.slice(0, 1).toUpperCase()
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-gray-900 truncate">{member.display_name}</p>
                      {admins.some((entry) => entry.user_id === member.id && entry.role === 'community_admin') && (
                        <p className="text-[10px] font-semibold text-brand-600">Admin</p>
                      )}
                      {community.owner_user_id === member.id && (
                        <p className="text-[10px] font-semibold text-amber-600">Owner</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Sub-communities */}
          <div className="rounded-2xl border border-violet-100 bg-violet-50/40 p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-gray-900">Sub-communities</h3>
              {canCreateChildHere && (
                <Link
                  href={community.level === 'country' ? `/communities/new?root=${slug}` : `/communities/new?parent=${slug}`}
                  className="text-xs font-medium text-violet-600 hover:text-violet-700 transition-colors">
                  + Create
                </Link>
              )}
            </div>
            {childrenLoading ? (
              <div className="flex justify-center py-4"><Spinner /></div>
            ) : children.length === 0 ? (
              <p className="text-xs text-gray-400">No sub-communities yet.</p>
            ) : (
              <div className="space-y-2.5">
                {children.map((child) => (
                  <div key={child.id} className="flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <Link href={`/communities/${child.slug}`}
                        className="text-xs font-semibold text-gray-900 hover:text-brand-600 truncate block">
                        {child.name}
                      </Link>
                      <p className="text-[10px] text-gray-400">{child.member_count.toLocaleString()} members</p>
                    </div>
                    <button
                      onClick={() => toggleChildMembership(child)}
                      disabled={childJoiningSlug === child.slug}
                      className={`shrink-0 rounded-lg px-2.5 py-1 text-[11px] font-semibold cursor-pointer ${child.is_member
                          ? 'border border-emerald-200 bg-emerald-50 text-emerald-700'
                          : 'bg-brand-600 text-white'
                        }`}>
                      {childJoiningSlug === child.slug ? '...' : child.is_member ? 'Joined' : 'Join'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recent Activity */}
          <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
            <h3 className="text-sm font-bold text-gray-900 mb-3">Recent Activity</h3>
            {community.activity.length === 0 ? (
              <p className="text-xs text-gray-400">No activity yet.</p>
            ) : (
              <div className="space-y-2.5">
                {community.activity.map((item) => {
                  const row = (
                    <div className="flex items-start gap-2.5">
                      <span className="text-base shrink-0 mt-0.5">{item.type === 'member_joined' ? '👋' : '🗓️'}</span>
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-gray-900 leading-snug">{item.title}</p>
                        <p className="text-[10px] text-gray-400 mt-0.5">{formatDate(item.created_at)}</p>
                      </div>
                    </div>
                  )
                  return item.href ? <Link key={item.id} href={item.href}>{row}</Link> : <div key={item.id}>{row}</div>
                })}
              </div>
            )}
          </div>
        </aside>
      </div>

      <HappeningParticipantsModal
        open={participantsHappeningId !== null}
        happeningId={participantsHappeningId}
        onClose={() => setParticipantsHappeningId(null)}
      />
    </div>
  )
}
