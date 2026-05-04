import { Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { Colors, FontSize, FontWeight, Radius, Shadow, Spacing } from '@/theme'
import type { Community, HappeningType, HappeningWithAuthor } from '@/types/database'
import { PlanBadge } from '@/components/ui/PlanBadge'
import { useLocale } from '@/contexts/locale-context'

export type HappeningDiscoveryItem = HappeningWithAuthor & {
  community: Pick<Community, 'id' | 'name' | 'name_ar' | 'slug' | 'level' | 'cover_url'> & { is_member?: boolean }
  distance_km?: number | null
}

type Props = {
  happening: HappeningDiscoveryItem
  variant?: 'rail'
  onToggleRsvp?: (happening: HappeningDiscoveryItem) => void
  onToggleReact?: (happening: HappeningDiscoveryItem) => void
  onOpenComments?: (happening: HappeningDiscoveryItem) => void
  onShowParticipants?: (happening: HappeningDiscoveryItem) => void
}

const TYPE_META: Record<HappeningType, { label: string; icon: keyof typeof Ionicons.glyphMap; color: string; bg: string }> = {
  open_invite: { label: 'Open invite', icon: 'sparkles-outline', color: '#0f766e', bg: '#ccfbf1' },
  info: { label: 'Update', icon: 'megaphone-outline', color: '#1d4ed8', bg: '#dbeafe' },
  question: { label: 'Ping', icon: 'hand-left-outline', color: '#7c2d12', bg: '#ffedd5' },
  alert: { label: 'Meetup alert', icon: 'location-outline', color: '#b91c1c', bg: '#fee2e2' },
}

function getTimeLeft(expiresAt: string) {
  const ttlMs = new Date(expiresAt).getTime() - Date.now()
  if (ttlMs <= 0) return 'Expired'
  const hours = Math.floor(ttlMs / 3_600_000)
  const minutes = Math.floor((ttlMs % 3_600_000) / 60_000)
  return hours > 0 ? `${hours}h ${minutes}m left` : `${minutes}m left`
}

export function HappeningDiscoveryCard({
  happening,
  variant = 'rail',
  onToggleRsvp,
  onToggleReact,
  onOpenComments,
  onShowParticipants,
}: Props) {
  const router = useRouter()
  const { locale, isRTL } = useLocale()
  const meta = TYPE_META[happening.type]
  const timeLeft = getTimeLeft(happening.expires_at)
  const communityName = locale === 'ar' && happening.community.name_ar ? happening.community.name_ar : happening.community.name
  const textDirStyle = isRTL ? styles.rtlText : styles.ltrText
  const pendingCount = happening.pending_count ?? 0
  const hasParticipants = happening.rsvp_count > 0 || pendingCount > 0
  const joinedLabel = happening.type === 'open_invite'
    ? `${happening.rsvp_count}/${happening.capacity ?? 10} joined`
    : happening.rsvp_count > 0
      ? `${happening.rsvp_count} joined`
      : 'No one joined yet'

  async function openLocation() {
    if (happening.lat === null || happening.lng === null) return
    const url = `https://www.google.com/maps/search/?api=1&query=${happening.lat},${happening.lng}`
    await Linking.openURL(url)
  }

  return (
    <TouchableOpacity
      style={[styles.card, variant === 'rail' && styles.cardRail]}
      activeOpacity={0.86}
      onPress={() => router.push({ pathname: '/communities/[slug]', params: { slug: happening.community.slug } })}
    >
      <View style={styles.topRow}>
        <View style={[styles.typeBadge, { backgroundColor: meta.bg }]}>
          <Ionicons name={meta.icon} size={12} color={meta.color} />
          <Text style={[styles.typeBadgeText, { color: meta.color }, textDirStyle]}>{meta.label}</Text>
        </View>
        {happening.distance_km !== null && happening.distance_km !== undefined ? (
          <Text style={styles.distanceText}>{happening.distance_km} km</Text>
        ) : null}
      </View>

      <TouchableOpacity
        onPress={(e) => {
          e.stopPropagation()
          if (hasParticipants) onShowParticipants?.(happening)
        }}
        activeOpacity={0.72}
        disabled={!hasParticipants}
        style={styles.joinedWidget}
      >
        <View style={styles.joinedRow}>
          <View style={styles.joinedIcon}>
            <Ionicons name="people-outline" size={14} color={Colors.brand[700]} />
          </View>
          <Text style={[styles.joinedText, textDirStyle]} numberOfLines={1}>{joinedLabel}</Text>
          {hasParticipants && (
            <Ionicons name="chevron-forward" size={13} color={Colors.gray[500]} />
          )}
        </View>
        {pendingCount > 0 ? (
          <>
            <View style={styles.joinedSeparator} />
            <View style={styles.joinedRow}>
              <View style={[styles.joinedIcon, styles.pendingIcon]}>
                <Ionicons name="hourglass-outline" size={14} color="#b45309" />
              </View>
              <Text style={[styles.pendingText, textDirStyle]} numberOfLines={1}>
                {pendingCount} pending approval
              </Text>
            </View>
          </>
        ) : null}
      </TouchableOpacity>

      <Text style={[styles.bodyText, textDirStyle]} numberOfLines={4}>{happening.body}</Text>

      <View style={styles.metaRow}>
        <Ionicons name="people-outline" size={12} color={Colors.gray[500]} />
        <Text style={[styles.metaText, textDirStyle]} numberOfLines={1}>{communityName}</Text>
      </View>
      <View style={styles.metaRow}>
        <Ionicons name="time-outline" size={12} color={Colors.gray[500]} />
        <Text style={[styles.metaText, textDirStyle]}>{timeLeft}</Text>
      </View>
      {happening.location_label ? (
        <TouchableOpacity style={styles.metaRow} onPress={openLocation}>
          <Ionicons name="location-outline" size={12} color={Colors.brand[600]} />
          <Text style={[styles.metaText, styles.locationText, textDirStyle]} numberOfLines={1}>{happening.location_label}</Text>
        </TouchableOpacity>
      ) : null}

      <View style={styles.footer}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: Spacing.sm }}>
          <Text style={[styles.authorText, { marginBottom: 0 }, textDirStyle]} numberOfLines={1}>
            {happening.author.display_name}
          </Text>
          <PlanBadge planId={happening.author.plan_id} size={13} />
        </View>
        <View style={styles.actions}>
          <TouchableOpacity
            onPress={() => onOpenComments?.(happening)}
            style={styles.actionBtn}
          >
            <Text style={styles.actionText}>Chat</Text>
          </TouchableOpacity>
          {(() => {
            const isPending = happening.user_rsvp_status === 'pending'
            const isJoined  = happening.user_has_rsvp || happening.user_rsvp_status === 'approved'
            const capacity  = happening.capacity ?? 10
            const isFull    = happening.type === 'open_invite' && !happening.requires_approval && happening.rsvp_count >= capacity && !isJoined && !isPending
            return (
              <TouchableOpacity
                onPress={() => !isFull && onToggleRsvp?.(happening)}
                disabled={isFull}
                style={[
                  styles.actionBtn,
                  isJoined && styles.actionBtnActive,
                  isPending && styles.actionBtnPending,
                  isFull && styles.actionBtnDisabled,
                ]}
              >
                <Text style={[
                  styles.actionText,
                  isJoined && styles.actionTextActive,
                  isPending && styles.actionTextPending,
                ]}>
                  {isJoined ? `In - ${happening.rsvp_count}` : isPending ? 'Pending' : isFull ? 'Full' : `Join - ${happening.rsvp_count}`}
                </Text>
              </TouchableOpacity>
            )
          })()}
          <TouchableOpacity
            onPress={() => onToggleReact?.(happening)}
            style={[styles.actionBtn, happening.user_has_reacted && styles.reactBtnActive]}
          >
            <Text style={[styles.actionText, happening.user_has_reacted && styles.reactTextActive]}>
              Like - {happening.reaction_count}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  rtlText: { textAlign: 'right', writingDirection: 'rtl' },
  ltrText: { textAlign: 'left', writingDirection: 'ltr' },
  card: {
    backgroundColor: '#f8fffe',
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    borderColor: '#99f6e4',
    padding: Spacing.md,
    ...Shadow.card,
  },
  cardRail: {
    width: 268,
    marginRight: Spacing.md,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
  },
  typeBadgeText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
  },
  distanceText: {
    fontSize: FontSize.xs,
    color: Colors.gray[500],
    fontWeight: FontWeight.medium,
  },
  bodyText: {
    fontSize: FontSize.sm,
    color: Colors.gray[900],
    lineHeight: 20,
    fontWeight: FontWeight.semibold,
  },
  joinedWidget: {
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: '#ccfbf1',
    backgroundColor: Colors.white,
    marginBottom: Spacing.sm,
    overflow: 'hidden',
  },
  joinedRow: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 7,
  },
  joinedIcon: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.brand[50],
  },
  pendingIcon: {
    backgroundColor: '#fffbeb',
  },
  joinedText: {
    flex: 1,
    fontSize: 11,
    color: Colors.gray[700],
    fontWeight: FontWeight.semibold,
  },
  pendingText: {
    flex: 1,
    fontSize: 11,
    color: '#b45309',
    fontWeight: FontWeight.semibold,
  },
  joinedSeparator: {
    height: 1,
    backgroundColor: Colors.gray[100],
    marginHorizontal: Spacing.sm,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: Spacing.xs,
  },
  metaText: {
    flex: 1,
    fontSize: FontSize.xs,
    color: Colors.gray[500],
  },
  locationText: {
    color: Colors.brand[700],
  },
  footer: {
    marginTop: Spacing.md,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: '#d1fae5',
  },
  authorText: {
    fontSize: FontSize.xs,
    color: Colors.gray[600],
    marginBottom: Spacing.sm,
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.xs,
  },
  actionBtn: {
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.gray[200],
    backgroundColor: Colors.white,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
  },
  actionBtnActive: {
    borderColor: Colors.brand[500],
    backgroundColor: Colors.brand[50],
  },
  actionBtnPending: {
    borderColor: '#f59e0b',
    backgroundColor: '#fffbeb',
  },
  actionBtnDisabled: {
    opacity: 0.5,
  },
  actionTextPending: {
    color: '#b45309',
  },
  reactBtnActive: {
    borderColor: '#0f766e',
    backgroundColor: '#ccfbf1',
  },
  actionText: {
    fontSize: 11,
    color: Colors.gray[600],
    fontWeight: FontWeight.semibold,
  },
  actionTextActive: {
    color: Colors.brand[700],
  },
  reactTextActive: {
    color: '#0f766e',
  },
})
