import { useEffect, useState, useRef } from 'react'
import {
  View, Text, ScrollView, StyleSheet, Modal,
  TouchableOpacity, ActivityIndicator, Image, Alert, TextInput,
  KeyboardAvoidingView, Platform, Linking,
} from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { apiGet, apiPost, apiDelete, apiPatch } from '@/lib/api'
import { useAuth } from '@/contexts/auth-context'
import { useLocale } from '@/contexts/locale-context'
import { Spinner } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { LocationPickerModal, type PickedLocation } from '@/components/communities/LocationPickerModal'
import { HappeningCommentsSheet } from '@/components/happenings/HappeningCommentsSheet'
import { formatDate } from '@/lib/utils'
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadow } from '@/theme'
import type { Community, CommunityLevel, CommunityRole, Event, HappeningType, HappeningWithAuthor } from '@/types/database'

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
  recent_events: Pick<Event, 'id' | 'title' | 'title_ar' | 'cover_image_url' | 'start_at' | 'city' | 'is_free' | 'price' | 'currency'>[]
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
type FollowMutationResponse = {
  is_following?: boolean
}
type EventItem = Pick<Event, 'id' | 'title' | 'title_ar' | 'cover_image_url' | 'start_at' | 'city' | 'is_free' | 'price' | 'currency'>
type CommunityAdminEntry = {
  user_id: string
  role: CommunityRole
  joined_at: string
  profile: { id: string; display_name: string; avatar_url: string | null } | null
}
type HappeningReportEntry = {
  happening_id: string
  reporter_id: string
  reason: string
  details: string | null
  status: 'pending' | 'resolved' | 'dismissed'
  created_at: string
  happening: { id: string; body: string; author_id: string; created_at: string; author: { id: string; display_name: string; avatar_url: string | null } | null } | null
  reporter: { id: string; display_name: string; avatar_url: string | null } | null
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
type ChildCommunityItem = Community & {
  is_member: boolean
  member_role: CommunityRole | null
  member_status: 'active' | 'timed_out' | 'removed' | 'banned' | null
}

const LEVEL_META: Record<CommunityLevel, { label: string; icon: keyof typeof Ionicons.glyphMap; tint: string; bg: string; accent: string }> = {
  micro: { label: 'Micro', icon: 'home-outline', tint: '#166534', bg: '#dcfce7', accent: '#16a34a' },
  interest: { label: 'Interest', icon: 'sparkles-outline', tint: '#6d28d9', bg: '#ede9fe', accent: '#7c3aed' },
  district: { label: 'District', icon: 'business-outline', tint: '#92400e', bg: '#fef3c7', accent: '#d97706' },
  city: { label: 'City', icon: 'location-outline', tint: '#1e40af', bg: '#dbeafe', accent: '#2563eb' },
  country: { label: 'Country', icon: 'earth-outline', tint: '#9f1239', bg: '#ffe4e6', accent: '#e11d48' },
}

export default function CommunityDetailScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>()
  const { user, profile } = useAuth()
  const { locale, t } = useLocale()
  const router = useRouter()
  const isRTL = locale === 'ar'

  function tx(key: string, vars?: Record<string, string | number>) {
    let text = t(key)
    if (!vars) return text
    for (const [name, value] of Object.entries(vars)) {
      text = text.replace(`{${name}}`, String(value))
    }
    return text
  }

  function communityLevelLabel(level: CommunityLevel) {
    return t(`community.level.${level}`)
  }

  function communityRoleLabel(role: CommunityRole) {
    return t(`community_detail.role.${role}`)
  }

  function memberStatusLabel(status: NonNullable<CommunityDetail['member_status']>) {
    return t(`community_detail.member_status.${status}`)
  }

  function approvalStatusLabel(status: CommunityDetail['approval_status']) {
    return status === 'pending'
      ? t('community_detail.pending_admin_approval')
      : t('community_detail.dismissed_by_admin')
  }

  function happeningTypeLabel(type: HappeningType) {
    return t(`community_detail.happening_type.${type}`)
  }

  function moderationModeLabel(mode: 'warning' | 'timeout' | 'removed' | 'banned') {
    return t(`community_detail.moderation_mode.${mode}`)
  }

  function moderationSeverityLabel(severity: 'low' | 'medium' | 'high') {
    return t(`community_detail.severity.${severity}`)
  }

  const hasLoadedOnce = useRef(false)
  const [community, setCommunity] = useState<CommunityDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [joining, setJoining] = useState(false)
  const [following, setFollowing] = useState(false)
  const [requestingHost, setRequestingHost] = useState(false)
  const [events, setEvents] = useState<EventItem[]>([])
  const [eventsLoading, setEventsLoading] = useState(false)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [children, setChildren] = useState<ChildCommunityItem[]>([])
  const [childrenLoading, setChildrenLoading] = useState(false)
  const [childJoiningSlug, setChildJoiningSlug] = useState<string | null>(null)

  // Happenings state
  const [happenings, setHappenings] = useState<HappeningWithAuthor[]>([])
  const [happeningsLoading, setHappeningsLoading] = useState(false)
  const [showPostModal, setShowPostModal] = useState(false)
  const [postType, setPostType] = useState<HappeningType>('open_invite')
  const [postBody, setPostBody] = useState('')
  const [postExpiry, setPostExpiry] = useState(6)
  const [posting, setPosting] = useState(false)
  const [admins, setAdmins] = useState<CommunityAdminEntry[]>([])
  const [adminsLoading, setAdminsLoading] = useState(false)
  const [reports, setReports] = useState<HappeningReportEntry[]>([])
  const [reportsLoading, setReportsLoading] = useState(false)
  const [hasModerationAccess, setHasModerationAccess] = useState(false)
  const [memberActionLoading, setMemberActionLoading] = useState<string | null>(null)
  const [reportActionLoading, setReportActionLoading] = useState<string | null>(null)
  const [showLocationPicker, setShowLocationPicker] = useState(false)
  const [postLocation, setPostLocation] = useState<PickedLocation | null>(null)
  const [showModerationModal, setShowModerationModal] = useState(false)
  const [moderationTarget, setModerationTarget] = useState<CommunityDetail['recent_members'][number] | null>(null)
  const [moderationMode, setModerationMode] = useState<'warning' | 'timeout' | 'removed' | 'banned'>('warning')
  const [moderationReason, setModerationReason] = useState('')
  const [moderationSeverity, setModerationSeverity] = useState<'low' | 'medium' | 'high'>('medium')
  const [moderationDurationHours, setModerationDurationHours] = useState(24)
  const [showHistoryModal, setShowHistoryModal] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [showActivityAccordion, setShowActivityAccordion] = useState(false)
  const [showModeratorAccordion, setShowModeratorAccordion] = useState(false)
  const [selectedHappeningForComments, setSelectedHappeningForComments] = useState<(HappeningWithAuthor & { community: Pick<Community, 'id' | 'name' | 'name_ar' | 'slug' | 'level'> }) | null>(null)
  const [selectedMemberHistory, setSelectedMemberHistory] = useState<{
    member: CommunityDetail['recent_members'][number]
    warnings: CommunityWarningEntry[]
    sanctions: CommunitySanctionEntry[]
  } | null>(null)

  const memberRole = community?.member_role ?? null
  const memberStatus = community?.member_status ?? null
  const derivedRole = user?.id
    ? community?.owner_user_id === user.id
      ? 'owner'
      : admins.find((entry) => entry.user_id === user.id)?.role ?? null
    : null
  const effectiveRole = memberRole ?? derivedRole ?? (hasModerationAccess ? 'community_admin' : null)
  const isPlatformAdmin = profile?.role === 'admin'
  const isCommunityOwner = effectiveRole === 'owner' || isPlatformAdmin
  const canModerate = isCommunityOwner || effectiveRole === 'community_admin'
  const isIndividualOrganizer = community?.viewer_is_individual_organizer ?? false
  const isCurrentUserHost = community?.is_host ?? false
  const viewerHostRequestStatus = community?.viewer_host_request_status ?? null
  const canRequestHostRole = !isCurrentUserHost
    && !!community?.is_member
    && memberStatus === 'active'
    && isIndividualOrganizer
    && !isCommunityOwner
  const canParticipateInHappenings = memberStatus ? memberStatus === 'active' : !!community?.is_member
  const directParent = community && community.ancestors.length > 0
    ? community.ancestors[community.ancestors.length - 1]
    : null
  const canCreateSibling = !!directParent && (isPlatformAdmin || community?.level !== 'city')
  const canCreateChildHere = !!community && (isPlatformAdmin || community.level !== 'country')

  function openLocationPicker() {
    setShowPostModal(false)
    setTimeout(() => setShowLocationPicker(true), 0)
  }

  function closeLocationPicker(reopenPostModal = true) {
    setShowLocationPicker(false)
    if (reopenPostModal) {
      setTimeout(() => setShowPostModal(true), 0)
    }
  }

  useEffect(() => {
    if (!hasLoadedOnce.current) setLoading(true)
    apiGet<CommunityDetail>(`/api/communities/${slug}`)
      .then(({ data }) => { if (data) setCommunity(data); else router.back() })
      .finally(() => {
        hasLoadedOnce.current = true
        setLoading(false)
      })
  // user?.id in deps: re-fetches when session loads (different cache key) so viewer-specific fields populate
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, user?.id])

  async function loadEvents(cursor?: string) {
    if (eventsLoading) return
    setEventsLoading(true)
    const params = new URLSearchParams({ per_page: '10' })
    if (cursor) params.set('cursor', cursor)
    const { data } = await apiGet<{ events: EventItem[]; next_cursor: string | null }>(`/api/communities/${slug}/events?${params}`)
    if (data) {
      setEvents((prev) => cursor ? [...prev, ...data.events] : data.events)
      setNextCursor(data.next_cursor)
    }
    setEventsLoading(false)
  }

  useEffect(() => { if (community) loadEvents() }, [community?.id])

  async function loadChildren() {
    setChildrenLoading(true)
    const { data } = await apiGet<{ children: ChildCommunityItem[] }>(`/api/communities/${slug}/children`)
    if (data) setChildren(data.children ?? [])
    setChildrenLoading(false)
  }

  useEffect(() => { if (community) loadChildren() }, [community?.id])

  async function loadHappenings() {
    setHappeningsLoading(true)
    const { data } = await apiGet<{ happenings: HappeningWithAuthor[] }>(`/api/communities/${slug}/happenings?per_page=20`)
    if (data) setHappenings(data.happenings ?? [])
    setHappeningsLoading(false)
  }

  useEffect(() => { if (community) loadHappenings() }, [community?.id])

  async function loadAdmins() {
    if (!user || !community?.is_member) return
    setAdminsLoading(true)
    const { data, error } = await apiGet<CommunityAdminEntry[]>(`/api/communities/${slug}/admins`)
    if (!error) {
      setAdmins(data ?? [])
      if ((data ?? []).some((entry) => entry.user_id === user.id && (entry.role === 'owner' || entry.role === 'community_admin'))) {
        setHasModerationAccess(true)
      }
    }
    setAdminsLoading(false)
  }

  async function loadReports(force = false) {
    if (!force && !canModerate) return
    setReportsLoading(true)
    const { data, error } = await apiGet<{ reports: HappeningReportEntry[] }>(`/api/communities/${slug}/reports/happenings?status=pending`)
    if (!error) {
      setReports(data?.reports ?? [])
      setHasModerationAccess(true)
    }
    setReportsLoading(false)
  }

  useEffect(() => {
    if (user && community?.is_member) loadAdmins()
    else setAdmins([])
  }, [slug, community?.is_member, user?.id, canModerate])

  useEffect(() => {
    if (user && community?.is_member) {
      void loadReports(true)
    } else {
      setHasModerationAccess(false)
    }
  }, [slug, community?.is_member, user?.id])

  useEffect(() => {
    if (canModerate) loadReports()
    else setReports([])
  }, [slug, canModerate])

  async function submitHappening() {
    if (!postBody.trim()) return
    if (!canParticipateInHappenings) {
      Alert.alert(t('community_detail.restricted_title'), t('community_detail.restricted_post_happening'))
      return
    }
    setPosting(true)
    const { data, error } = await apiPost<HappeningWithAuthor>(`/api/communities/${slug}/happenings`, {
      type: postType, body: postBody.trim(), expires_in_hours: postExpiry,
      ...(postLocation
        ? {
          lat: postLocation.lat,
          lng: postLocation.lng,
          location_label: postLocation.label,
        }
        : {}),
    })
    if (error) {
      Alert.alert(t('common.error'), error)
    } else if (data) {
      setHappenings((prev) => [data, ...prev])
      setShowPostModal(false)
      setPostBody('')
      setPostType('open_invite')
      setPostExpiry(6)
      setPostLocation(null)
    }
    setPosting(false)
  }

  async function toggleHappeningRsvp(h: HappeningWithAuthor) {
    if (!user) { router.push('/auth/login' as any); return }
    if (!canParticipateInHappenings) {
      Alert.alert(t('community_detail.restricted_title'), t('community_detail.restricted_interact_happening'))
      return
    }
    const { data } = h.user_has_rsvp
      ? await apiDelete<{ rsvp: boolean; rsvp_count: number }>(`/api/happenings/${h.id}/rsvp`)
      : await apiPost<{ rsvp: boolean; rsvp_count: number }>(`/api/happenings/${h.id}/rsvp`, {})
    if (data) {
      setHappenings((prev) => prev.map((item) =>
        item.id === h.id ? { ...item, user_has_rsvp: data.rsvp, rsvp_count: data.rsvp_count } : item
      ))
    }
  }

  function reportHappening(id: string) {
    Alert.alert(
      t('community_detail.report_happening_title'),
      t('community_detail.report_happening_body'),
      [
        { text: t('community_detail.report_reason_spam'), onPress: () => submitReport(id, 'spam') },
        { text: t('community_detail.report_reason_inappropriate'), onPress: () => submitReport(id, 'inappropriate') },
        { text: t('community_detail.report_reason_harassment'), onPress: () => submitReport(id, 'harassment') },
        { text: t('common.cancel'), style: 'cancel' },
      ]
    )
  }

  async function submitReport(id: string, reason: string) {
    const { error } = await apiPost(`/api/happenings/${id}/report`, { reason })
    if (error) Alert.alert(t('common.error'), t('community_detail.report_submit_failed'))
    else Alert.alert(t('community_detail.reported_title'), t('community_detail.reported_body'))
  }

  async function toggleHappeningReact(h: HappeningWithAuthor) {
    if (!user) { router.push('/auth/login' as any); return }
    if (!canParticipateInHappenings) {
      Alert.alert(t('community_detail.restricted_title'), t('community_detail.restricted_interact_happening'))
      return
    }
    const { data } = h.user_has_reacted
      ? await apiDelete<{ reacted: boolean; reaction_count: number }>(`/api/happenings/${h.id}/react`)
      : await apiPost<{ reacted: boolean; reaction_count: number }>(`/api/happenings/${h.id}/react`, { emoji: '👍' })
    if (data) {
      setHappenings((prev) => prev.map((item) =>
        item.id === h.id ? { ...item, user_has_reacted: data.reacted, reaction_count: data.reaction_count } : item
      ))
    }
  }

  async function toggleMembership() {
    if (!user) { router.push('/auth/login' as any); return }
    if (!community) return
    setJoining(true)
    const { data, error } = community.is_member
      ? await apiDelete<MembershipMutationResponse>(`/api/communities/${slug}/leave`)
      : await apiPost<MembershipMutationResponse>(`/api/communities/${slug}/join`, {})
    if (error) {
      Alert.alert(t('common.error'), error)
    } else {
      setCommunity((prev) => prev
          ? {
              ...prev,
              is_member: data?.is_member ?? !prev.is_member,
              member_role: data?.member_role ?? (data?.is_member ? prev.member_role : null),
              member_status: data?.member_status ?? (data?.is_member ? prev.member_status ?? 'active' : null),
              member_count: data?.member_count ?? (!prev.is_member ? prev.member_count + 1 : Math.max(prev.member_count - 1, 0)),
            }
        : prev
      )
      if (data?.message) Alert.alert(t('community_detail.notice_title'), data.message)
    }
    setJoining(false)
  }

  async function toggleFollow() {
    if (!user) { router.push('/auth/login' as any); return }
    if (!community) return
    setFollowing(true)
    const { data, error } = community.is_following
      ? await apiDelete<FollowMutationResponse>(`/api/communities/${slug}/unfollow`)
      : await apiPost<FollowMutationResponse>(`/api/communities/${slug}/follow`, {})
    if (error) {
      Alert.alert(t('common.error'), error)
    } else {
      setCommunity((prev) =>
        prev
          ? { ...prev, is_following: data?.is_following ?? !prev.is_following }
          : prev
      )
    }
    setFollowing(false)
  }

  async function requestHostRole() {
    if (!user || !community) return
    setRequestingHost(true)
    const { error } = await apiPost(`/api/communities/${slug}/hosts/request`, {})
    if (error) {
      Alert.alert(t('common.error'), error)
    } else {
      setCommunity((prev) => prev ? { ...prev, viewer_host_request_status: 'pending' } : prev)
    }
    setRequestingHost(false)
  }

  async function withdrawHostRequest() {
    if (!user || !community) return
    setRequestingHost(true)
    const { error } = await apiDelete(`/api/communities/${slug}/hosts/request`)
    if (error) {
      Alert.alert(t('common.error'), error)
    } else {
      setCommunity((prev) => prev ? { ...prev, viewer_host_request_status: null } : prev)
    }
    setRequestingHost(false)
  }

  async function toggleChildMembership(child: ChildCommunityItem) {
    if (!user) { router.push('/auth/login' as any); return }
    setChildJoiningSlug(child.slug)
    const { data, error } = child.is_member
      ? await apiDelete<MembershipMutationResponse>(`/api/communities/${child.slug}/leave`)
      : await apiPost<MembershipMutationResponse>(`/api/communities/${child.slug}/join`, {})

    if (error) {
      Alert.alert(t('common.error'), error)
    } else {
      setChildren((prev) => prev.map((entry) =>
        entry.id === child.id
          ? {
              ...entry,
              is_member: data?.is_member ?? !entry.is_member,
              member_role: data?.member_role ?? (data?.is_member ? entry.member_role : null),
              member_status: data?.member_status ?? (data?.is_member ? entry.member_status ?? 'active' : null),
              member_count: data?.member_count ?? (!entry.is_member ? entry.member_count + 1 : Math.max(entry.member_count - 1, 0)),
            }
          : entry
      ))
    }
    setChildJoiningSlug(null)
  }

  async function assignCommunityAdmin(userId: string) {
    setMemberActionLoading(`assign-${userId}`)
    const { error } = await apiPost(`/api/communities/${slug}/admins`, { user_id: userId })
    if (error) Alert.alert(t('common.error'), error)
    else await loadAdmins()
    setMemberActionLoading(null)
  }

  async function revokeCommunityAdmin(userId: string) {
    setMemberActionLoading(`revoke-${userId}`)
    const { error } = await apiDelete(`/api/communities/${slug}/admins/${userId}`)
    if (error) Alert.alert(t('common.error'), error)
    else await loadAdmins()
    setMemberActionLoading(null)
  }

  function openModerationComposer(
    member: CommunityDetail['recent_members'][number],
    mode: 'warning' | 'timeout' | 'removed' | 'banned'
  ) {
    setModerationTarget(member)
    setModerationMode(mode)
    setModerationReason('')
    setModerationSeverity('medium')
    setModerationDurationHours(24)
    setShowModerationModal(true)
  }

  async function submitModerationAction() {
    if (!moderationTarget) return
    if (!moderationReason.trim()) {
      Alert.alert(t('community_detail.reason_required_title'), t('community_detail.reason_required_body'))
      return
    }

    const loadingKey = moderationMode === 'warning'
      ? `warn-${moderationTarget.id}`
      : `${moderationMode}-${moderationTarget.id}`
    setMemberActionLoading(loadingKey)

    try {
      if (moderationMode === 'warning') {
        const { error } = await apiPost(`/api/communities/${slug}/members/${moderationTarget.id}/warnings`, {
          severity: moderationSeverity,
          reason: moderationReason.trim(),
        })
        if (error) {
          Alert.alert(t('common.error'), error)
          return
        }
        Alert.alert(t('community_detail.warning_issued_title'), t('community_detail.warning_issued_body'))
      } else {
        const endsAt = moderationMode === 'timeout'
          ? new Date(Date.now() + moderationDurationHours * 60 * 60 * 1000).toISOString()
          : null

        const { error } = await apiPost(`/api/communities/${slug}/members/${moderationTarget.id}/sanctions`, {
          sanction_type: moderationMode,
          reason: moderationReason.trim(),
          ends_at: endsAt,
        })
        if (error) {
          Alert.alert(t('common.error'), error)
          return
        }
        Alert.alert(t('community_detail.action_completed_title'), tx('community_detail.action_completed_body', { action: moderationModeLabel(moderationMode) }))
      }

      setShowModerationModal(false)
      if (showHistoryModal && selectedMemberHistory?.member.id === moderationTarget.id) {
        await loadMemberHistory(moderationTarget, true)
      }
    } finally {
      setMemberActionLoading(null)
    }
  }

  async function loadMemberHistory(member: CommunityDetail['recent_members'][number], keepModalOpen = false) {
    setHistoryLoading(true)
    const [warningsRes, sanctionsRes] = await Promise.all([
      apiGet<{ warnings: CommunityWarningEntry[] }>(`/api/communities/${slug}/members/${member.id}/warnings`),
      apiGet<{ sanctions: CommunitySanctionEntry[] }>(`/api/communities/${slug}/members/${member.id}/sanctions`),
    ])

    setSelectedMemberHistory({
      member,
      warnings: warningsRes.data?.warnings ?? [],
      sanctions: sanctionsRes.data?.sanctions ?? [],
    })
    setHistoryLoading(false)
    if (!keepModalOpen) setShowHistoryModal(true)
  }

  async function revokeSanction(memberId: string, sanctionId: string) {
    setMemberActionLoading(`revoke-sanction-${sanctionId}`)
    const { error } = await apiPatch(`/api/communities/${slug}/members/${memberId}/sanctions/${sanctionId}`, {
      revoke_note: t('community_detail.revoked_by_moderation'),
    })
    if (error) {
      Alert.alert(t('common.error'), error)
    } else if (selectedMemberHistory) {
      await loadMemberHistory(selectedMemberHistory.member, true)
    }
    setMemberActionLoading(null)
  }

  function openMemberModerationMenu(member: CommunityDetail['recent_members'][number]) {
    const targetIsCommunityAdmin = admins.some((entry) => entry.user_id === member.id && entry.role === 'community_admin')
    const targetIsOwner = community?.owner_user_id === member.id || admins.some((entry) => entry.user_id === member.id && entry.role === 'owner')
    if (targetIsOwner) {
      Alert.alert(t('community_detail.not_allowed_title'), t('community_detail.owner_moderation_blocked'))
      return
    }
    if (!isCommunityOwner && targetIsCommunityAdmin) {
      Alert.alert(t('community_detail.not_allowed_title'), t('community_detail.admin_moderation_blocked'))
      return
    }
    Alert.alert(
      member.display_name,
      t('community_detail.choose_moderation_action'),
      [
        { text: t('community_detail.history'), onPress: () => loadMemberHistory(member) },
        { text: t('community_detail.warn'), onPress: () => openModerationComposer(member, 'warning') },
        { text: t('community_detail.timeout'), onPress: () => openModerationComposer(member, 'timeout') },
        { text: t('community_detail.remove'), onPress: () => openModerationComposer(member, 'removed') },
        { text: t('community_detail.ban'), style: 'destructive', onPress: () => openModerationComposer(member, 'banned') },
        { text: t('common.cancel'), style: 'cancel' },
      ]
    )
  }

  function openAdminRoleMenu(member: CommunityDetail['recent_members'][number]) {
    const isAdminMember = admins.some((entry) => entry.user_id === member.id && entry.role === 'community_admin')
    Alert.alert(
      member.display_name,
      isAdminMember ? t('community_detail.remove_admin_access') : t('community_detail.grant_admin_access'),
      [
        {
          text: isAdminMember ? t('community_detail.revoke_admin') : t('community_detail.make_admin'),
          onPress: () => isAdminMember ? revokeCommunityAdmin(member.id) : assignCommunityAdmin(member.id),
        },
        { text: t('common.cancel'), style: 'cancel' },
      ]
    )
  }

  async function updateReport(reportItem: HappeningReportEntry, status: 'resolved' | 'dismissed') {
    setReportActionLoading(`${reportItem.happening_id}:${reportItem.reporter_id}:${status}`)
    const { error } = await apiPatch(`/api/communities/${slug}/reports/happenings`, {
      happening_id: reportItem.happening_id,
      reporter_id: reportItem.reporter_id,
      status,
    })
    if (error) {
      Alert.alert(t('common.error'), error)
    } else {
      setReports((prev) => prev.filter((entry) => !(entry.happening_id === reportItem.happening_id && entry.reporter_id === reportItem.reporter_id)))
    }
    setReportActionLoading(null)
  }

  if (loading) return <View style={styles.center}><Spinner /></View>
  if (!community) return null

  const name = isRTL && community.name_ar ? community.name_ar : community.name
  const description = isRTL && community.description_ar ? community.description_ar : community.description
  const meta = LEVEL_META[community.level]
  const locationLabel = [community.city, community.country].filter(Boolean).join(' • ')
  const moderatorControlsVisible = isCommunityOwner || canModerate

  return (
    <>
      <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* ── Hero ─────────────────────────────────────────────── */}
        <View style={styles.hero}>
          {community.cover_url
            ? <Image source={{ uri: community.cover_url }} style={styles.heroImg} />
            : (
              <View style={[styles.heroPlaceholder, { backgroundColor: meta.bg }]}>
                <Ionicons name={meta.icon} size={44} color={meta.tint} />
                <Text style={[styles.heroPlaceholderLabel, { color: meta.tint }]}>{tx('community_detail.level_community', { level: communityLevelLabel(community.level) })}</Text>
              </View>
            )
          }
          {/* Gradient-ish bottom overlay for breadcrumb */}
          {community.ancestors.length > 0 && (
            <View style={styles.breadcrumbBar}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {community.ancestors.map((a, i) => (
                  <View key={a.id} style={styles.bcItem}>
                    {i > 0 && <Text style={styles.bcSep}>›</Text>}
                    <TouchableOpacity onPress={() => router.push(`/communities/${a.slug}` as any)}>
                      <Text style={styles.bcText}>{communityLevelLabel(a.level)} · {a.name}</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </ScrollView>
            </View>
          )}
        </View>

        {/* ── Identity card ────────────────────────────────────── */}
        <View style={styles.identityCard}>
          {/* Top: icon + name + verified */}
          <View style={styles.identityTop}>
            <View style={[styles.identityIcon, { backgroundColor: meta.bg }]}>
              <Ionicons name={meta.icon} size={26} color={meta.tint} />
            </View>
            <View style={styles.identityText}>
              <View style={styles.nameRow}>
                <Text style={styles.name}>{name}</Text>
                {community.is_verified && <Ionicons name="checkmark-circle" size={18} color={Colors.brand[500]} />}
              </View>
              <View style={styles.tagRow}>
                <View style={[styles.levelTag, { backgroundColor: meta.bg }]}>
                  <Text style={[styles.levelTagText, { color: meta.tint }]}>{communityLevelLabel(community.level)}</Text>
                </View>
                {community.approval_status !== 'approved' && (
                  <View style={styles.pendingApprovalTag}>
                    <Text style={styles.pendingApprovalTagText}>
                      {approvalStatusLabel(community.approval_status)}
                    </Text>
                  </View>
                )}
                {community.city && <Text style={styles.cityText}>📍 {community.city}</Text>}
                {community.member_role && <Text style={styles.cityText}>{tx('community_detail.role_label', { role: communityRoleLabel(community.member_role) })}</Text>}
                {community.member_status && community.member_status !== 'active' && (
                  <Text style={styles.cityText}>{tx('community_detail.status_label', { status: memberStatusLabel(community.member_status) })}</Text>
                )}
              </View>
            </View>
          </View>

          {/* Stats line */}
          <View style={styles.statLine}>
            <Ionicons name="people-outline" size={13} color={Colors.gray[400]} />
            <Text style={styles.statLineText}><Text style={styles.statLineValue}>{community.member_count.toLocaleString()}</Text> {t('community_detail.members')}</Text>
            <Text style={styles.statLineSep}>·</Text>
            <Ionicons name="calendar-outline" size={13} color={Colors.gray[400]} />
            <Text style={styles.statLineText}><Text style={styles.statLineValue}>{community.event_count}</Text> {t('community_detail.events')}</Text>
            {community.recent_members.length > 0 && (
              <>
                <Text style={styles.statLineSep}>·</Text>
                <Text style={styles.statLineText}><Text style={styles.statLineValue}>{community.recent_members.length}</Text> {t('community_detail.recent_joins')}</Text>
              </>
            )}
          </View>

          {/* Description */}
          {description ? <Text style={styles.description}>{description}</Text> : null}

          {!community.is_member && community.viewer_city && community.city_members_preview.length > 0 && (
            <View style={styles.socialProofCard}>
              <Text style={styles.socialProofTitle}>{tx('community_detail.people_from_here', { city: community.viewer_city })}</Text>
              <View style={styles.socialProofChips}>
                {community.city_members_preview.map((member) => (
                  <View key={member.id} style={styles.socialProofChip}>
                    <Text style={styles.socialProofChipText}>{member.display_name}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}
          {directParent && (
            <View style={styles.parentContextCard}>
              <Text style={styles.parentContextLabel}>{t('community_detail.nested_under')}</Text>
              <View style={styles.parentContextRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.parentContextName}>
                    {LEVEL_META[directParent.level].label} · {directParent.name}
                  </Text>
                  <Text style={styles.parentContextHint}>
                    {t('community_detail.parent_context_hint')}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => router.push(`/communities/${directParent.slug}` as any)}
                  style={styles.parentContextBtn}
                >
                  <Text style={styles.parentContextBtnText}>{t('community_detail.view_parent')}</Text>
                </TouchableOpacity>
                {canCreateSibling && (
                  <TouchableOpacity
                    onPress={() => router.push(`/communities/create?parent=${directParent.slug}` as any)}
                    style={styles.parentContextBtn}
                  >
                    <Text style={styles.parentContextBtnText}>{t('community_detail.create_sibling')}</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          )}

          {/* Join / Leave */}
          <TouchableOpacity
            onPress={toggleMembership}
            disabled={joining}
            style={[styles.joinBtn, community.is_member ? styles.joinBtnJoined : styles.joinBtnDefault]}
            activeOpacity={0.85}
          >
            {joining
              ? <ActivityIndicator size="small" color={community.is_member ? '#15803d' : '#fff'} />
              : (
                <View style={styles.joinBtnInner}>
                  <Ionicons
                    name={community.is_member ? 'checkmark-circle' : 'add-circle-outline'}
                    size={18}
                    color={community.is_member ? '#15803d' : '#fff'}
                  />
                  <Text style={[styles.joinBtnText, community.is_member && styles.joinBtnTextJoined]}>
                    {community.is_member ? t('community_detail.joined_tap_leave') : t('community_detail.join_community')}
                  </Text>
                </View>
              )
            }
          </TouchableOpacity>
          <TouchableOpacity
            onPress={toggleFollow}
            disabled={following}
            style={[styles.followBtn, community.is_following ? styles.followBtnActive : styles.followBtnIdle]}
            activeOpacity={0.85}
          >
            {following
              ? <ActivityIndicator size="small" color={community.is_following ? '#0369a1' : Colors.gray[700]} />
              : (
                <View style={styles.joinBtnInner}>
                  <Ionicons
                    name={community.is_following ? 'notifications' : 'notifications-outline'}
                    size={18}
                    color={community.is_following ? '#0369a1' : Colors.gray[700]}
                  />
                  <Text style={[styles.followBtnText, community.is_following && styles.followBtnTextActive]}>
                    {community.is_following ? t('community_detail.following_updates') : t('community_detail.follow_updates')}
                  </Text>
                </View>
              )
            }
          </TouchableOpacity>

          {canRequestHostRole && (
            <TouchableOpacity
              onPress={viewerHostRequestStatus === 'pending' ? withdrawHostRequest : requestHostRole}
              disabled={requestingHost || viewerHostRequestStatus === 'rejected'}
              style={[
                styles.followBtn,
                viewerHostRequestStatus === 'pending'
                  ? { borderColor: '#d97706', backgroundColor: '#fef9f0' }
                  : viewerHostRequestStatus === 'rejected'
                  ? { borderColor: '#fca5a5', backgroundColor: '#fff5f5', opacity: 0.65 }
                  : { borderColor: '#7c3aed', backgroundColor: '#f5f3ff' },
              ]}
              activeOpacity={0.85}
            >
              {requestingHost
                ? <ActivityIndicator size="small" color="#7c3aed" />
                : (
                  <View style={styles.joinBtnInner}>
                    <Ionicons
                      name={viewerHostRequestStatus === 'pending' ? 'hourglass-outline' : viewerHostRequestStatus === 'rejected' ? 'close-circle-outline' : 'person-add-outline'}
                      size={18}
                      color={viewerHostRequestStatus === 'pending' ? '#d97706' : viewerHostRequestStatus === 'rejected' ? '#ef4444' : '#7c3aed'}
                    />
                    <Text style={[
                      styles.followBtnText,
                      viewerHostRequestStatus === 'pending'
                        ? { color: '#d97706' }
                        : viewerHostRequestStatus === 'rejected'
                        ? { color: '#ef4444' }
                        : { color: '#7c3aed' },
                    ]}>
                      {viewerHostRequestStatus === 'pending'
                        ? t('community_detail.request_pending_withdraw')
                        : viewerHostRequestStatus === 'rejected'
                        ? t('community_detail.request_rejected')
                        : t('community_detail.request_to_host')}
                    </Text>
                  </View>
                )
              }
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.section}>
          <View style={styles.summaryCard}>
            <Text style={styles.sectionEyebrow}>{t('community_detail.discover_eyebrow')}</Text>
            <Text style={styles.summaryHeadline}>
              {t('community_detail.summary_headline')}
            </Text>
            <Text style={styles.summaryBody}>
              {locationLabel ? `Centered around ${locationLabel}. ` : ''}
              {t('community_detail.summary_body')}
            </Text>
            <View style={styles.summaryMetricsRow}>
              <View style={styles.summaryMetricCard}>
                <Text style={styles.summaryMetricValue}>{community.member_count.toLocaleString()}</Text>
                <Text style={styles.summaryMetricLabel}>{t('community_detail.members')}</Text>
              </View>
              <View style={styles.summaryMetricCard}>
                <Text style={styles.summaryMetricValue}>{community.event_count.toLocaleString()}</Text>
                <Text style={styles.summaryMetricLabel}>{t('community_detail.events')}</Text>
              </View>
              <View style={styles.summaryMetricCard}>
                <Text style={styles.summaryMetricValue}>{children.length}</Text>
                <Text style={styles.summaryMetricLabel}>{t('community_detail.sub_groups')}</Text>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <View style={[styles.sectionCard, styles.happeningsSectionCard]}>
            <View style={styles.sectionHeader}>
              <View>
                <Text style={styles.sectionEyebrow}>{t('community_detail.live_inside_eyebrow')}</Text>
                <Text style={[styles.sectionTitle, { marginBottom: 2 }]}>{t('community_detail.happening_now_title')}</Text>
                <Text style={styles.sectionSub}>{t('community_detail.happening_now_sub')}</Text>
              </View>
              {canParticipateInHappenings && (
                <TouchableOpacity onPress={() => setShowPostModal(true)} style={styles.postHappeningBtn}>
                  <Ionicons name="add" size={14} color="#fff" />
                  <Text style={styles.postHappeningBtnText}>{t('community_detail.post')}</Text>
                </TouchableOpacity>
              )}
            </View>

            {happeningsLoading ? (
              <View style={styles.centerSmall}><Spinner /></View>
            ) : happenings.length === 0 ? (
              <View style={styles.happeningsEmpty}>
                <Ionicons name="radio-outline" size={28} color={Colors.brand[300]} />
                <Text style={styles.happeningsEmptyText}>{t('community_detail.no_happenings_title')}</Text>
                <Text style={styles.happeningsEmptyHint}>
                  {canParticipateInHappenings
                    ? t('community_detail.no_happenings_can_post')
                    : t('community_detail.no_happenings_join')}
                </Text>
              </View>
            ) : (
              <View style={styles.happeningsList}>
                {happenings.map((h, i) => {
                  const ttlMs = new Date(h.expires_at).getTime() - Date.now()
                  const ttlH = Math.floor(ttlMs / 3_600_000)
                  const ttlM = Math.floor((ttlMs % 3_600_000) / 60_000)
                  const ttl = ttlMs <= 0 ? t('community_detail.expired') : ttlH > 0 ? tx('community_detail.hours_minutes_left', { hours: ttlH, minutes: ttlM }) : tx('community_detail.minutes_left', { minutes: ttlM })
                  const typeLabel: Record<HappeningType, string> = { open_invite: happeningTypeLabel('open_invite'), info: happeningTypeLabel('info'), question: happeningTypeLabel('question'), alert: happeningTypeLabel('alert') }
                  const typeBg: Record<HappeningType, string> = { open_invite: Colors.brand[50], info: '#f0f9ff', question: '#f5f3ff', alert: '#fff1f2' }
                  const isLast = i === happenings.length - 1

                  return (
                    <View key={h.id} style={[styles.happeningCard, !isLast && styles.happeningCardBorder, { backgroundColor: typeBg[h.type] }]}>
                      <View style={styles.happeningHeader}>
                        <View style={styles.happeningAuthorRow}>
                          <View style={styles.avatar}>
                            {h.author.avatar_url
                              ? <Image source={{ uri: h.author.avatar_url }} style={styles.avatarImg} />
                              : <Text style={styles.avatarInitial}>{h.author.display_name.slice(0, 1).toUpperCase()}</Text>
                            }
                          </View>
                          <View>
                            <Text style={styles.happeningAuthor}>{h.author.display_name}</Text>
                            <Text style={styles.happeningTtl}>{ttl}</Text>
                          </View>
                        </View>
                        <View style={styles.happeningTypeBadge}>
                          <Text style={styles.happeningTypeText}>{typeLabel[h.type]}</Text>
                        </View>
                      </View>
                      <Text style={styles.happeningBody}>{h.body}</Text>
                      {h.lat && h.lng && (
                        <TouchableOpacity
                          onPress={() => Linking.openURL(`https://maps.google.com/?q=${h.lat},${h.lng}`)}
                          style={styles.happeningLocBtn}
                        >
                          <Ionicons name="location-outline" size={12} color={Colors.brand[600]} />
                          <Text style={styles.happeningLocText}>{h.location_label?.trim() || t('community_detail.view_on_map')}</Text>
                        </TouchableOpacity>
                      )}
                      <View style={styles.happeningActions}>
                        <TouchableOpacity
                          onPress={() => community && setSelectedHappeningForComments({
                            ...h,
                            community: {
                              id: community.id,
                              name: community.name,
                              name_ar: community.name_ar,
                              slug: community.slug,
                              level: community.level,
                            },
                          })}
                          style={styles.happeningActionBtn}
                        >
                          <Text style={styles.happeningActionText}>{t('community_detail.chat')}</Text>
                        </TouchableOpacity>
                        {user && ttlMs > 0 && (
                          <TouchableOpacity onPress={() => toggleHappeningRsvp(h)} style={[styles.happeningActionBtn, h.user_has_rsvp && styles.happeningActionBtnActive]}>
                            <Text style={[styles.happeningActionText, h.user_has_rsvp && styles.happeningActionTextActive]}>
                              {h.user_has_rsvp ? t('community_detail.im_in') : t('community.join')} • {h.rsvp_count}
                            </Text>
                          </TouchableOpacity>
                        )}
                        {user && ttlMs > 0 && (
                          <TouchableOpacity onPress={() => toggleHappeningReact(h)} style={[styles.happeningActionBtn, h.user_has_reacted && styles.happeningReactActive]}>
                            <Text style={[styles.happeningActionText, h.user_has_reacted && styles.happeningReactTextActive]}>
                              {t('community_detail.like')} - {h.reaction_count}
                            </Text>
                          </TouchableOpacity>
                        )}
                        {user && ttlMs > 0 && h.author_id !== user?.id && (
                          <TouchableOpacity onPress={() => reportHappening(h.id)} style={styles.happeningReportBtn}>
                            <Ionicons name="flag-outline" size={14} color={Colors.gray[400]} />
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  )
                })}
              </View>
            )}
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionCard}>
            <View style={[styles.sectionHeader, styles.sectionHeaderWrap]}>
              <View style={styles.sectionHeaderContent}>
                <Text style={styles.sectionEyebrow}>{t('community_detail.main_highlight')}</Text>
                <Text style={styles.sectionTitle}>{t('community_detail.upcoming_events')}</Text>
                <Text style={styles.sectionSub}>{t('community_detail.upcoming_events_sub')}</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                {isCurrentUserHost && (
                  <TouchableOpacity
                    onPress={() => router.push(`/organizer/event-form?community=${community.id}` as any)}
                    style={[styles.sectionLinkButton, { backgroundColor: Colors.brand[600], paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 }]}
                  >
                    <Text style={{ color: '#fff', fontSize: FontSize.xs, fontWeight: FontWeight.semibold }}>+ {t('community_detail.create_session')}</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  onPress={() => router.push({ pathname: '/(tabs)/home', params: { community: slug, reset: String(Date.now()) } } as any)}
                  style={styles.sectionLinkButton}
                >
                  <Text style={styles.sectionLink}>{t('community_detail.view_all')}</Text>
                </TouchableOpacity>
              </View>
            </View>

            {eventsLoading && events.length === 0
              ? <View style={styles.centerSmall}><Spinner /></View>
              : events.length === 0
                ? <EmptyState icon="📅" title={t('community_detail.no_upcoming_events')} description={t('community_detail.check_back_soon')} />
                : (
                  <>
                    {events.map((ev) => {
                      const title = isRTL && ev.title_ar ? ev.title_ar : ev.title
                      return (
                        <TouchableOpacity
                          key={ev.id}
                          style={styles.eventCard}
                          onPress={() => router.push(`/events/${ev.id}` as any)}
                          activeOpacity={0.85}
                        >
                          {ev.cover_image_url
                            ? <Image source={{ uri: ev.cover_image_url }} style={styles.eventThumb} />
                            : (
                              <View style={[styles.eventThumb, styles.eventThumbEmpty]}>
                                <Ionicons name="calendar-outline" size={22} color={Colors.brand[300]} />
                              </View>
                            )
                          }
                          <View style={styles.eventDetails}>
                            <Text style={styles.eventTitle} numberOfLines={2}>{title}</Text>
                            <Text style={styles.eventMeta}>
                              <Ionicons name="time-outline" size={11} color={Colors.gray[400]} /> {formatDate(ev.start_at)}
                            </Text>
                            <Text style={styles.eventMeta}>{ev.city || t('community_detail.location_announced_soon')}</Text>
                          </View>
                          <View style={[styles.priceBadge, ev.is_free && styles.priceBadgeFree]}>
                            <Text style={[styles.priceText, ev.is_free && styles.priceTextFree]}>
                              {ev.is_free ? t('events.free') : `${ev.price} ${ev.currency}`}
                            </Text>
                          </View>
                        </TouchableOpacity>
                      )
                    })}
                    {nextCursor && (
                      <TouchableOpacity style={styles.loadMoreBtn} onPress={() => loadEvents(nextCursor)} disabled={eventsLoading}>
                        {eventsLoading
                          ? <ActivityIndicator size="small" color={Colors.brand[500]} />
                          : <Text style={styles.loadMoreText}>{t('community_detail.load_more_events')}</Text>
                        }
                      </TouchableOpacity>
                    )}
                  </>
                )
            }
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <View>
                <Text style={styles.sectionEyebrow}>{t('community_detail.explore_deeper')}</Text>
                <Text style={styles.sectionTitle}>{t('community_detail.sub_communities')}</Text>
              </View>
              {canCreateChildHere && (
                <TouchableOpacity onPress={() => router.push((community.level === 'country' ? `/communities/create?root=${slug}` : `/communities/create?parent=${slug}`) as any)}>
                  <Text style={styles.sectionLink}>{t('community_detail.create_here')}</Text>
                </TouchableOpacity>
              )}
            </View>
            <Text style={styles.sectionSubInline}>{t('community_detail.sub_communities_hint')}</Text>
            {childrenLoading ? (
              <View style={styles.centerSmall}><Spinner /></View>
            ) : children.length === 0 ? (
              <EmptyState icon="🪴" title={t('community_detail.no_sub_communities')} description={t('community_detail.create_first_nested')} />
            ) : (
              <View style={styles.childrenList}>
                {children.map((child, index) => (
                  <View key={child.id} style={[styles.childCard, index < children.length - 1 && styles.childCardBorder]}>
                    <TouchableOpacity style={styles.childBody} onPress={() => router.push(`/communities/${child.slug}` as any)}>
                      <Text style={styles.childName}>{isRTL && child.name_ar ? child.name_ar : child.name}</Text>
                      <View style={styles.childBadgeRow}>
                        {child.is_member && (
                          <View style={[styles.childBadge, styles.childBadgeJoined]}>
                            <Text style={[styles.childBadgeText, styles.childBadgeTextJoined]}>{t('community.joined')}</Text>
                          </View>
                        )}
                        {child.is_verified && (
                          <View style={[styles.childBadge, styles.childBadgeVerified]}>
                            <Text style={[styles.childBadgeText, styles.childBadgeTextVerified]}>{t('community_detail.verified')}</Text>
                          </View>
                        )}
                        <View style={[styles.childBadge, styles.childBadgeLevel]}>
                          <Text style={[styles.childBadgeText, styles.childBadgeTextLevel]}>{communityLevelLabel(child.level)}</Text>
                        </View>
                      </View>
                      <Text style={styles.childMeta}>
                        {tx('community_detail.child_meta', { level: communityLevelLabel(child.level), count: child.member_count.toLocaleString(), city: child.city ? ` - ${child.city}` : '' })}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => toggleChildMembership(child)}
                      disabled={childJoiningSlug === child.slug}
                      style={[styles.childJoinBtn, child.is_member && styles.childJoinBtnActive]}
                    >
                      <Text style={[styles.childJoinText, child.is_member && styles.childJoinTextActive]}>
                        {childJoiningSlug === child.slug ? '...' : child.is_member ? t('community.joined') : t('community.join')}
                      </Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}
          </View>
        </View>

        {community.activity.length > 0 && (
          <View style={styles.section}>
            <View style={styles.accordionCard}>
              <TouchableOpacity style={styles.accordionHeader} activeOpacity={0.86} onPress={() => setShowActivityAccordion((prev) => !prev)}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sectionEyebrow}>{t('community_detail.secondary_context')}</Text>
                  <Text style={styles.accordionTitle}>{t('community_detail.recent_activity')}</Text>
                  <Text style={styles.accordionHint}>{t('community_detail.recent_activity_hint')}</Text>
                </View>
                <View style={styles.accordionMeta}>
                  <Text style={styles.accordionBadge}>{community.activity.length}</Text>
                  <Ionicons name={showActivityAccordion ? 'chevron-up' : 'chevron-down'} size={18} color={Colors.gray[500]} />
                </View>
              </TouchableOpacity>
              {showActivityAccordion && (
                <View style={styles.accordionBody}>
                  <View style={styles.activityList}>
                    {community.activity.map((item, i) => {
                      const isEvent = item.type === 'event_published'
                      return (
                        <TouchableOpacity
                          key={item.id}
                          style={[styles.activityItem, i < community.activity.length - 1 && styles.activityItemBorder]}
                          activeOpacity={item.href ? 0.8 : 1}
                          onPress={item.href ? () => router.push(item.href as any) : undefined}
                        >
                          <View style={[styles.activityDot, { backgroundColor: isEvent ? Colors.brand[100] : '#dcfce7' }]}>
                            <Ionicons name={isEvent ? 'calendar-outline' : 'person-add-outline'} size={14} color={isEvent ? Colors.brand[600] : '#15803d'} />
                          </View>
                          <View style={styles.activityBody}>
                            <Text style={styles.activityTitle}>{item.title}</Text>
                            <Text style={styles.activitySub}>{item.subtitle}</Text>
                          </View>
                          <Text style={styles.activityDate}>{formatDate(item.created_at)}</Text>
                        </TouchableOpacity>
                      )
                    })}
                  </View>
                </View>
              )}
            </View>
          </View>
        )}

        {moderatorControlsVisible && (
          <View style={styles.section}>
            <View style={[styles.accordionCard, styles.moderatorAccordionCard]}>
              <TouchableOpacity style={styles.accordionHeader} activeOpacity={0.86} onPress={() => setShowModeratorAccordion((prev) => !prev)}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.sectionEyebrow, { color: '#b45309' }]}>{t('community_detail.moderator_only')}</Text>
                  <Text style={styles.accordionTitle}>{t('community_detail.moderator_center')}</Text>
                  <Text style={styles.accordionHint}>{t('community_detail.moderator_center_hint')}</Text>
                </View>
                <View style={styles.accordionMeta}>
                  <Text style={styles.accordionBadge}>{reports.length}</Text>
                  <Ionicons name={showModeratorAccordion ? 'chevron-up' : 'chevron-down'} size={18} color={Colors.gray[500]} />
                </View>
              </TouchableOpacity>

              {showModeratorAccordion && (
                <View style={styles.accordionBody}>
                  <View style={styles.sectionCard}>
                    <View style={styles.sectionHeader}>
                      <View>
                        <Text style={styles.sectionTitle}>{t('community_detail.member_management')}</Text>
                        <Text style={styles.sectionSubInline}>{community.member_count.toLocaleString()} {t('community_detail.members')}</Text>
                      </View>
                    </View>
                    {community.recent_members.length === 0
                      ? <EmptyState icon="👥" title={t('community_detail.no_members_yet')} description={t('community_detail.be_first_to_join')} />
                      : (
                        <View style={styles.membersList}>
                          {community.recent_members.map((m, i) => (
                            <View key={m.id} style={[styles.memberRow, i < community.recent_members.length - 1 && styles.memberRowBorder]}>
                              <View style={styles.avatar}>
                                {m.avatar_url
                                  ? <Image source={{ uri: m.avatar_url }} style={styles.avatarImg} />
                                  : <Text style={styles.avatarInitial}>{m.display_name.slice(0, 1).toUpperCase()}</Text>
                                }
                              </View>
                              <View style={styles.memberInfo}>
                                <Text style={styles.memberName}>{m.display_name}</Text>
                                <Text style={styles.memberMeta}>{tx('community_detail.joined_date', { date: formatDate(m.joined_at) })}</Text>
                                {admins.some((entry) => entry.user_id === m.id && entry.role === 'community_admin') && (
                                  <Text style={styles.memberAdminMeta}>{t('community_detail.community_admin')}</Text>
                                )}
                                {community.owner_user_id === m.id && (
                                  <Text style={styles.memberOwnerMeta}>{t('community_detail.owner')}</Text>
                                )}
                              </View>
                              <View style={styles.memberActions}>
                                {isCommunityOwner &&
                                  community.owner_user_id !== m.id &&
                                  !admins.some((entry) => entry.user_id === m.id && entry.role === 'owner') && (
                                    <TouchableOpacity
                                      onPress={() => openAdminRoleMenu(m)}
                                      disabled={memberActionLoading === `assign-${m.id}` || memberActionLoading === `revoke-${m.id}`}
                                      style={styles.memberActionChip}
                                    >
                                      <Text style={styles.memberActionText}>
                                        {admins.some((entry) => entry.user_id === m.id && entry.role === 'community_admin') ? t('community_detail.admin_role') : t('community_detail.make_admin')}
                                      </Text>
                                    </TouchableOpacity>
                                  )}
                                {community.owner_user_id !== m.id &&
                                  !admins.some((entry) => entry.user_id === m.id && entry.role === 'owner') &&
                                  m.id !== user?.id &&
                                  (isCommunityOwner || !admins.some((entry) => entry.user_id === m.id && entry.role === 'community_admin')) && (
                                    <TouchableOpacity
                                      onPress={() => openMemberModerationMenu(m)}
                                      disabled={
                                        memberActionLoading === `warn-${m.id}` ||
                                        memberActionLoading === `timeout-${m.id}` ||
                                        memberActionLoading === `removed-${m.id}` ||
                                        memberActionLoading === `banned-${m.id}`
                                      }
                                      style={[styles.memberActionChip, styles.memberActionChipDanger]}
                                    >
                                      <Text style={[styles.memberActionText, styles.memberActionTextDanger]}>{t('community_detail.moderate')}</Text>
                                    </TouchableOpacity>
                                  )}
                              </View>
                            </View>
                          ))}
                        </View>
                      )
                    }
                  </View>

                  {isCommunityOwner && (
                    <View style={[styles.sectionCard, styles.adminPanel]}>
                      <View style={styles.sectionHeader}>
                        <Text style={styles.sectionTitle}>{t('community_detail.community_admins')}</Text>
                        <Text style={styles.sectionSubInline}>{tx('community_detail.roles_count', { count: admins.length })}</Text>
                      </View>
                      {adminsLoading ? (
                        <View style={styles.centerSmall}><Spinner /></View>
                      ) : admins.length === 0 ? (
                        <Text style={styles.emptyPanelText}>{t('community_detail.no_admins')}</Text>
                      ) : (
                        admins.map((entry, index) => (
                          <View key={entry.user_id} style={[styles.simplePanelRow, index < admins.length - 1 && styles.simplePanelRowBorder]}>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.simplePanelTitle}>{entry.profile?.display_name ?? entry.user_id}</Text>
                              <Text style={styles.simplePanelMeta}>{tx('community_detail.admin_entry_meta', { role: communityRoleLabel(entry.role), date: formatDate(entry.joined_at) })}</Text>
                            </View>
                            {entry.role === 'community_admin' && (
                              <TouchableOpacity
                                onPress={() => revokeCommunityAdmin(entry.user_id)}
                                disabled={memberActionLoading === `revoke-${entry.user_id}`}
                                style={styles.memberActionChip}
                              >
                                <Text style={styles.memberActionText}>{t('community_detail.revoke')}</Text>
                              </TouchableOpacity>
                            )}
                          </View>
                        ))
                      )}
                    </View>
                  )}

                  {canModerate && (
                    <View style={[styles.sectionCard, styles.reportsPanel]}>
                      <View style={styles.sectionHeader}>
                        <Text style={styles.sectionTitle}>{t('community_detail.happening_reports')}</Text>
                        <TouchableOpacity onPress={() => { void loadReports() }} disabled={reportsLoading}>
                          <Text style={styles.sectionLink}>{t('community_detail.refresh')}</Text>
                        </TouchableOpacity>
                      </View>
                      {reportsLoading ? (
                        <View style={styles.centerSmall}><Spinner /></View>
                      ) : reports.length === 0 ? (
                        <Text style={styles.emptyPanelText}>{t('community_detail.no_pending_reports')}</Text>
                      ) : (
                        reports.map((reportItem, index) => (
                          <View key={`${reportItem.happening_id}:${reportItem.reporter_id}`} style={[styles.simplePanelRow, index < reports.length - 1 && styles.simplePanelRowBorder]}>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.simplePanelTitle}>{reportItem.reason}</Text>
                              <Text style={styles.simplePanelMeta}>{tx('community_detail.reporter_label', { reporter: reportItem.reporter?.display_name ?? reportItem.reporter_id })}</Text>
                              {reportItem.happening && (
                                <Text style={styles.simplePanelMeta} numberOfLines={2}>{reportItem.happening.body}</Text>
                              )}
                            </View>
                            <View style={styles.memberActions}>
                              <TouchableOpacity
                                onPress={() => updateReport(reportItem, 'resolved')}
                                disabled={reportActionLoading === `${reportItem.happening_id}:${reportItem.reporter_id}:resolved`}
                                style={styles.memberActionChip}
                              >
                                <Text style={styles.memberActionText}>{t('community_detail.resolve')}</Text>
                              </TouchableOpacity>
                              <TouchableOpacity
                                onPress={() => updateReport(reportItem, 'dismissed')}
                                disabled={reportActionLoading === `${reportItem.happening_id}:${reportItem.reporter_id}:dismissed`}
                                style={[styles.memberActionChip, styles.memberActionChipDanger]}
                              >
                                <Text style={[styles.memberActionText, styles.memberActionTextDanger]}>{t('community_detail.dismiss')}</Text>
                              </TouchableOpacity>
                            </View>
                          </View>
                        ))
                      )}
                    </View>
                  )}
                </View>
              )}
            </View>
          </View>
        )}

      </ScrollView>

      {/* ── Post Happening Modal ──────────────────────────────── */}
      <Modal visible={showPostModal} animationType="slide" transparent onRequestClose={() => setShowPostModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>{t('community_detail.post_happening_title')}</Text>

            {/* Type chips */}
            <View style={styles.typeChips}>
              {(['open_invite', 'info', 'question', 'alert'] as HappeningType[]).map((type) => {
                const labels: Record<HappeningType, string> = {
                  open_invite: t('community_detail.post_type.open_invite'),
                  info: t('community_detail.post_type.info'),
                  question: t('community_detail.post_type.question'),
                  alert: t('community_detail.post_type.alert'),
                }
                return (
                  <TouchableOpacity
                    key={type}
                    onPress={() => setPostType(type)}
                    style={[styles.typeChip, postType === type && styles.typeChipActive]}
                  >
                    <Text style={[styles.typeChipText, postType === type && styles.typeChipTextActive]}>
                      {labels[type]}
                    </Text>
                  </TouchableOpacity>
                )
              })}
            </View>

            <TextInput
              value={postBody}
              onChangeText={(v) => setPostBody(v.slice(0, 280))}
              placeholder={t('community_detail.post_placeholder')}
              placeholderTextColor={Colors.gray[400]}
              multiline
              maxLength={280}
              style={styles.postInput}
            />
            <Text style={styles.charCount}>{postBody.length}/280</Text>

            {/* Location */}
            <View style={styles.locRow}>
              <TouchableOpacity onPress={openLocationPicker} style={styles.locBtn}>
                <Ionicons name="map-outline" size={13} color={Colors.gray[500]} />
                <Text style={styles.locBtnText}>
                  {postLocation ? t('community_detail.edit_meetup_spot') : t('community_detail.pick_meetup_spot')}
                </Text>
              </TouchableOpacity>
              {postLocation && (
                <TouchableOpacity onPress={() => setPostLocation(null)} style={[styles.locBtn, styles.locBtnAttached]}>
                  <Ionicons name="location" size={13} color="#15803d" />
                  <Text style={[styles.locBtnText, { color: '#15803d' }]} numberOfLines={1}>
                    {postLocation.label}  x
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Expiry */}
            <View style={styles.expiryRow}>
              <Text style={styles.expiryLabel}>{t('community_detail.expires_in')}</Text>
              {[1, 3, 6, 12, 24].map((h) => (
                <TouchableOpacity
                  key={h}
                  onPress={() => setPostExpiry(h)}
                  style={[styles.expiryChip, postExpiry === h && styles.expiryChipActive]}
                >
                  <Text style={[styles.expiryChipText, postExpiry === h && styles.expiryChipTextActive]}>{h}h</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity onPress={() => setShowPostModal(false)} style={styles.modalCancelBtn}>
                <Text style={styles.modalCancelText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={submitHappening}
                disabled={posting || !postBody.trim()}
                style={[styles.modalPostBtn, (posting || !postBody.trim()) && styles.modalPostBtnDisabled]}
              >
                {posting
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={styles.modalPostText}>{t('community_detail.post')}</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
      <Modal visible={showModerationModal} animationType="slide" transparent onRequestClose={() => setShowModerationModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>
              {moderationMode === 'warning'
                ? t('community_detail.issue_warning')
                : moderationMode === 'timeout'
                  ? t('community_detail.apply_timeout')
                  : moderationMode === 'removed'
                    ? t('community_detail.remove_member')
                    : t('community_detail.ban_member')}
            </Text>
            {moderationTarget && (
              <Text style={styles.moderationTargetText}>{tx('community_detail.member_label', { member: moderationTarget.display_name })}</Text>
            )}

            {moderationMode === 'warning' && (
              <View style={styles.typeChips}>
                {(['low', 'medium', 'high'] as const).map((level) => (
                  <TouchableOpacity
                    key={level}
                    onPress={() => setModerationSeverity(level)}
                    style={[styles.typeChip, moderationSeverity === level && styles.typeChipActive]}
                  >
                    <Text style={[styles.typeChipText, moderationSeverity === level && styles.typeChipTextActive]}>
                      {level}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {moderationMode === 'timeout' && (
              <View style={styles.expiryRow}>
                <Text style={styles.expiryLabel}>{t('community_detail.duration')}</Text>
                {[1, 6, 24, 72].map((hours) => (
                  <TouchableOpacity
                    key={hours}
                    onPress={() => setModerationDurationHours(hours)}
                    style={[styles.expiryChip, moderationDurationHours === hours && styles.expiryChipActive]}
                  >
                    <Text style={[styles.expiryChipText, moderationDurationHours === hours && styles.expiryChipTextActive]}>
                      {tx('community_detail.hours_short', { hours })}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <TextInput
              value={moderationReason}
              onChangeText={setModerationReason}
              placeholder={t('community_detail.moderation_reason_placeholder')}
              placeholderTextColor={Colors.gray[400]}
              multiline
              style={[styles.postInput, { minHeight: 96 }]}
            />

            <View style={styles.modalActions}>
              <TouchableOpacity onPress={() => setShowModerationModal(false)} style={styles.modalCancelBtn}>
                <Text style={styles.modalCancelText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={submitModerationAction}
                disabled={!moderationReason.trim() || !!memberActionLoading}
                style={[styles.modalPostBtn, (!moderationReason.trim() || !!memberActionLoading) && styles.modalPostBtnDisabled]}
              >
                <Text style={styles.modalPostText}>{t('common.confirm')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
      <Modal visible={showHistoryModal} animationType="slide" transparent onRequestClose={() => setShowHistoryModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>{t('community_detail.moderation_history')}</Text>
            {selectedMemberHistory && (
              <Text style={styles.moderationTargetText}>{selectedMemberHistory.member.display_name}</Text>
            )}
            <ScrollView style={styles.historyScroll} contentContainerStyle={styles.historyContent}>
              {historyLoading ? (
                <View style={styles.centerSmall}><Spinner /></View>
              ) : selectedMemberHistory ? (
                <>
                  {selectedMemberHistory.warnings.map((warning) => (
                    <View key={warning.id} style={[styles.historyCard, styles.historyCardWarning]}>
                      <Text style={styles.historyTitle}>{tx('community_detail.warning_history_title', { severity: moderationSeverityLabel(warning.severity) })}</Text>
                      <Text style={styles.historyBody}>{warning.reason}</Text>
                      <Text style={styles.historyMeta}>{formatDate(warning.created_at)}</Text>
                    </View>
                  ))}
                  {selectedMemberHistory.sanctions.map((sanction) => (
                    <View key={sanction.id} style={[styles.historyCard, styles.historyCardDanger]}>
                      <Text style={styles.historyTitle}>{moderationModeLabel(sanction.sanction_type)}</Text>
                      <Text style={styles.historyBody}>{sanction.reason}</Text>
                      <Text style={styles.historyMeta}>
                        {tx('community_detail.started_date', { date: formatDate(sanction.starts_at) })}
                        {sanction.ends_at ? ` - ${tx('community_detail.ends_date', { date: formatDate(sanction.ends_at) })}` : ''}
                        {sanction.revoked_at ? ` - ${tx('community_detail.revoked_date', { date: formatDate(sanction.revoked_at) })}` : ''}
                      </Text>
                      {!sanction.revoked_at && (
                        <TouchableOpacity
                          onPress={() => revokeSanction(selectedMemberHistory.member.id, sanction.id)}
                          disabled={memberActionLoading === `revoke-sanction-${sanction.id}`}
                          style={[styles.memberActionChip, { alignSelf: 'flex-start', marginTop: Spacing.sm }]}
                        >
                          <Text style={styles.memberActionText}>{t('community_detail.revoke')}</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  ))}
                  {selectedMemberHistory.warnings.length === 0 && selectedMemberHistory.sanctions.length === 0 && (
                    <Text style={styles.emptyPanelText}>{t('community_detail.no_moderation_history')}</Text>
                  )}
                </>
              ) : null}
            </ScrollView>
            <View style={styles.modalActions}>
              <TouchableOpacity onPress={() => setShowHistoryModal(false)} style={styles.modalCancelBtn}>
                <Text style={styles.modalCancelText}>{t('community_detail.close')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
      <LocationPickerModal
        visible={showLocationPicker}
        initialLocation={postLocation}
        onClose={() => closeLocationPicker(true)}
        onConfirm={(location) => {
          setPostLocation(location)
          closeLocationPicker(true)
        }}
      />
      <HappeningCommentsSheet
        visible={!!selectedHappeningForComments}
        happening={selectedHappeningForComments}
        currentUserId={user?.id ?? null}
        onClose={() => setSelectedHappeningForComments(null)}
      />
    </>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#faf8f5' },
  content: { paddingBottom: Spacing['5xl'] },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  centerSmall: { alignItems: 'center', paddingVertical: Spacing['2xl'] },

  // Hero
  hero: { position: 'relative' },
  heroImg: { width: '100%', height: 200, resizeMode: 'cover' },
  heroPlaceholder: { width: '100%', height: 220, alignItems: 'center', justifyContent: 'center', gap: 10 },
  heroPlaceholderLabel: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, letterSpacing: 1.4, textTransform: 'uppercase' as const, textAlign: 'left' as const },
  breadcrumbBar: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.48)', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm + 2 },
  bcItem: { flexDirection: 'row', alignItems: 'center' },
  bcSep: { color: 'rgba(255,255,255,0.5)', marginHorizontal: 5, fontSize: 12, textAlign: 'left' as const },
  bcText: { color: 'rgba(255,255,255,0.9)', fontSize: FontSize.xs, fontWeight: FontWeight.medium, textAlign: 'left' as const },

  // Identity card
  identityCard: { backgroundColor: '#fff', marginHorizontal: Spacing.lg, marginTop: -Spacing.md, borderRadius: Radius['xl'], padding: Spacing.xl, shadowColor: '#1a1208', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 14, elevation: 6, zIndex: 10, marginBottom: Spacing.lg },
  identityTop: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md, marginBottom: Spacing.lg },
  identityIcon: { width: 56, height: 56, borderRadius: Radius.xl, alignItems: 'center', justifyContent: 'center' },
  identityText: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { fontSize: FontSize['2xl'], fontWeight: FontWeight.bold, color: Colors.gray[900], flex: 1, lineHeight: 30, textAlign: 'left' as const },
  tagRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 6 },
  levelTag: { paddingHorizontal: Spacing.sm, paddingVertical: 3, borderRadius: Radius.full },
  levelTagText: { fontSize: 11, fontWeight: FontWeight.semibold, textAlign: 'left' as const },
  pendingApprovalTag: { paddingHorizontal: Spacing.sm, paddingVertical: 3, borderRadius: Radius.full, backgroundColor: '#f0f9ff', borderWidth: 1, borderColor: '#bae6fd' },
  pendingApprovalTagText: { fontSize: 11, fontWeight: FontWeight.semibold, color: '#0369a1', textAlign: 'left' as const },
  cityText: { fontSize: FontSize.xs, color: Colors.gray[500], textAlign: 'left' as const },

  statLine: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: Spacing.xs, marginBottom: Spacing.lg, paddingVertical: Spacing.sm, paddingHorizontal: Spacing.md, backgroundColor: '#f9f6f0', borderRadius: Radius.lg },
  statLineValue: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.gray[900], textAlign: 'left' as const },
  statLineText: { fontSize: FontSize.sm, color: Colors.gray[500], textAlign: 'left' as const },
  statLineSep: { fontSize: FontSize.sm, color: Colors.gray[300], marginHorizontal: 2, textAlign: 'left' as const },

  description: { fontSize: FontSize.sm, color: Colors.gray[600], lineHeight: 22, marginBottom: Spacing.md, textAlign: 'left' as const },
  socialProofCard: {
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: '#bae6fd',
    backgroundColor: '#f0f9ff',
    borderRadius: Radius.xl,
    padding: Spacing.md,
  },
  socialProofTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.gray[900], textAlign: 'left' as const },
  socialProofChips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs, marginTop: Spacing.sm },
  socialProofChip: {
    borderWidth: 1,
    borderColor: '#bae6fd',
    backgroundColor: '#fff',
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 5,
  },
  socialProofChipText: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, color: '#0369a1', textAlign: 'left' as const },
  parentContextCard: {
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: '#ddd6fe',
    backgroundColor: '#f5f3ff',
    borderRadius: Radius.xl,
    padding: Spacing.md,
  },
  parentContextLabel: {
    fontSize: 11,
    textAlign: 'left' as const,
    fontWeight: FontWeight.bold,
    color: '#6d28d9',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  parentContextRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginTop: Spacing.sm },
  parentContextName: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: '#4c1d95', textAlign: 'left' as const },
  parentContextHint: { fontSize: FontSize.xs, color: '#6d28d9', marginTop: 4, lineHeight: 18, textAlign: 'left' as const },
  parentContextBtn: {
    borderWidth: 1,
    borderColor: '#c4b5fd',
    backgroundColor: '#fff',
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  parentContextBtnText: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: '#6d28d9', textAlign: 'left' as const },

  joinBtn: { borderRadius: Radius.full, paddingVertical: Spacing.lg, alignItems: 'center', marginTop: Spacing.md },
  joinBtnDefault: { backgroundColor: Colors.brand[600] },
  joinBtnJoined: { backgroundColor: '#f6fef0', borderWidth: 1.5, borderColor: '#86efac' },
  joinBtnInner: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  joinBtnText: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: '#fff', textAlign: 'left' as const },
  joinBtnTextJoined: { color: '#15803d' },
  followBtn: {
    marginTop: Spacing.sm,
    borderRadius: Radius.full,
    paddingVertical: Spacing.md + 4,
    alignItems: 'center',
    borderWidth: 1,
  },
  followBtnIdle: { backgroundColor: '#fff', borderColor: Colors.gray[200] },
  followBtnActive: { backgroundColor: '#f0f9ff', borderColor: '#bae6fd' },
  followBtnText: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.gray[700], textAlign: 'left' as const },
  followBtnTextActive: { color: '#0369a1' },

  // Sections
  section: { paddingHorizontal: Spacing.lg, marginBottom: Spacing['2xl'] },
  sectionHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: Spacing.md, gap: Spacing.md },
  sectionHeaderWrap: { flexWrap: 'wrap' },
  sectionHeaderContent: { flex: 1, minWidth: 0 },
  sectionTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.gray[900], marginBottom: Spacing.md, textAlign: 'left' as const },
  sectionLink: { fontSize: FontSize.sm, color: Colors.brand[600], fontWeight: FontWeight.medium, textAlign: 'left' as const },
  sectionLinkButton: { alignSelf: 'flex-start' },
  sectionEyebrow: {
    fontSize: 11,
    textAlign: 'left' as const,
    fontWeight: FontWeight.bold,
    color: Colors.brand[600],
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  summaryCard: {
    borderRadius: Radius.xl + 4,
    borderWidth: 1,
    borderColor: '#eadfd4',
    backgroundColor: '#f7f0e8',
    padding: Spacing.xl,
    gap: Spacing.md,
    ...Shadow.card,
  },
  summaryHeadline: {
    fontSize: FontSize.xl,
    textAlign: 'left' as const,
    fontWeight: FontWeight.bold,
    color: Colors.gray[900],
    lineHeight: 30,
    maxWidth: 300,
  },
  summaryBody: {
    fontSize: FontSize.sm,
    textAlign: 'left' as const,
    color: Colors.gray[600],
    lineHeight: 22,
    maxWidth: 320,
  },
  summaryMetricsRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    flexWrap: 'wrap',
  },
  summaryMetricCard: {
    minWidth: 92,
    flexGrow: 1,
    borderRadius: Radius.xl,
    backgroundColor: 'rgba(255,255,255,0.72)',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderWidth: 1,
    borderColor: '#efe7df',
  },
  summaryMetricValue: {
    fontSize: FontSize.lg,
    textAlign: 'left' as const,
    fontWeight: FontWeight.bold,
    color: Colors.gray[900],
  },
  summaryMetricLabel: {
    fontSize: FontSize.xs,
    textAlign: 'left' as const,
    color: Colors.gray[500],
    marginTop: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  sectionCard: {
    borderRadius: Radius.xl + 2,
    borderWidth: 1,
    borderColor: '#ede5db',
    backgroundColor: '#faf7f2',
    padding: Spacing.lg,
    ...Shadow.card,
  },
  happeningsSectionCard: {
    backgroundColor: '#f6f2eb',
  },
  accordionCard: {
    borderRadius: Radius.xl + 2,
    borderWidth: 1,
    borderColor: '#e8dfd5',
    backgroundColor: '#f8f4ee',
    overflow: 'hidden',
    ...Shadow.card,
  },
  accordionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
  },
  accordionTitle: {
    fontSize: FontSize.lg,
    textAlign: 'left' as const,
    fontWeight: FontWeight.bold,
    color: Colors.gray[900],
  },
  accordionHint: {
    fontSize: FontSize.xs,
    textAlign: 'left' as const,
    color: Colors.gray[500],
    lineHeight: 18,
    marginTop: 4,
    maxWidth: 290,
  },
  accordionMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  accordionBadge: {
    minWidth: 30,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    borderRadius: Radius.full,
    backgroundColor: '#efe5d8',
    color: Colors.gray[700],
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    textAlign: 'left' as const,
  },
  accordionBody: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.lg,
    gap: Spacing.md,
  },
  moderatorAccordionCard: {
    backgroundColor: '#fff8ee',
    borderColor: '#f3d7b2',
  },
  childrenList: { backgroundColor: '#fff', borderRadius: Radius.xl, overflow: 'hidden', borderWidth: 1, borderColor: '#edeae4', ...Shadow.card },
  childCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md },
  childCardBorder: { borderBottomWidth: 1, borderBottomColor: Colors.gray[100] },
  childBody: { flex: 1 },
  childName: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.gray[900], textAlign: 'left' as const },
  childBadgeRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, flexWrap: 'wrap', marginTop: 6 },
  childBadge: { borderRadius: Radius.full, paddingHorizontal: Spacing.sm, paddingVertical: 4, borderWidth: 1 },
  childBadgeJoined: { backgroundColor: '#f0fdf4', borderColor: '#86efac' },
  childBadgeVerified: { backgroundColor: '#f0f9ff', borderColor: '#bae6fd' },
  childBadgeLevel: { backgroundColor: '#f5f3ff', borderColor: '#ddd6fe' },
  childBadgeText: { fontSize: 10, fontWeight: FontWeight.bold, textAlign: 'left' as const },
  childBadgeTextJoined: { color: '#15803d' },
  childBadgeTextVerified: { color: '#0369a1' },
  childBadgeTextLevel: { color: '#6d28d9' },
  childMeta: { fontSize: FontSize.xs, color: Colors.gray[500], marginTop: 3, textAlign: 'left' as const },
  childJoinBtn: { borderRadius: Radius.full, backgroundColor: Colors.brand[600], paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm },
  childJoinBtnActive: { backgroundColor: '#f0fdf4', borderWidth: 1, borderColor: '#86efac' },
  childJoinText: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: '#fff', textAlign: 'left' as const },
  childJoinTextActive: { color: '#15803d' },

  // Members
  membersList: { backgroundColor: '#fff', borderRadius: Radius.xl, overflow: 'hidden', borderWidth: 1, borderColor: '#edeae4', ...Shadow.card },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md },
  memberRowBorder: { borderBottomWidth: 1, borderBottomColor: Colors.gray[100] },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.brand[100], alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarImg: { width: '100%', height: '100%' },
  avatarInitial: { fontSize: FontSize.base, fontWeight: FontWeight.bold, color: Colors.brand[700], textAlign: 'left' as const },
  memberInfo: { flex: 1 },
  memberName: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.gray[900], textAlign: 'left' as const },
  memberMeta: { fontSize: FontSize.xs, color: Colors.gray[400], marginTop: 2, textAlign: 'left' as const },
  memberAdminMeta: { fontSize: 11, color: Colors.brand[600], marginTop: 3, fontWeight: FontWeight.semibold, textAlign: 'left' as const },
  memberOwnerMeta: { fontSize: 11, color: '#b45309', marginTop: 3, fontWeight: FontWeight.semibold, textAlign: 'left' as const },
  memberActions: { marginLeft: 'auto', gap: Spacing.xs, alignItems: 'flex-end' },
  memberActionChip: {
    borderWidth: 1,
    borderColor: Colors.gray[200],
    backgroundColor: Colors.gray[50],
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    minHeight: 36,
    justifyContent: 'center',
  },
  memberActionChipDanger: { borderColor: '#fecaca', backgroundColor: '#fef2f2' },
  memberActionText: { fontSize: 11, color: Colors.gray[700], fontWeight: FontWeight.semibold, textAlign: 'left' as const },
  memberActionTextDanger: { color: '#b91c1c' },
  adminPanel: { backgroundColor: '#fff7ed', borderRadius: Radius.xl, borderWidth: 1, borderColor: '#fed7aa', padding: Spacing.md, marginBottom: Spacing.md },
  reportsPanel: { backgroundColor: '#fef2f2', borderRadius: Radius.xl, borderWidth: 1, borderColor: '#fecaca', padding: Spacing.md },
  sectionSubInline: { fontSize: FontSize.xs, color: Colors.gray[500], textAlign: 'left' as const },
  emptyPanelText: { fontSize: FontSize.sm, color: Colors.gray[500], textAlign: 'left' as const },
  simplePanelRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.sm },
  simplePanelRowBorder: { borderBottomWidth: 1, borderBottomColor: Colors.gray[200] },
  simplePanelTitle: { fontSize: FontSize.sm, color: Colors.gray[900], fontWeight: FontWeight.semibold, textAlign: 'left' as const },
  simplePanelMeta: { fontSize: FontSize.xs, color: Colors.gray[500], marginTop: 2, textAlign: 'left' as const },

  // Activity
  activityList: { backgroundColor: '#fff', borderRadius: Radius.xl, overflow: 'hidden', borderWidth: 1, borderColor: '#edeae4', ...Shadow.card },
  activityItem: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md },
  activityItemBorder: { borderBottomWidth: 1, borderBottomColor: Colors.gray[100] },
  activityDot: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  activityBody: { flex: 1 },
  activityTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.gray[900], textAlign: 'left' as const },
  activitySub: { fontSize: FontSize.xs, color: Colors.gray[500], marginTop: 1, textAlign: 'left' as const },
  activityDate: { fontSize: 11, color: Colors.gray[400], textAlign: 'left' as const },

  // Events
  eventCard: { backgroundColor: '#fff', borderRadius: Radius.xl, padding: Spacing.md, marginBottom: Spacing.sm, flexDirection: 'row', alignItems: 'center', gap: Spacing.md, borderWidth: 1, borderColor: '#edeae4', ...Shadow.card },
  eventThumb: { width: 68, height: 56, borderRadius: Radius.lg, resizeMode: 'cover' },
  eventThumbEmpty: { backgroundColor: Colors.brand[50], alignItems: 'center', justifyContent: 'center' },
  eventDetails: { flex: 1 },
  eventTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.gray[900], textAlign: 'left' as const },
  eventMeta: { fontSize: FontSize.xs, color: Colors.gray[500], marginTop: 3, textAlign: 'left' as const },
  priceBadge: { backgroundColor: Colors.brand[50], borderRadius: Radius.full, paddingHorizontal: Spacing.sm, paddingVertical: 5 },
  priceBadgeFree: { backgroundColor: '#f0fdf4' },
  priceText: { fontSize: 11, fontWeight: FontWeight.bold, color: Colors.brand[700], textAlign: 'left' as const },
  priceTextFree: { color: '#15803d' },
  loadMoreBtn: { alignItems: 'center', paddingVertical: Spacing.lg },
  loadMoreText: { fontSize: FontSize.sm, color: Colors.brand[600], fontWeight: FontWeight.medium, textAlign: 'left' as const },

  // Section subtitle
  sectionSub: { fontSize: FontSize.xs, color: Colors.gray[400], marginBottom: Spacing.md, textAlign: 'left' as const },

  // Post happening button
  postHappeningBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.brand[600], borderRadius: Radius.full, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 3, minHeight: 36 },
  postHappeningBtnText: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: '#fff', textAlign: 'left' as const },

  // Happenings empty
  happeningsEmpty: { alignItems: 'center', paddingVertical: Spacing['3xl'], paddingHorizontal: Spacing.xl, backgroundColor: Colors.brand[50], borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.brand[100], gap: Spacing.sm },
  happeningsEmptyText: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.gray[700], textAlign: 'left' as const },
  happeningsEmptyHint: { fontSize: FontSize.xs, color: Colors.gray[500], textAlign: 'left' as const, lineHeight: 18 },

  // Happening cards
  happeningsList: { borderRadius: Radius.xl, overflow: 'hidden', borderWidth: 1, borderColor: '#edeae4', ...Shadow.card },
  happeningCard: { padding: Spacing.lg },
  happeningCardBorder: { borderBottomWidth: 1, borderBottomColor: Colors.gray[100] },
  happeningHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.sm },
  happeningAuthorRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  happeningAuthor: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.gray[900], textAlign: 'left' as const },
  happeningTtl: { fontSize: 11, color: Colors.gray[400], marginTop: 1, textAlign: 'left' as const },
  happeningTypeBadge: { width: 30, height: 30, borderRadius: 15, backgroundColor: Colors.gray[100], alignItems: 'center', justifyContent: 'center' },
  happeningTypeText: { fontSize: 14, textAlign: 'left' as const },
  happeningBody: { fontSize: FontSize.sm, color: Colors.gray[800], lineHeight: 21, marginBottom: Spacing.md, textAlign: 'left' as const },
  happeningActions: { flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap' },
  happeningActionBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 2, borderRadius: Radius.lg, backgroundColor: Colors.gray[100], minHeight: 36 },
  happeningActionBtnActive: { backgroundColor: Colors.brand[600] },
  happeningReactActive: { backgroundColor: '#fef9c3' },
  happeningActionText: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, color: Colors.gray[700], textAlign: 'left' as const },
  happeningActionTextActive: { color: '#fff' },
  happeningReactTextActive: { color: '#713f12' },
  happeningLocBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: Spacing.sm },
  happeningLocText: { fontSize: 11, color: Colors.brand[600], textAlign: 'left' as const },
  happeningReportBtn: { marginLeft: 'auto', padding: 6 },

  // Post Happening Modal
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  modalSheet: { backgroundColor: '#fff', borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl, padding: Spacing.xl, paddingBottom: Spacing['3xl'] },
  modalHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: Colors.gray[300], alignSelf: 'center', marginBottom: Spacing.lg },
  modalTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.gray[900], marginBottom: Spacing.lg, textAlign: 'left' as const },
  typeChips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.lg },
  typeChip: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: Radius.full, backgroundColor: Colors.gray[100], borderWidth: 1, borderColor: Colors.gray[200] },
  typeChipActive: { backgroundColor: Colors.brand[600], borderColor: Colors.brand[600] },
  typeChipText: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, color: Colors.gray[700], textAlign: 'left' as const },
  typeChipTextActive: { color: '#fff' },
  postInput: { borderWidth: 1, borderColor: Colors.gray[200], borderRadius: Radius.xl, padding: Spacing.md, fontSize: FontSize.sm, color: Colors.gray[900], minHeight: 100, textAlignVertical: 'top', marginBottom: Spacing.xs, textAlign: 'left' as const },
  charCount: { fontSize: 11, color: Colors.gray[400], textAlign: 'left' as const, marginBottom: Spacing.sm },
  locRow: { marginBottom: Spacing.md },
  locBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: Spacing.sm + 2, paddingVertical: 6, borderRadius: Radius.lg, backgroundColor: Colors.gray[100], borderWidth: 1, borderColor: Colors.gray[200], alignSelf: 'flex-start' },
  locBtnAttached: { backgroundColor: '#f0fdf4', borderColor: '#86efac' },
  locBtnText: { fontSize: 11, color: Colors.gray[600], textAlign: 'left' as const },
  locDenied: { fontSize: 11, color: '#ef4444', textAlign: 'left' as const },
  expiryRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.xl, flexWrap: 'wrap' },
  expiryLabel: { fontSize: FontSize.xs, color: Colors.gray[500], textAlign: 'left' as const },
  expiryChip: { paddingHorizontal: Spacing.sm + 2, paddingVertical: 5, borderRadius: Radius.full, backgroundColor: Colors.gray[100], borderWidth: 1, borderColor: Colors.gray[200] },
  expiryChipActive: { backgroundColor: Colors.brand[100], borderColor: Colors.brand[300] },
  expiryChipText: { fontSize: 11, fontWeight: FontWeight.semibold, color: Colors.gray[600], textAlign: 'left' as const },
  expiryChipTextActive: { color: Colors.brand[700] },
  modalActions: { flexDirection: 'row', gap: Spacing.md },
  modalCancelBtn: { flex: 1, alignItems: 'center', paddingVertical: Spacing.md, borderRadius: Radius.xl, backgroundColor: Colors.gray[100] },
  modalCancelText: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.gray[700], textAlign: 'left' as const },
  modalPostBtn: { flex: 2, alignItems: 'center', paddingVertical: Spacing.md, borderRadius: Radius.xl, backgroundColor: Colors.brand[600] },
  modalPostBtnDisabled: { opacity: 0.5 },
  modalPostText: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: '#fff', textAlign: 'left' as const },
  moderationTargetText: { fontSize: FontSize.sm, color: Colors.gray[600], marginBottom: Spacing.md, textAlign: 'left' as const },
  historyScroll: { maxHeight: 320 },
  historyContent: { gap: Spacing.sm, paddingBottom: Spacing.sm },
  historyCard: { borderRadius: Radius.xl, padding: Spacing.md, borderWidth: 1 },
  historyCardWarning: { backgroundColor: '#fefce8', borderColor: '#fde68a' },
  historyCardDanger: { backgroundColor: '#fef2f2', borderColor: '#fecaca' },
  historyTitle: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.gray[900], textTransform: 'uppercase', textAlign: 'left' as const },
  historyBody: { fontSize: FontSize.sm, color: Colors.gray[800], marginTop: 4, textAlign: 'left' as const },
  historyMeta: { fontSize: FontSize.xs, color: Colors.gray[500], marginTop: 6, textAlign: 'left' as const },
})
